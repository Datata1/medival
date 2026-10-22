// Testorakel für 19-5: die Wahrnehmung vor dem Umbau, unverändert. Wird nach
// dem Ticket gelöscht (plans/19-prototyp/19-5).
import {
    distance,
    GameTime,
    projectResources,
    RELATION_RANGE,
    resourceRatePerHour,
    type Units,
    warehouseCapacity,
} from '@medival/shared';
import { eq } from 'drizzle-orm';
import type { VillageSnapshot } from '../../../src/ai/decide/build.js';
import type {
    FoundingCandidate,
    Invitation,
} from '../../../src/ai/decide/diplomacy.js';
import type {
    AttackTarget,
    DistressCall,
} from '../../../src/ai/decide/military.js';
import type { TradePartner } from '../../../src/ai/decide/trade.js';
import {
    type BotState,
    BotStateSchema,
    EMPTY_BOT_STATE,
} from '../../../src/ai/intents.js';
import {
    type Difficulty,
    DifficultySchema,
    type Personality,
    PersonalitySchema,
} from '../../../src/ai/personalities.js';
import {
    buildQueue,
    movements,
    players,
    recruitQueue,
    tribeInvitations,
    tribes,
    villages,
} from '../../../src/db/schema.js';
import { freeMerchantCapacity } from '../../../src/engine/trade.js';
import {
    pruneInvitations,
    tribeOf,
} from '../../../src/engine/tribes.js';
import type { World } from '../../../src/engine/world.js';

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
    /** Feindliche Nachbardörfer in Reichweite (Plan 17). */
    targets: AttackTarget[];
    /** Bedrängte Stammesmitglieder (Plan 17). */
    distressCalls: DistressCall[];
    /** Offene Einladungen an diesen Bot. */
    invitations: Invitation[];
    /** Mögliche Mitgründer eines Stammes. */
    foundingCandidates: FoundingCandidate[];
    tribeId: number | null;
    gameTime: number;
    unitSpeed: number;
    /** Weltgeschwindigkeit — für Denkintervalle in Spielzeit (19-4). */
    speed: number;
}

/**
 * Wie weit ein Bot für Handel schaut. Beim Vierfachen von `RELATION_RANGE`
 * liegt der Einfluss bei 6 % — darüber lohnt sich keine Fahrt mehr.
 */
const PARTNER_RANGE = RELATION_RANGE * 4;

/** Wie weit ein Bot für Angriffe schaut — Marschzeit begrenzt den Rest. */
const ATTACK_RANGE = RELATION_RANGE * 2;

export function perceiveBot(
    world: World,
    playerId: number,
): BotSnapshot | null {
    const player = world.db
        .select()
        .from(players)
        .where(eq(players.id, playerId))
        .all()[0];
    if (!player?.isBot) return null;

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
            x: v.x,
            y: v.y,
            units: world.getUnits(v.id),
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
            queueFreeAt:
                queue.length === 0
                    ? null
                    : Math.min(...queue.map((q) => q.completesAt)),
            merchantsFree: freeMerchantCapacity(world, v.id),
            recruiting:
                world.db
                    .select({ id: recruitQueue.id })
                    .from(recruitQueue)
                    .where(eq(recruitQueue.villageId, v.id))
                    .all().length > 0,
        };
    });

    return {
        playerId,
        personality: PersonalitySchema.parse(player.personality),
        difficulty: DifficultySchema.parse(player.difficulty),
        state: readBotState(player.aiState),
        villages: snapshots,
        partners: perceivePartners(world, playerId, owned, now),
        targets: perceiveTargets(world, playerId, owned, now),
        distressCalls: perceiveDistress(world, playerId, now),
        invitations: perceiveInvitations(world, playerId, now),
        foundingCandidates: perceiveFounding(
            world,
            playerId,
            owned,
            now,
        ),
        tribeId: tribeOf(world, playerId),
        gameTime: now,
        unitSpeed: world.settings.unitSpeed,
        speed: world.settings.speed,
    };
}

/**
 * Feindliche Dörfer in Reichweite.
 *
 * Die Verteidigung wird **geschätzt**, nicht abgelesen: Der Bot leitet sie aus
 * den Punkten des Ziels ab. Ein Bot mit Röntgenblick trifft perfekte
 * Entscheidungen und ist als Gegner uninteressant (plans/17).
 */
function perceiveTargets(
    world: World,
    playerId: number,
    owned: { x: number; y: number }[],
    now: GameTime,
): AttackTarget[] {
    const out: AttackTarget[] = [];
    const rows = world.db
        .select({
            id: villages.id,
            playerId: villages.playerId,
            x: villages.x,
            y: villages.y,
            points: villages.points,
        })
        .from(villages)
        .all();

    for (const v of rows) {
        // Barbarendörfer bleiben drin: Sie sind folgenlose Ziele und der
        // Grund, warum in einer friedlichen Welt überhaupt gekämpft wird.
        if (v.playerId === playerId) continue;
        let dist = Number.POSITIVE_INFINITY;
        for (const home of owned)
            dist = Math.min(dist, distance(home.x, home.y, v.x, v.y));
        if (dist > ATTACK_RANGE) continue;
        out.push({
            villageId: v.id,
            ownerId: v.playerId,
            x: v.x,
            y: v.y,
            points: v.points,
            // Barbarendörfer haben keinen Besitzer und damit keine Haltung.
            standing:
                v.playerId === null
                    ? 0
                    : world.effectiveStanding(
                          playerId,
                          v.playerId,
                          now,
                      ),
            ...estimateDefense(v.points),
        });
    }
    return out;
}

