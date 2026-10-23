import {
    amountAtRate,
    applyRelationEvent,
    BUILDINGS,
    type BuildingLevels,
    type BuildingType,
    buildCost,
    buildingLevelsFrom,
    buildTime,
    canAfford,
    createStatefulRng,
    Duration,
    decayStanding,
    EVENT_SCHEMAS,
    entriesOf,
    farmCapacity,
    GameTime,
    LOYALTY_REGEN_PER_HOUR,
    marketCapacity,
    projectResources,
    type RelationEvent,
    type Resources,
    requirementsMet,
    resourceRatePerHour,
    type StatefulRng,
    singleEntry,
    totalBuildingPop,
    type Units,
    UnitsSchema,
    unitPop,
    villagePoints,
    type WorldSettings,
    warehouseCapacity,
    effectiveStanding as withTribeModifier,
} from '@medival/shared';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { handleBarbarianTick } from '../ai/barbarian.js';
import { handleBotTick, wakeBot } from '../ai/bot.js';
import {
    firstOrThrow,
    parseJsonColumn,
    parseRow,
} from '../db/parse.js';
import {
    buildings,
    buildQueue,
    movements,
    players,
    recruitQueue,
    relations,
    units,
    villages,
} from '../db/schema.js';
import { GameClock } from './clock.js';
import { GameError } from './errors.js';
import {
    handleArrival,
    handleRecruitDone,
    handleRecruitTick,
    settleRecruits,
} from './military.js';
import {
    getResearch,
    getResearched,
    handleResearchComplete,
} from './research.js';
import { type GameEvent, Scheduler } from './scheduler.js';
import { freeMerchantCapacity } from './trade.js';
import { tribeOf } from './tribes.js';

export { GameError } from './errors.js';

export interface WorldMeta {
    id: number;
    name: string;
    seed: number;
    settings: WorldSettings;
    status: 'running' | 'paused' | 'ended';
    gameTimeMs: number;
    rngState: number;
    /** Wanduhrzeit, zu der die Spielzeit 0 war; `null` vor 19-3. */
    epochZeroMs: number | null;
    /**
     * Wie viele Dörfer seit Weltbeginn platziert wurden (19-6). Ein Zähler,
     * keine Zählung: Eroberte oder verlassene Dörfer verkleinern den
     * Siedlungskreis nicht — er wächst nur nach außen.
     */
    settledCount: number;
}

export type MetaPatch = Partial<
    Pick<
        WorldMeta,
        | 'status'
        | 'gameTimeMs'
        | 'rngState'
        | 'epochZeroMs'
        | 'settledCount'
    >
>;

export type WorldMessage = Record<string, unknown> & { type: string };

/** Empfänger einer Nachricht: bestimmte Spieler oder alle (19-9). */
type Recipients = Set<number> | 'all';

interface Subscriber {
    playerId: number | null;
    fn: (msg: WorldMessage) => void;
}

function mergeRecipients(a: Recipients, b: Recipients): Recipients {
    if (a === 'all' || b === 'all') return 'all';
    return new Set([...a, ...b]);
}

const BUILD_QUEUE_LIMIT = 5;

/**
 * So viele Events holt `catchUp` vor einem Befehl höchstens synchron nach.
 * Bei ~1 ms je Event sind das rund eine Sekunde — mehr darf eine einzelne
 * Anfrage nicht blockieren.
 */
const CATCH_UP_LIMIT = 1_000;

