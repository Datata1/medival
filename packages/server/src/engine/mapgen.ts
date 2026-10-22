import {
    BUILDING_ORDER,
    type BuildingLevels,
    createRng,
    PLAYER_ID,
    pickRandom,
    placeVillage,
    type Rng,
    randInt,
    STARTING_BUILDINGS,
    STARTING_RESOURCES,
    spacedIsFree,
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

/**
 * Legt ein Dorf mit allen Gebäudezeilen an. Exportiert für die Test-Builder
 * (plans/19-prototyp/19-1) — Testdörfer entstehen über denselben Weg wie
 * Kartendörfer, sonst fehlt ihnen beim nächsten neuen Gebäudetyp eine Zeile.
 */
export function insertVillage(
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

/**
 * Eine neue Welt füllen: Mensch, Bots und Barbaren — kreisförmig von der
 * Mitte aus (plans/19-prototyp/19-6). Liefert die Zahl der platzierten
 * Dörfer; sie wird als `settled_count` gespeichert, damit spätere
 * Ansiedlungen (`settleNewPlayer`) am Rand weitermachen.
 */
export function generateMap(
    db: BetterSQLite3Database<Record<string, unknown>>,
    settings: WorldSettings,
    rng: Rng,
): number {
    const size = settings.mapSize;
    const seed = settings.seed;
    /*
     * Die Bauplätze bekommen einen eigenen Zufallsstrom.
     *
     * Sonst kostete jeder abgelehnte Platz einen Wurf aus `rng`, und jede
     * Änderung an der Platzsuche gäbe jedem Bot eine andere Persönlichkeit.
     * Getrennte Ströme halten unabhängige Entscheidungen unabhängig.
     */
    const placeRng = createRng(seed ^ 0x504c_4143);
    const taken = new Set<string>();
    const isFree = spacedIsFree((x, y) => taken.has(`${x},${y}`));
    let n = 0;
    const place = () => {
        const spot = placeVillage({
            n,
            density: settings.settlementDensity,
            mapSize: size,
            rng: placeRng,
            seed,
            isFree,
        });
        taken.add(`${spot.x},${spot.y}`);
        n++;
        return spot;
    };

    /*
     * Erst alles aus `rng` ziehen — in derselben Reihenfolge wie vor 19-6
     * (Persönlichkeiten, dann Barbarenstufen und -garnisonen) —, dann
     * platzieren. So ändert die neue Platzierung nichts daran, wer welche
     * Persönlichkeit hat.
     */
    const bots = Array.from({ length: settings.botCount }, (_, i) => ({
        personality: pickRandom(rng, BOT_PERSONALITIES),
        name: `${BOT_NAMES[i % BOT_NAMES.length]}${i >= BOT_NAMES.length ? ` ${Math.floor(i / BOT_NAMES.length) + 1}` : ''}`,
    }));
    const barbarians = Array.from(
        { length: settings.barbarianCount },
        () => rollBarbarian(rng),
    );

    // Das erste Dorf steht in der Mitte. Bis 19-9 gehört es dem Menschen.
    db.insert(players)
        .values({ id: PLAYER_ID, name: 'Spieler', isBot: false })
        .run();
    const home = place();
    insertVillage(db, PLAYER_ID, home.x, home.y, 'Heimatdorf', {
        ...STARTING_BUILDINGS,
    });

    const botIds = bots.map(
        (bot) =>
            firstOrThrow(
                db
                    .insert(players)
                    .values({
                        name: bot.name,
                        isBot: true,
                        personality: bot.personality,
                        difficulty: 'normal',
                    })
                    .returning({ id: players.id })
                    .all(),
                'internal',
            ).id,
    );

    /*
     * Bots und Barbaren verzahnt platzieren, gleichmäßig über den Kreis
     * verteilt — sonst lägen alle Barbaren außen um die Bots herum (oder
     * innen, je nach Reihenfolge).
     */
    const total = bots.length + barbarians.length;
    let nextBot = 0;
    let nextBarbarian = 0;
    for (let k = 0; k < total; k++) {
        const isBot =
            bots.length > 0 &&
            Math.floor(((k + 1) * bots.length) / total) >
                Math.floor((k * bots.length) / total);
        const spot = place();
        const bot = isBot ? bots[nextBot] : undefined;
        const botId = isBot ? botIds[nextBot] : undefined;
        if (bot && botId !== undefined) {
            nextBot++;
            insertVillage(
                db,
                botId,
                spot.x,
                spot.y,
                `${bot.name}s Dorf`,
                {
                    ...STARTING_BUILDINGS,
                },
            );
            continue;
        }
        const barbarian = barbarians[nextBarbarian++];
        if (barbarian) insertBarbarian(db, spot, barbarian);
    }
    return n;
}

export interface BarbarianSpec {
    levels: BuildingLevels;
    spear: number;
    sword: number;
}

/** Ausstattung eines Barbarendorfs würfeln — vier Würfe für Stufen, zwei für Truppen. */
export function rollBarbarian(rng: Rng): BarbarianSpec {
    return {
        // Modest resource buildings so early farming pays off.
        levels: {
            ...STARTING_BUILDINGS,
            timber_camp: randInt(rng, 2, 6),
            clay_pit: randInt(rng, 2, 6),
            iron_mine: randInt(rng, 1, 5),
            warehouse: randInt(rng, 1, 4),
        },
        // A token garrison so farming isn't entirely free.
        spear: randInt(rng, 3, 25),
        sword: randInt(rng, 0, 12),
    };
}

export function insertBarbarian(
    db: BetterSQLite3Database<Record<string, unknown>>,
    spot: { x: number; y: number },
    spec: BarbarianSpec,
): number {
    const id = insertVillage(
        db,
        null,
        spot.x,
        spot.y,
        'Barbarendorf',
        spec.levels,
    );
    db.insert(units)
        .values([
            { villageId: id, unitType: 'spear', countHome: spec.spear },
            { villageId: id, unitType: 'sword', countHome: spec.sword },
        ])
        .run();
    return id;
}