/**
 * Grobe Verteidigungsschätzung allein aus den Punkten eines Dorfes — das ist
 * alles, was ein Bot von außen sehen kann.
 */
function estimateDefense(points: number): {
    estimatedDefense: Units;
    estimatedWall: number;
} {
    const scale = Math.max(0, points) / 100;
    return {
        estimatedDefense: {
            spear: Math.round(scale * 12),
            sword: Math.round(scale * 8),
        },
        estimatedWall: Math.min(20, Math.floor(scale)),
    };
}

/** Stammesmitglieder mit eingehendem Angriff. */
function perceiveDistress(
    world: World,
    playerId: number,
    now: GameTime,
): DistressCall[] {
    const tribeId = tribeOf(world, playerId);
    if (tribeId === null) return [];

    const mates = world.db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.tribeId, tribeId))
        .all()
        .filter((p) => p.id !== playerId)
        .map((p) => p.id);
    if (mates.length === 0) return [];

    const out: DistressCall[] = [];
    for (const m of world.db.select().from(movements).all()) {
        if (m.kind !== 'attack') continue;
        if (m.arrivalGameTime <= now) continue;
        const target = world.db
            .select({
                id: villages.id,
                playerId: villages.playerId,
                x: villages.x,
                y: villages.y,
            })
            .from(villages)
            .where(eq(villages.id, m.targetVillageId))
            .all()[0];
        if (!target || target.playerId === null) continue;
        if (!mates.includes(target.playerId)) continue;
        out.push({
            villageId: target.id,
            x: target.x,
            y: target.y,
            arrivalGameTime: m.arrivalGameTime,
        });
    }
    return out;
}

function perceiveInvitations(
    world: World,
    playerId: number,
    now: GameTime,
): Invitation[] {
    pruneInvitations(world);
    return world.db
        .select()
        .from(tribeInvitations)
        .where(eq(tribeInvitations.playerId, playerId))
        .all()
        .map((row) => {
            const founder = world.db
                .select({ founderId: tribes.founderId })
                .from(tribes)
                .where(eq(tribes.id, row.tribeId))
                .all()[0];
            const inviterId = founder?.founderId ?? 0;
            return {
                tribeId: row.tribeId,
                inviterId,
                standing:
                    inviterId > 0
                        ? world.effectiveStanding(
                              playerId,
                              inviterId,
                              now,
                          )
                        : 0,
            };
        });
}

/** Wer als Mitgründer eines Stammes in Frage kommt. */
function perceiveFounding(
    world: World,
    playerId: number,
    owned: { x: number; y: number }[],
    now: GameTime,
): FoundingCandidate[] {
    const out: FoundingCandidate[] = [];
    const others = world.db
        .select({ id: players.id, tribeId: players.tribeId })
        .from(players)
        .all()
        .filter((p) => p.id !== playerId);

    for (const other of others) {
        const theirVillages = world.db
            .select({ x: villages.x, y: villages.y })
            .from(villages)
            .where(eq(villages.playerId, other.id))
            .all();
        if (theirVillages.length === 0) continue;
        let dist = Number.POSITIVE_INFINITY;
        for (const home of owned)
            for (const v of theirVillages)
                dist = Math.min(
                    dist,
                    distance(home.x, home.y, v.x, v.y),
                );
        if (dist > PARTNER_RANGE) continue;
        out.push({
            playerId: other.id,
            standing: world.effectiveStanding(playerId, other.id, now),
            theirStanding: world.effectiveStanding(
                other.id,
                playerId,
                now,
            ),
            distance: dist,
            inTribe: other.tribeId !== null,
        });
    }
    return out;
}

/** Nachbarn anderer Spieler in Reichweite, mit der eigenen Haltung zu ihnen. */
function perceivePartners(
    world: World,
    playerId: number,
    owned: { id: number; x: number; y: number }[],
    now: GameTime,
): TradePartner[] {
    // Empfänger, an die dieser Bot gerade liefert (19-4).
    const ownedIds = new Set(owned.map((v) => v.id));
    const busy = new Set<number>();
    for (const m of world.db
        .select({
            origin: movements.originVillageId,
            target: villages.playerId,
        })
        .from(movements)
        .innerJoin(villages, eq(villages.id, movements.targetVillageId))
        .where(eq(movements.kind, 'trade'))
        .all()) {
        if (ownedIds.has(m.origin) && m.target !== null)
            busy.add(m.target);
    }

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
            shipmentInFlight: busy.has(v.playerId),
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
