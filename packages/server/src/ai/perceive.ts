import {
    distance,
    GameTime,
    projectResources,
    RELATION_RANGE,
    resourceRatePerHour,
    warehouseCapacity,
} from '@medival/shared';
import { eq } from 'drizzle-orm';
import { buildQueue, players, villages } from '../db/schema.js';
import { freeMerchantCapacity } from '../engine/trade.js';
import type { World } from '../engine/world.js';
import type { VillageSnapshot } from './decide/build.js';
import type { TradePartner } from './decide/trade.js';
import {
    type BotState,
    BotStateSchema,
    EMPTY_BOT_STATE,
} from './intents.js';
import {
    type Difficulty,
    DifficultySchema,
    type Personality,
    PersonalitySchema,
} from './personalities.js';

/**
 * Wahrnehmung: ein Lesevorgang pro Tick, danach kein Datenbankzugriff mehr
 * (plans/15-bot-grundgeruest.md).
 *
 * Der Snapshot ist bewusst flach und ohne Verhalten — ein Datenobjekt, das
 * sich in einem Test als Literal hinschreiben lässt. Sobald er Methoden
 * bekäme, wäre genau dieser Gewinn dahin.
 */
export interface BotSnapshot {
    playerId: number;
    personality: Personality;
    difficulty: Difficulty;
    state: BotState;
    villages: VillageSnapshot[];
    /**
     * Mögliche Handelspartner in Reichweite, samt eigener Haltung zu ihnen
     * (plans/16-ansehen-und-handel.md). Ferne Spieler fehlen bewusst: Die
     * Entfernungsdämpfung macht eine Lieferung dorthin wirkungslos, und die
     * Liste soll nicht mit Aussichtslosem gefüllt werden.
     */
    partners: TradePartner[];
}

/**
 * Wie weit ein Bot für Handel schaut. Beim Vierfachen von `RELATION_RANGE`
 * liegt der Einfluss bei 6 % — darüber lohnt sich keine Fahrt mehr.
 */
const PARTNER_RANGE = RELATION_RANGE * 4;

export function perceiveBot(
    world: World,
    playerId: number,
): BotSnapshot | null {
    const player = world.db
        .select()
        .from(players)
        .where(eq(players.id, playerId))
        .all()[0];
    if (!player || !player.isBot) return null;

    const owned = world.db
        .select()
        .from(villages)
        .where(eq(villages.playerId, playerId))
        .all();
    // Ein Bot ohne Dörfer ist aus dem Spiel — die Kette endet.
    if (owned.length === 0) return null;

    const now = world.now();
    const snapshots: VillageSnapshot[] = owned.map((v) => {
        const levels = world.getBuildingLevels(v.id);
        const capacity = warehouseCapacity(levels.warehouse);
        const speed = world.settings.speed;
        const queue = world.db
            .select()
            .from(buildQueue)
            .where(eq(buildQueue.villageId, v.id))
            .all();
        // Was schon eingereiht ist, zählt für die Zielstufe mit.
        const plannedLevels = { ...levels };
        for (const q of queue) {
            plannedLevels[q.buildingType] = Math.max(
                plannedLevels[q.buildingType],
                q.targetLevel,
            );
        }
        return {
            id: v.id,
            levels,
            plannedLevels,
            // Nicht `settleResources`: Wahrnehmung liest, sie schreibt nicht.
            // Der Wert wird beim Bauen ohnehin frisch abgerechnet.
            resources: projectResources(
                { wood: v.wood, clay: v.clay, iron: v.iron },
                levels,
                capacity,
                GameTime.between(v.resourcesUpdatedAt, now),
                speed,
            ),
            ratesPerHour: {
                wood: resourceRatePerHour(levels.timber_camp, speed),
                clay: resourceRatePerHour(levels.clay_pit, speed),
                iron: resourceRatePerHour(levels.iron_mine, speed),
            },
            capacity,
            popInUse: world.popInUse(v.id, levels),
            queueLength: queue.length,
            merchantsFree: freeMerchantCapacity(world, v.id),
        };
    });

    return {
        playerId,
        personality: PersonalitySchema.parse(player.personality),
        difficulty: DifficultySchema.parse(player.difficulty),
        state: readBotState(player.aiState),
        villages: snapshots,
        partners: perceivePartners(world, playerId, owned, now),
    };
}

/** Nachbarn anderer Spieler in Reichweite, mit der eigenen Haltung zu ihnen. */
function perceivePartners(
    world: World,
    playerId: number,
    owned: { x: number; y: number }[],
    now: GameTime,
): TradePartner[] {
    const others = world.db
        .select({
            id: villages.id,
            playerId: villages.playerId,
            x: villages.x,
            y: villages.y,
        })
        .from(villages)
        .all()
        .filter((v) => v.playerId !== null && v.playerId !== playerId);

    // Je Spieler nur das nächstgelegene Dorf — mehr braucht die Entscheidung
    // nicht, und die Liste bleibt kurz.
    const nearest = new Map<number, TradePartner>();
    for (const v of others) {
        if (v.playerId === null) continue;
        let best = Number.POSITIVE_INFINITY;
        for (const home of owned) {
            best = Math.min(best, distance(home.x, home.y, v.x, v.y));
        }
        if (best > PARTNER_RANGE) continue;
        const known = nearest.get(v.playerId);
        if (known && known.distance <= best) continue;
        nearest.set(v.playerId, {
            playerId: v.playerId,
            villageId: v.id,
            standing: world.settleStanding(playerId, v.playerId, now),
            distance: best,
        });
    }
    return [...nearest.values()];
}

/**
 * `ai_state_json` kommt aus der Datenbank und damit möglicherweise aus einer
 * älteren Programmversion — also parsen statt casten (Plan 08). Ein kaputter
 * Eintrag setzt den Bot zurück, statt den Tick zu sprengen.
 */
export function readBotState(raw: string): BotState {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ...EMPTY_BOT_STATE, savingFor: {} };
    }
    const result = BotStateSchema.safeParse(parsed);
    return result.success
        ? result.data
        : { ...EMPTY_BOT_STATE, savingFor: {} };
}

export function writeBotState(
    world: World,
    playerId: number,
    state: BotState,
): void {
    world.db
        .update(players)
        .set({ aiState: JSON.stringify(state) })
        .where(eq(players.id, playerId))
        .run();
}

/** Alle Bot-Spieler einer Welt. */
export function botPlayerIds(world: World): number[] {
    return world.db
        .select({ id: players.id, isBot: players.isBot })
        .from(players)
        .all()
        .filter((p) => p.isBot)
        .map((p) => p.id);
}