export class World {
    readonly id: number;
    readonly name: string;
    readonly settings: WorldSettings;
    status: WorldMeta['status'];
    /** Siehe `WorldMeta.settledCount`. */
    settledCount: number;
    readonly clock: GameClock;
    readonly scheduler: Scheduler;
    readonly rng: StatefulRng;
    /** Vorbereitete Abfragen, siehe Konstruktor. */
    readonly q;
    /** Abonnenten mit ihrem Spieler (19-9); `null` = sieht nur Öffentliches. */
    private readonly subscribers = new Set<Subscriber>();
    /** Gebündelte Nachrichten bis zum nächsten Event-Loop-Durchlauf. */
    private readonly pendingMessages = new Map<
        string,
        { msg: WorldMessage; to: Recipients }
    >();
    private flushScheduled = false;
    /**
     * Fälligkeit des Events, das gerade verarbeitet wird — `null` außerhalb
     * der Event-Verarbeitung. Siehe `now()`.
     */
    private eventTime: GameTime | null = null;

    constructor(
        meta: WorldMeta,
        readonly sqlite: SqliteDatabase,
        readonly db: BetterSQLite3Database<Record<string, unknown>>,
        private readonly persistMeta: (patch: MetaPatch) => void,
    ) {
        this.id = meta.id;
        this.name = meta.name;
        this.settings = meta.settings;
        this.status = meta.status;
        this.settledCount = meta.settledCount;
        this.clock = new GameClock(
            meta.gameTimeMs,
            meta.status === 'running',
            meta.epochZeroMs,
        );
        this.rng = createStatefulRng(meta.rngState || meta.seed || 1);
        /*
         * Vorbereitete Abfragen für die heißesten Lesepfade (19-5): Diese
         * laufen bei fast jedem Event mehrfach. Vor `processDue` angelegt,
         * weil schon das erste Nachholen sie braucht.
         */
        const byVillage = sql.placeholder('villageId');
        this.q = {
            buildings: db
                .select()
                .from(buildings)
                .where(eq(buildings.villageId, byVillage))
                .prepare(),
            units: db
                .select()
                .from(units)
                .where(eq(units.villageId, byVillage))
                .prepare(),
            village: db
                .select()
                .from(villages)
                .where(eq(villages.id, byVillage))
                .prepare(),
            travelingUnits: db
                .select({ unitsJson: movements.unitsJson })
                .from(movements)
                .where(eq(movements.originVillageId, byVillage))
                .prepare(),
            recruits: db
                .select()
                .from(recruitQueue)
                .where(eq(recruitQueue.villageId, byVillage))
                .orderBy(asc(recruitQueue.id))
                .prepare(),
            addUnits: sqlite.prepare(
                `INSERT INTO units (village_id, unit_type, count_home) VALUES (?, ?, ?)
                 ON CONFLICT(village_id, unit_type) DO UPDATE SET count_home = count_home + excluded.count_home`,
            ),
        };
        this.scheduler = new Scheduler(
            db,
            this.clock,
            (ev) => this.handleEvent(ev),
            (ev, err) =>
                console.error(
                    `[world ${meta.id}] event ${ev.type}#${ev.id} failed:`,
                    err,
                ),
        );
        if (this.status === 'running') this.scheduler.processDue();
    }

    /**
     * Der Zeitpunkt, zu dem gerade gerechnet wird.
     *
     * Während ein Event verarbeitet wird, ist das seine **Fälligkeit**, nicht
     * die Uhr (plans/19-prototyp/19-2). Feuert der Timer 15 ms zu spät oder
     * holt die Welt nach einem Neustart Stunden nach, rechnet jeder Handler —
     * und jedes Kommando, das er auslöst — trotzdem mit dem richtigen
     * Zeitpunkt: Rohstoffe, Rückkehrzeiten und der nächste Bot-Tick hängen am
     * Zeitstempel des Events, nicht daran, wann Node dazu kam. Das ersetzt
     * einen `at`-Parameter in jedem Handler, den ein neuer Handler vergessen
     * könnte.
     */
    now(): GameTime {
        return (
            this.eventTime ?? GameTime.of(Math.floor(this.clock.now()))
        );
    }

