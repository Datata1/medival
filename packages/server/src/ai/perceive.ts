import {
    distance,
    GameTime,
    projectResources,
    RELATION_RANGE,
    resourceRatePerHour,
    type Units,
    warehouseCapacity,
    effectiveStanding as withTribeModifier,
} from '@medival/shared';
import {
    and,
    asc,
    between,
    eq,
    gt,
    gte,
    inArray,
    ne,
} from 'drizzle-orm';
import {
    buildQueue,
    movements,
    players,
    recruitQueue,
    tribeInvitations,
    tribes,
    villages,
} from '../db/schema.js';
import { freeMerchantCapacity } from '../engine/trade.js';
import type { World } from '../engine/world.js';
import type { VillageSnapshot } from './decide/build.js';
import type {
    FoundingCandidate,
    Invitation,
} from './decide/diplomacy.js';
import type { AttackTarget, DistressCall } from './decide/military.js';
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

    const social = perceiveSocial(world, playerId, owned, now);
    return {
        playerId,
        personality: PersonalitySchema.parse(player.personality),
        difficulty: DifficultySchema.parse(player.difficulty),
        state: readBotState(player.aiState),
        villages: snapshots,
        partners: social.partners,
        targets: social.targets,
        distressCalls: perceiveDistress(world, playerId, social, now),
        invitations: perceiveInvitations(world, playerId, social, now),
        foundingCandidates: social.foundingCandidates,
        tribeId: social.myTribe,
        gameTime: now,
        unitSpeed: world.settings.unitSpeed,
        speed: world.settings.speed,
    };
}

/**
 * Was ein Bot über andere weiß — einmal je Tick gelesen
 * (plans/19-prototyp/19-5).
 *
 * Vorher las jede Teilwahrnehmung die ganze Welt selbst: alle Dörfer für die
 * Ziele, alle Dörfer für die Handelspartner, jeden Spieler samt seiner Dörfer
 * für die Stammesgründung, und für jedes Paar `settleStanding` mit
 * Schreibzugriff. Gemessen: 72 % der gesamten Rechenzeit je Event steckten
 * hier. Jetzt sind es vier Abfragen — Spieler, Ansehen in beide Richtungen,
 * Dörfer im Umkreis —, aus denen Ziele, Partner und Gründungskandidaten in
 * JavaScript abgeleitet werden.
 */
interface Social {
    myTribe: number | null;
    tribeOf: (playerId: number) => number | null;
    /** Wirksames Ansehen: was dieser Bot von `other` hält. */
    standingTowards: (other: number) => number;
    targets: AttackTarget[];
    partners: TradePartner[];
    foundingCandidates: FoundingCandidate[];
}

