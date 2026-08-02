import {
    BUILDING_ORDER,
    type BuildingLevels,
    PLAYER_ID,
    pickRandom,
    type Rng,
    randInt,
    STARTING_BUILDINGS,
    STARTING_RESOURCES,
    villagePoints,
    type WorldSettings,
} from '@medival/shared';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { firstOrThrow } from '../db/parse.js';
import { buildings, players, units, villages } from '../db/schema.js';

const BOT_PERSONALITIES = [
    'turtle',
    'raider',
    'expander',
    'balanced',
] as const;

const BOT_NAMES = [
    'Ragnar',
    'Edda',
    'Wulfric',
    'Isolde',
    'Baldur',
    'Gisela',
    'Hakon',
    'Mathilde',
    'Sigurd',
    'Adelheid',
    'Falko',
    'Brunhild',
    'Leif',
    'Ottilie',
    'Torben',
    'Frieda',
    'Gunnar',
    'Hedwig',
    'Ivar',
    'Klara',
    'Njord',
    'Runa',
    'Sten',
    'Thora',
    'Ulf',
    'Verena',
    'Wido',
    'Ylva',
    'Arvid',
    'Bertha',
    'Corvin',
    'Dagmar',
];

function pickFreeSpot(
    rng: Rng,
    size: number,
    taken: Set<string>,
    minDistFromCenter: number,
): { x: number; y: number } {
    const cx = Math.floor(size / 2);
    const cy = Math.floor(size / 2);
    for (let i = 0; i < 10_000; i++) {
        const x = randInt(rng, 1, size - 2);
        const y = randInt(rng, 1, size - 2);
        const key = `${x},${y}`;
        if (taken.has(key)) continue;
        if (Math.hypot(x - cx, y - cy) < minDistFromCenter) continue;
        taken.add(key);
        return { x, y };
    }
    throw new Error('Map too crowded: could not place village');
}

function insertVillage(
    db: BetterSQLite3Database<Record<string, unknown>>,
    playerId: number | null,
    x: number,
    y: number,
    name: string,
    levels: BuildingLevels,
): number {
    const row = firstOrThrow(
        db
            .insert(villages)
            .values({
                playerId,
                x,
                y,
                name,
                wood: STARTING_RESOURCES.wood,
                clay: STARTING_RESOURCES.clay,
                iron: STARTING_RESOURCES.iron,
                resourcesUpdatedAt: 0,
                points: villagePoints(levels),
            })
            .returning({ id: villages.id })
            .all(),
        'internal',
    );
    db.insert(buildings)
        .values(
            BUILDING_ORDER.map((type) => ({
                villageId: row.id,
                type,
                level: levels[type],
            })),
        )
        .run();
    return row.id;
}

/** Populate a fresh world DB: player, bots, and barbarian villages. */
export function generateMap(
    db: BetterSQLite3Database<Record<string, unknown>>,
    settings: WorldSettings,
    rng: Rng,
): void {
    const size = settings.mapSize;
    const taken = new Set<string>();
    const center = Math.floor(size / 2);
    taken.add(`${center},${center}`);

    db.insert(players)
        .values({ id: PLAYER_ID, name: 'Spieler', isBot: false })
        .run();
    insertVillage(db, PLAYER_ID, center, center, 'Heimatdorf', {
        ...STARTING_BUILDINGS,
    });

    for (let i = 0; i < settings.botCount; i++) {
        const personality = pickRandom(rng, BOT_PERSONALITIES);
        const name = `${BOT_NAMES[i % BOT_NAMES.length]}${i >= BOT_NAMES.length ? ` ${Math.floor(i / BOT_NAMES.length) + 1}` : ''}`;
        const bot = firstOrThrow(
            db
                .insert(players)
                .values({
                    name,
                    isBot: true,
                    personality,
                    difficulty: 'normal',
                })
                .returning({ id: players.id })
                .all(),
            'internal',
        );
        const spot = pickFreeSpot(rng, size, taken, 8);
        insertVillage(db, bot.id, spot.x, spot.y, `${name}s Dorf`, {
            ...STARTING_BUILDINGS,
        });
    }

    for (let i = 0; i < settings.barbarianCount; i++) {
        const spot = pickFreeSpot(rng, size, taken, 3);
        // Barbarian villages have modest resource buildings so early farming pays off.
        const levels: BuildingLevels = {
            ...STARTING_BUILDINGS,
            timber_camp: randInt(rng, 2, 6),
            clay_pit: randInt(rng, 2, 6),
            iron_mine: randInt(rng, 1, 5),
            warehouse: randInt(rng, 1, 4),
        };
        const id = insertVillage(
            db,
            null,
            spot.x,
            spot.y,
            'Barbarendorf',
            levels,
        );
        // A token garrison so farming isn't entirely free.
        db.insert(units)
            .values([
                {
                    villageId: id,
                    unitType: 'spear',
                    countHome: randInt(rng, 3, 25),
                },
                {
                    villageId: id,
                    unitType: 'sword',
                    countHome: randInt(rng, 0, 12),
                },
            ])
            .run();
    }
}