    /**
     * Holt alle bis jetzt fälligen Events nach — vor jedem Befehl und jedem
     * Lesezugriff von außen (plans/19-prototyp/19-2).
     *
     * Der Timer feuert „frühestens dann", ein Event kann also schon fällig,
     * aber noch nicht verarbeitet sein. Ohne Nachholen sähe ein Befehl einen
     * Zustand von vor diesem Event: ein Gebäude auf der alten Stufe, Truppen,
     * die laut Zeitstempel längst angegriffen wurden. Weil better-sqlite3
     * synchron ist und Node einen Thread hat, kommt zwischen Nachholen und
     * Befehl nichts dazwischen.
     *
     * Ein großer Rückstand (Neustart nach Stunden) wird **nicht** synchron
     * abgearbeitet; das übernimmt der Batch-Catch-up aus Plan 03. Bis dahin
     * meldet die Welt `catching_up`.
     */
    catchUp(): void {
        if (this.scheduler.isProcessing) return;
        const now = this.now();
        const done = this.scheduler.drainUntil(now, CATCH_UP_LIMIT);
        if (done < CATCH_UP_LIMIT) return;
        const next = this.scheduler.nextDue();
        if (next !== null && next <= now)
            throw new GameError('catching_up');
    }

    // ── lifecycle ──────────────────────────────────────────────────────

    pause(): void {
        if (!this.clock.running) return;
        this.clock.pause();
        this.scheduler.stop();
        if (this.status === 'running') this.status = 'paused';
        this.persist();
        this.broadcast({
            type: 'world_status',
            status: this.status,
            gameTime: this.now(),
        });
    }

    resume(): void {
        if (this.clock.running || this.status === 'ended') return;
        this.status = 'running';
        this.clock.resume();
        this.persist();
        this.scheduler.processDue();
        this.broadcast({
            type: 'world_status',
            status: this.status,
            gameTime: this.now(),
        });
    }

    persist(): void {
        this.persistMeta({
            status: this.status,
            gameTimeMs: this.now(),
            rngState: this.rng.state,
            epochZeroMs: this.clock.epochZeroMs,
            settledCount: this.settledCount,
        });
    }

    /**
     * Vorspulen — nur im Entwicklermodus erreichbar (19-3). Verschiebt den
     * Nullpunkt der Uhr; alles dazwischen Fällige wird in Batches
     * nachgeholt wie nach einem Neustart.
     */
    devSkip(d: Duration): void {
        this.clock.skip(d);
        this.persist();
        this.scheduler.processDue();
        this.broadcast({
            type: 'world_status',
            status: this.status,
            gameTime: this.now(),
        });
    }

    close(): void {
        // Nullpunkt vor dem Anhalten lesen: Die Welt läuft an der Wanduhr
        // weiter, auch während der Server aus ist (19-3).
        const epochZeroMs = this.clock.running
            ? this.clock.epochZeroMs
            : null;
        this.clock.pause();
        this.scheduler.dispose();
        this.pendingMessages.clear();
        this.persistMeta({
            gameTimeMs: this.now(),
            rngState: this.rng.state,
            epochZeroMs,
        });
        this.sqlite.close();
    }

    // ── pub/sub ────────────────────────────────────────────────────────

    /**
     * Ein Live-Kanal für einen Spieler (19-9). Er bekommt Nachrichten, die
     * ihn betreffen, und öffentliche — nicht die Truppenbewegungen und
     * Dorfänderungen anderer.
     */
    subscribe(
        playerId: number | null,
        fn: (msg: WorldMessage) => void,
    ): () => void {
        const subscriber = { playerId, fn };
        this.subscribers.add(subscriber);
        return () => this.subscribers.delete(subscriber);
    }