function perceiveSocial(
    world: World,
    playerId: number,
    owned: { id: number; x: number; y: number }[],
    now: GameTime,
): Social {
    /*
     * Stämme nur der Spieler in der Nähe — mitgelesen in der Umkreis-Abfrage
     * unten. Vorher wurden bei jedem Tick alle Spieler der Welt geladen, und
     * die Kosten wuchsen mit der Weltgröße statt mit der Nachbarschaft.
     * Wer außerhalb liegt (etwa der Gründer einer Einladung), wird einzeln
     * nachgeschlagen.
     */
    const tribes = new Map<number, number | null>();
    const tribeOf = (id: number): number | null => {
        const known = tribes.get(id);
        if (known !== undefined) return known;
        const row = world.db
            .select({ tribeId: players.tribeId })
            .from(players)
            .where(eq(players.id, id))
            .all()[0];
        const tribeId = row?.tribeId ?? null;
        tribes.set(id, tribeId);
        return tribeId;
    };
    const myTribe = tribeOf(playerId);
    const { towards, from } = world.standingsOf(playerId, now);
    const standingTowards = (other: number) =>
        other === playerId
            ? 0
            : withTribeModifier(
                  towards.get(other) ?? 0,
                  myTribe,
                  tribeOf(other),
              );
    const standingFrom = (other: number) =>
        other === playerId
            ? 0
            : withTribeModifier(
                  from.get(other) ?? 0,
                  tribeOf(other),
                  myTribe,
              );

    /*
     * Ein Rechteck um alle eigenen Dörfer, um die größte Reichweite
     * erweitert. Was außerhalb liegt, ist von jedem eigenen Dorf weiter
     * entfernt als jede Reichweite und kann nichts beitragen. Nach `id`
     * sortiert: Bei gleicher Entfernung entscheidet wie vorher das zuerst
     * angelegte Dorf.
     */
    const reach = Math.max(PARTNER_RANGE, ATTACK_RANGE);
    const nearby = villagesInBoxWithTribe(
        world,
        Math.min(...owned.map((v) => v.x)) - reach,
        Math.min(...owned.map((v) => v.y)) - reach,
        Math.max(...owned.map((v) => v.x)) + reach,
        Math.max(...owned.map((v) => v.y)) + reach,
    )
        .filter((v) => {
            if (v.playerId !== null) tribes.set(v.playerId, v.tribeId);
            return v.playerId !== playerId;
        })
        .sort((a, b) => a.id - b.id)
        .map((v) => {
            let dist = Number.POSITIVE_INFINITY;
            for (const home of owned)
                dist = Math.min(
                    dist,
                    distance(home.x, home.y, v.x, v.y),
                );
            return { ...v, dist };
        });

    // Ziele: auch Barbarendörfer — folgenlose Ziele und der Grund, warum in
    // einer friedlichen Welt überhaupt gekämpft wird.
    const targets: AttackTarget[] = nearby
        .filter((v) => v.dist <= ATTACK_RANGE)
        .map((v) => ({
            villageId: v.id,
            ownerId: v.playerId,
            x: v.x,
            y: v.y,
            points: v.points,
            // Barbarendörfer haben keinen Besitzer und damit keine Haltung.
            standing:
                v.playerId === null ? 0 : standingTowards(v.playerId),
            ...estimateDefense(v.points),
        }));

    // Je Spieler das nächstgelegene Dorf und die kürzeste Entfernung.
    const nearestByPlayer = new Map<number, { dist: number }>();
    for (const v of nearby) {
        if (v.playerId === null) continue;
        const known = nearestByPlayer.get(v.playerId);
        if (known && known.dist <= v.dist) continue;
        nearestByPlayer.set(v.playerId, { dist: v.dist });
    }

    // Empfänger, an die dieser Bot gerade liefert (19-4).
    const ownedIds = owned.map((v) => v.id);
    const busy = new Set<number>();
    for (const m of world.db
        .select({ target: villages.playerId })
        .from(movements)
        .innerJoin(villages, eq(villages.id, movements.targetVillageId))
        .where(
            and(
                eq(movements.kind, 'trade'),
                inArray(movements.originVillageId, ownedIds),
            ),
        )
        .all()) {
        if (m.target !== null) busy.add(m.target);
    }

    /*
     * Handelspartner: je Spieler das nächste Dorf in Reichweite. Ein Spieler
     * behält dabei die Position seines ersten Dorfes in Reichweite, auch wenn
     * ein späteres näher liegt — so war die Reihenfolge vor 19-5, und bei
     * gleicher Bewertung entscheidet sie.
     */
    const partnerMap = new Map<number, TradePartner>();
    for (const v of nearby) {
        if (v.playerId === null || v.dist > PARTNER_RANGE) continue;
        const known = partnerMap.get(v.playerId);
        if (known && known.distance <= v.dist) continue;
        partnerMap.set(v.playerId, {
            playerId: v.playerId,
            villageId: v.id,
            // Roh, ohne Stammes-Sockel — wie vor 19-5.
            standing: towards.get(v.playerId) ?? 0,
            distance: v.dist,
            shipmentInFlight: busy.has(v.playerId),
        });
    }
    const partners = [...partnerMap.values()];

    // Gründungskandidaten: nach Spieler-ID, kürzeste Entfernung.
    const foundingCandidates: FoundingCandidate[] = [];
    for (const [other, near] of [...nearestByPlayer].sort(
        (a, b) => a[0] - b[0],
    )) {
        if (near.dist > PARTNER_RANGE) continue;
        foundingCandidates.push({
            playerId: other,
            standing: standingTowards(other),
            theirStanding: standingFrom(other),
            distance: near.dist,
            inTribe: tribeOf(other) !== null,
        });
    }
    return {
        myTribe,
        tribeOf,
        standingTowards,
        targets,
        partners,
        foundingCandidates,
    };
}

/** Dörfer im Rechteck samt Stamm ihres Besitzers, eine Abfrage. */
function villagesInBoxWithTribe(
    world: World,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
) {
    return world.db
        .select({
            id: villages.id,
            playerId: villages.playerId,
            x: villages.x,
            y: villages.y,
            points: villages.points,
            tribeId: players.tribeId,
        })
        .from(villages)
        .leftJoin(players, eq(players.id, villages.playerId))
        .where(
            and(
                between(villages.x, Math.floor(x0), Math.ceil(x1)),
                between(villages.y, Math.floor(y0), Math.ceil(y1)),
            ),
        )
        .all();
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

/**
 * Stammesmitglieder mit eingehendem Angriff — eine Abfrage statt eines
 * Vollscans aller Bewegungen mit einer Abfrage je Bewegung (19-5).
 */
function perceiveDistress(
    world: World,
    playerId: number,
    social: Social,
    now: GameTime,
): DistressCall[] {
    if (social.myTribe === null) return [];
    return world.db
        .select({
            villageId: villages.id,
            x: villages.x,
            y: villages.y,
            arrivalGameTime: movements.arrivalGameTime,
        })
        .from(movements)
        .innerJoin(villages, eq(villages.id, movements.targetVillageId))
        .innerJoin(players, eq(players.id, villages.playerId))
        .where(
            and(
                eq(movements.kind, 'attack'),
                gt(movements.arrivalGameTime, now),
                eq(players.tribeId, social.myTribe),
                ne(players.id, playerId),
            ),
        )
        .orderBy(asc(movements.id))
        .all();
}

/**
 * Offene Einladungen. Abgelaufene werden übergangen statt gelöscht — die
 * Wahrnehmung schreibt nicht (19-5); aufgeräumt wird beim Annehmen.
 */
function perceiveInvitations(
    world: World,
    playerId: number,
    social: Social,
    now: GameTime,
): Invitation[] {
    return world.db
        .select({
            tribeId: tribeInvitations.tribeId,
            founderId: tribes.founderId,
        })
        .from(tribeInvitations)
        .leftJoin(tribes, eq(tribes.id, tribeInvitations.tribeId))
        .where(
            and(
                eq(tribeInvitations.playerId, playerId),
                gte(tribeInvitations.expiresGameTime, now),
            ),
        )
        .orderBy(asc(tribeInvitations.id))
        .all()
        .map((row) => {
            const inviterId = row.founderId ?? 0;
            return {
                tribeId: row.tribeId,
                inviterId,
                standing:
                    inviterId > 0
                        ? social.standingTowards(inviterId)
                        : 0,
            };
        });
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