    /**
     * Nachricht an die Betroffenen — **gebündelt** (plans/19-prototyp/19-2)
     * und **gefiltert** (19-9).
     *
     * Wen eine Nachricht betrifft, entscheidet `recipientsOf` an einer
     * Stelle, statt dass jede Aufrufstelle Empfänger nennt: Dorfnachrichten
     * gehen an den Besitzer, Bewegungen an beide Seiten, Berichte an den
     * Empfänger, Stammesnachrichten an die Mitglieder, alles andere an alle.
     * Die Empfänger werden beim Einreihen bestimmt — nach einer Eroberung
     * erfährt der alte Besitzer noch davon.
     *
     * Gesendet wird im nächsten Event-Loop-Durchlauf, gleiche Nachrichten nur
     * einmal. Ohne Abonnenten (Tests, Welten ohne offenen Client) wird gar
     * nichts vorgemerkt.
     */
    broadcast(msg: WorldMessage): void {
        if (this.subscribers.size === 0) return;
        const key = JSON.stringify(msg);
        const to = this.recipientsOf(msg);
        const known = this.pendingMessages.get(key);
        this.pendingMessages.set(key, {
            msg,
            to: known ? mergeRecipients(known.to, to) : to,
        });
        if (this.flushScheduled) return;
        this.flushScheduled = true;
        setImmediate(() => this.flushMessages());
    }

    private recipientsOf(msg: WorldMessage): Recipients {
        const ownerOf = (id: unknown): number[] => {
            if (typeof id !== 'number') return [];
            const owner = this.q.village.all({ villageId: id })[0]
                ?.playerId;
            return owner == null ? [] : [owner];
        };
        if (msg.type === 'report' && typeof msg.playerId === 'number')
            return new Set([msg.playerId]);
        if (msg.type === 'tribe' && typeof msg.tribeId === 'number')
            return new Set(
                this.db
                    .select({ id: players.id })
                    .from(players)
                    .where(eq(players.tribeId, msg.tribeId))
                    .all()
                    .map((p) => p.id),
            );
        if ('villageId' in msg) return new Set(ownerOf(msg.villageId));
        if ('originVillageId' in msg || 'targetVillageId' in msg)
            return new Set([
                ...ownerOf(msg.originVillageId),
                ...ownerOf(msg.targetVillageId),
            ]);
        return 'all';
    }

    private flushMessages(): void {
        this.flushScheduled = false;
        const messages = [...this.pendingMessages.values()];
        this.pendingMessages.clear();
        for (const { msg, to } of messages)
            for (const { playerId, fn } of this.subscribers)
                if (
                    to === 'all' ||
                    (playerId !== null && to.has(playerId))
                )
                    fn(msg);
    }

    // ── queries ────────────────────────────────────────────────────────

    getBuildingLevels(villageId: number): BuildingLevels {
        return buildingLevelsFrom(this.q.buildings.all({ villageId }));
    }

    getUnits(villageId: number): Units {
        // Was in der Kaserne inzwischen fertig ist, zählt mit (19-2).
        settleRecruits(this, villageId);
        const rows = this.q.units.all({ villageId });
        const result: Units = {};
        for (const r of rows)
            if (r.countHome > 0) result[r.unitType] = r.countHome;
        return result;
    }

    getVillageRow(villageId: number) {
        return firstOrThrow(
            this.q.village.all({ villageId }),
            'village_not_found',
        );
    }

    /** Add (or subtract, with negative counts) units in a village. */
    addUnits(villageId: number, delta: Units): void {
        for (const [type, n] of entriesOf(delta)) {
            if (!n) continue;
            this.q.addUnits.run(villageId, type, n);
        }
    }

    /**
     * Lazy loyalty regeneration, mirroring the lazy resource model.
     * Scales with unitSpeed (not speed): loyalty interacts with march times,
     * so it must regenerate on the same timescale as troop movements.
     */
    settleLoyalty(villageId: number, now = this.now()): number {
        const v = this.getVillageRow(villageId);
        const elapsed = GameTime.between(v.loyaltyUpdatedAt, now);
        const regen = amountAtRate(
            this.settings.unitSpeed * LOYALTY_REGEN_PER_HOUR,
            elapsed,
        );
        const loyalty = Math.min(100, v.loyalty + regen);
        this.db
            .update(villages)
            .set({
                loyalty,
                loyaltyUpdatedAt: GameTime.max(
                    now,
                    GameTime.of(v.loyaltyUpdatedAt),
                ),
            })
            .where(eq(villages.id, villageId))
            .run();
        return loyalty;
    }

    /**
     * Ansehen faul abrechnen — das dritte Glied neben `settleResources` und
     * `settleLoyalty` (plans/16-ansehen-und-handel.md).
     *
     * Kein Tick: Bei 31 Spielern gäbe es bis zu 930 Paare, die regelmäßig
     * gegen null gezogen werden müssten. Stattdessen wird beim Zugriff
     * gerechnet. Eine Beziehung, die niemand abfragt, kostet nichts.
     */
    settleStanding(
        playerId: number,
        otherPlayerId: number,
        now = this.now(),
    ): number {
        if (playerId === otherPlayerId) return 0;
        const row = this.db
            .select()
            .from(relations)
            .where(
                and(
                    eq(relations.playerId, playerId),
                    eq(relations.otherPlayerId, otherPlayerId),
                ),
            )
            .all()[0];
        if (!row) return 0; // keine Zeile heißt: neutral

        const standing = decayStanding(
            row.standing,
            GameTime.between(row.updatedAt, now),
        );
        this.db
            .update(relations)
            .set({
                standing,
                updatedAt: GameTime.max(
                    now,
                    GameTime.of(row.updatedAt),
                ),
            })
            .where(
                and(
                    eq(relations.playerId, playerId),
                    eq(relations.otherPlayerId, otherPlayerId),
                ),
            )
            .run();
        return standing;
    }

    /**
     * Das Ansehen eines Spielers in beide Richtungen, auf einmal und **ohne
     * Zurückschreiben** (plans/19-prototyp/19-5).
     *
     * `towards`: was `playerId` von anderen hält; `from`: was andere von ihm
     * halten. Roh, ohne Stammes-Sockel. Für die Wahrnehmung der Bots — vorher
     * rief sie `settleStanding` je Paar auf: eine Abfrage und ein Schreibzugriff
     * für jedes Nachbarpaar bei jedem Tick. Weil der Verfall eine reine
     * Funktion der Zeit ist, ergibt Lesen ohne Schreiben denselben Wert.
     */
    standingsOf(
        playerId: number,
        now = this.now(),
    ): { towards: Map<number, number>; from: Map<number, number> } {
        const towards = new Map<number, number>();
        const from = new Map<number, number>();
        for (const row of this.db
            .select()
            .from(relations)
            .where(
                or(
                    eq(relations.playerId, playerId),
                    eq(relations.otherPlayerId, playerId),
                ),
            )
            .all()) {
            const standing = decayStanding(
                row.standing,
                GameTime.between(row.updatedAt, now),
            );
            if (row.playerId === playerId)
                towards.set(row.otherPlayerId, standing);
            else from.set(row.playerId, standing);
        }
        return { towards, from };
    }

    /**
     * Das *wirksame* Ansehen: gespeicherter Wert plus Stammes-Sockel
     * (plans/17-staemme-und-krieg.md). Haltungen und Entscheidungen arbeiten
     * mit diesem Wert; `settleStanding` liefert den rohen.
     */
    effectiveStanding(
        playerId: number,
        otherPlayerId: number,
        now = this.now(),
    ): number {
        return withTribeModifier(
            this.settleStanding(playerId, otherPlayerId, now),
            tribeOf(this, playerId),
            tribeOf(this, otherPlayerId),
        );
    }

    /**
     * Verschiebt das Ansehen, das `playerId` gegenüber `otherPlayerId` hat.
     *
     * Barbaren (`playerId === null`) haben keine Meinung — Aufrufe mit `null`
     * verpuffen, statt eine Zeile für einen nicht existierenden Spieler
     * anzulegen.
     */
    adjustStanding(
        playerId: number | null,
        otherPlayerId: number | null,
        event: RelationEvent,
        distance: number,
        now = this.now(),
    ): void {
        if (
            playerId === null ||
            otherPlayerId === null ||
            playerId === otherPlayerId
        )
            return;
        const current = this.settleStanding(
            playerId,
            otherPlayerId,
            now,
        );
        const next = applyRelationEvent(
            current,
            Duration.zero, // schon abgerechnet
            event,
            distance,
        );
        this.sqlite
            .prepare(
                `INSERT INTO relations (player_id, other_player_id, standing, updated_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(player_id, other_player_id)
                 DO UPDATE SET standing = excluded.standing, updated_at = excluded.updated_at`,
            )
            .run(playerId, otherPlayerId, next, now);
    }

    /**
     * Settle lazy resources: project stored values to `now` and write back.
     * Returns current resources. Call before any read or spend.
     */
    settleResources(villageId: number, now = this.now()): Resources {
        const v = this.db
            .select()
            .from(villages)
            .where(eq(villages.id, villageId))
            .all()[0];
        if (!v) throw new GameError('village_not_found');
        const levels = this.getBuildingLevels(villageId);
        const capacity = warehouseCapacity(levels.warehouse);
        const projected = projectResources(
            { wood: v.wood, clay: v.clay, iron: v.iron },
            levels,
            capacity,
            GameTime.between(v.resourcesUpdatedAt, now),
            this.settings.speed,
        );
        this.db
            .update(villages)
            .set({
                ...projected,
                resourcesUpdatedAt: GameTime.max(
                    now,
                    GameTime.of(v.resourcesUpdatedAt),
                ),
            })
            .where(eq(villages.id, villageId))
            .run();
        return projected;
    }

    villageView(villageId: number) {
        const v = this.db
            .select()
            .from(villages)
            .where(eq(villages.id, villageId))
            .all()[0];
        if (!v) throw new GameError('village_not_found');
        const now = this.now();
        const levels = this.getBuildingLevels(villageId);
        const capacity = warehouseCapacity(levels.warehouse);
        const resources = projectResources(
            { wood: v.wood, clay: v.clay, iron: v.iron },
            levels,
            capacity,
            GameTime.between(v.resourcesUpdatedAt, now),
            this.settings.speed,
        );
        const queue = this.db
            .select()
            .from(buildQueue)
            .where(eq(buildQueue.villageId, villageId))
            .orderBy(asc(buildQueue.completesAt))
            .all();
        // Erst abrechnen (getUnits), dann die Schleife lesen — sonst zeigt
        // die Ansicht Aufträge, die laut Zeit schon fertig sind.
        const unitCounts = this.getUnits(villageId);
        const recruits = this.db
            .select()
            .from(recruitQueue)
            .where(eq(recruitQueue.villageId, villageId))
            .orderBy(asc(recruitQueue.id))
            .all();
        return {
            id: v.id,
            playerId: v.playerId,
            name: v.name,
            x: v.x,
            y: v.y,
            loyalty: v.loyalty,
            points: v.points,
            gameTime: now,
            resources,
            capacity,
            rates: {
                wood: resourceRatePerHour(
                    levels.timber_camp,
                    this.settings.speed,
                ),
                clay: resourceRatePerHour(
                    levels.clay_pit,
                    this.settings.speed,
                ),
                iron: resourceRatePerHour(
                    levels.iron_mine,
                    this.settings.speed,
                ),
            },
            buildings: levels,
            buildQueue: queue,
            // API-Form unverändert: `nextUnitDoneAt` ist der Zeitpunkt der
            // nächsten fertigen Einheit, 0 für wartende Aufträge.
            recruitQueue: recruits.map(({ startedAt, ...q }) => ({
                ...q,
                nextUnitDoneAt:
                    startedAt === null
                        ? 0
                        : GameTime.add(
                              GameTime.of(startedAt),
                              q.perUnitMs,
                          ),
            })),
            units: unitCounts,
            researched: getResearched(this, villageId),
            research: getResearch(this, villageId),
            popUsed: this.popInUse(villageId, levels),
            popMax: farmCapacity(levels.farm),
            merchantCapacity: marketCapacity(levels.market),
            merchantsFree: freeMerchantCapacity(this, villageId),
        };
    }

    /**
     * Farm population in use: buildings + units at home + units traveling
     * (owned by this village as origin) + units still in the recruit queue.
     */
    popInUse(
        villageId: number,
        levels = this.getBuildingLevels(villageId),
    ): number {
        let pop =
            totalBuildingPop(levels) +
            unitPop(this.getUnits(villageId));
        const traveling = this.q.travelingUnits.all({ villageId });
        for (const m of traveling)
            pop += unitPop(
                parseJsonColumn(
                    UnitsSchema,
                    m.unitsJson,
                    'movement.units',
                ),
            );
        const queued = this.q.recruits.all({ villageId });
        for (const q of queued)
            pop += unitPop(singleEntry(q.unitType, q.count));
        return pop;
    }

    // ── commands ───────────────────────────────────────────────────────

    upgradeBuilding(villageId: number, type: BuildingType): void {
        if (!BUILDINGS[type]) throw new GameError('invalid_building');
        const now = this.now();
        this.sqlite.transaction(() => {
            const levels = this.getBuildingLevels(villageId);
            const queue = this.db
                .select()
                .from(buildQueue)
                .where(eq(buildQueue.villageId, villageId))
                .orderBy(asc(buildQueue.completesAt))
                .all();
            if (queue.length >= BUILD_QUEUE_LIMIT)
                throw new GameError('queue_full');

            // Effective levels include what is already queued.
            const effLevels = { ...levels };
            for (const q of queue) {
                effLevels[q.buildingType] = Math.max(
                    effLevels[q.buildingType],
                    q.targetLevel,
                );
            }
            const targetLevel = effLevels[type] + 1;
            if (targetLevel > BUILDINGS[type].maxLevel)
                throw new GameError('max_level');
            if (!requirementsMet(type, levels))
                throw new GameError('requirements_missing');

            if (type !== 'farm') {
                const popAfter =
                    totalBuildingPop({
                        ...effLevels,
                        [type]: targetLevel,
                    }) + unitPop(this.getUnits(villageId));
                if (popAfter > farmCapacity(effLevels.farm))
                    throw new GameError('farm_too_small');
            }

            const cost = buildCost(type, targetLevel);
            const have = this.settleResources(villageId, now);
            if (!canAfford(have, cost))
                throw new GameError('not_enough_resources');
            this.db
                .update(villages)
                .set({
                    wood: have.wood - cost.wood,
                    clay: have.clay - cost.clay,
                    iron: have.iron - cost.iron,
                })
                .where(eq(villages.id, villageId))
                .run();

            const lastQueued = queue.at(-1);
            const start = lastQueued
                ? GameTime.max(GameTime.of(lastQueued.completesAt), now)
                : now;
            const completesAt = GameTime.add(
                start,
                buildTime(
                    type,
                    targetLevel,
                    levels.headquarters,
                    this.settings.speed,
                ),
            );
            const row = firstOrThrow(
                this.db
                    .insert(buildQueue)
                    .values({
                        villageId,
                        buildingType: type,
                        targetLevel,
                        completesAt,
                    })
                    .returning({ id: buildQueue.id })
                    .all(),
                'internal',
            );
            this.scheduler.insert('build_complete', completesAt, {
                villageId,
                queueId: row.id,
            });
        })();
        this.broadcast({ type: 'village_updated', villageId });
    }

    // ── event handlers ─────────────────────────────────────────────────

    private handleEvent(ev: GameEvent): void {
        this.eventTime = ev.dueGameTime;
        try {
            this.dispatchEvent(ev);
        } finally {
            this.eventTime = null;
        }
    }

    private dispatchEvent(ev: GameEvent): void {
        // Payloads werden geparst statt gecastet: Events überleben Neustarts
        // und damit Programmversionen (plans/08-no-typecasting.md). Ein Event,
        // das nicht zum Schema passt, wirft hier und wird vom Scheduler
        // isoliert geloggt, statt später als undefined-Folgefehler aufzuschlagen.
        switch (ev.type) {
            case 'build_complete':
                this.onBuildComplete(
                    parseRow(
                        EVENT_SCHEMAS.build_complete,
                        ev.payload,
                        'event.build_complete',
                    ),
                );
                break;
            case 'recruit_tick':
                handleRecruitTick(
                    this,
                    parseRow(
                        EVENT_SCHEMAS.recruit_tick,
                        ev.payload,
                        'event.recruit_tick',
                    ),
                );
                break;
            case 'recruit_done':
                handleRecruitDone(
                    this,
                    parseRow(
                        EVENT_SCHEMAS.recruit_done,
                        ev.payload,
                        'event.recruit_done',
                    ),
                );
                break;
            case 'research_complete':
                handleResearchComplete(
                    this,
                    parseRow(
                        EVENT_SCHEMAS.research_complete,
                        ev.payload,
                        'event.research_complete',
                    ),
                );
                break;
            case 'arrival':
                handleArrival(
                    this,
                    parseRow(
                        EVENT_SCHEMAS.arrival,
                        ev.payload,
                        'event.arrival',
                    ),
                );
                break;
            case 'barbarian_tick':
                handleBarbarianTick(
                    this,
                    parseRow(
                        EVENT_SCHEMAS.barbarian_tick,
                        ev.payload,
                        'event.barbarian_tick',
                    ),
                );
                break;
            case 'bot_tick':
                handleBotTick(
                    this,
                    parseRow(
                        EVENT_SCHEMAS.bot_tick,
                        ev.payload,
                        'event.bot_tick',
                    ),
                );
                break;
            default:
                // Unknown events are dropped; future milestones add handlers here.
                break;
        }
        /*
         * Kein `persist()` mehr je Event (plans/19-prototyp/19-2): Es schrieb
         * bei jedem Event Uhr und Zufallszustand in die Meta-DB. Das
         * 15-s-Intervall im WorldManager und pause/close genügen — die Events
         * selbst liegen in der Welt-DB und gehen nicht verloren.
         */
    }

    private onBuildComplete(payload: {
        villageId: number;
        queueId: number;
    }): void {
        const { villageId, queueId } = payload;
        this.sqlite.transaction(() => {
            const item = this.db
                .select()
                .from(buildQueue)
                .where(eq(buildQueue.id, queueId))
                .all()[0];
            if (!item) return; // cancelled or stale
            this.db
                .delete(buildQueue)
                .where(eq(buildQueue.id, queueId))
                .run();
            // Settle resources at the old production rate before the level bump.
            this.settleResources(
                villageId,
                GameTime.of(Math.min(this.now(), item.completesAt)),
            );
            this.db
                .update(buildings)
                .set({ level: item.targetLevel })
                .where(
                    and(
                        eq(buildings.villageId, villageId),
                        eq(buildings.type, item.buildingType),
                    ),
                )
                .run();
            const levels = this.getBuildingLevels(villageId);
            this.db
                .update(villages)
                .set({ points: villagePoints(levels) })
                .where(eq(villages.id, villageId))
                .run();
        })();
        this.broadcast({ type: 'build_complete', villageId });
        // Die Schleife hat Platz: Ein Bot entscheidet jetzt, nicht erst beim
        // nächsten regulären Tick (19-4).
        wakeBot(this, this.getVillageRow(villageId).playerId);
    }
}
