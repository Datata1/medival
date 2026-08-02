import {
    amountAtRate,
    BUILDINGS,
    type BuildingLevels,
    type BuildingType,
    buildCost,
    buildingLevelsFrom,
    buildTime,
    canAfford,
    createStatefulRng,
    EVENT_SCHEMAS,
    entriesOf,
    farmCapacity,
    GameTime,
    LOYALTY_REGEN_PER_HOUR,
    projectResources,
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
} from '@medival/shared';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { and, asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { handleBarbarianTick } from '../ai/barbarian.js';
import { handleBotTick } from '../ai/bot.js';
import {
    firstOrThrow,
    parseJsonColumn,
    parseRow,
} from '../db/parse.js';
import {
    buildings,
    buildQueue,
    movements,
    recruitQueue,
    units,
    villages,
} from '../db/schema.js';
import { GameClock } from './clock.js';
import { GameError } from './errors.js';
import { handleArrival, handleRecruitTick } from './military.js';
import { type GameEvent, Scheduler } from './scheduler.js';

export { GameError } from './errors.js';

export interface WorldMeta {
    id: number;
    name: string;
    seed: number;
    settings: WorldSettings;
    status: 'running' | 'paused' | 'won' | 'lost';
    gameTimeMs: number;
    rngState: number;
}

export type WorldMessage = Record<string, unknown> & { type: string };

const BUILD_QUEUE_LIMIT = 5;

export class World {
    readonly id: number;
    readonly name: string;
    readonly settings: WorldSettings;
    status: WorldMeta['status'];
    readonly clock: GameClock;
    readonly scheduler: Scheduler;
    readonly rng: StatefulRng;
    private readonly subscribers = new Set<
        (msg: WorldMessage) => void
    >();

    constructor(
        meta: WorldMeta,
        readonly sqlite: SqliteDatabase,
        readonly db: BetterSQLite3Database<Record<string, unknown>>,
        private readonly persistMeta: (
            patch: Partial<
                Pick<WorldMeta, 'status' | 'gameTimeMs' | 'rngState'>
            >,
        ) => void,
    ) {
        this.id = meta.id;
        this.name = meta.name;
        this.settings = meta.settings;
        this.status = meta.status;
        this.clock = new GameClock(
            meta.gameTimeMs,
            meta.status === 'running',
        );
        this.rng = createStatefulRng(meta.rngState || meta.seed || 1);
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

    now(): GameTime {
        return GameTime.of(Math.floor(this.clock.now()));
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
        if (
            this.clock.running ||
            this.status === 'won' ||
            this.status === 'lost'
        )
            return;
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
        });
    }

    close(): void {
        this.clock.pause();
        this.scheduler.stop();
        this.persistMeta({
            gameTimeMs: this.now(),
            rngState: this.rng.state,
        });
        this.sqlite.close();
    }

    // ── pub/sub ────────────────────────────────────────────────────────

    subscribe(fn: (msg: WorldMessage) => void): () => void {
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
    }

    broadcast(msg: WorldMessage): void {
        for (const fn of this.subscribers) fn(msg);
    }

    // ── queries ────────────────────────────────────────────────────────

    getBuildingLevels(villageId: number): BuildingLevels {
        const rows = this.db
            .select()
            .from(buildings)
            .where(eq(buildings.villageId, villageId))
            .all();
        return buildingLevelsFrom(rows);
    }

    getUnits(villageId: number): Units {
        const rows = this.db
            .select()
            .from(units)
            .where(eq(units.villageId, villageId))
            .all();
        const result: Units = {};
        for (const r of rows)
            if (r.countHome > 0) result[r.unitType] = r.countHome;
        return result;
    }

    getVillageRow(villageId: number) {
        return firstOrThrow(
            this.db
                .select()
                .from(villages)
                .where(eq(villages.id, villageId))
                .all(),
            'village_not_found',
        );
    }

    /** Add (or subtract, with negative counts) units in a village. */
    addUnits(villageId: number, delta: Units): void {
        for (const [type, n] of entriesOf(delta)) {
            if (!n) continue;
            this.sqlite
                .prepare(
                    `INSERT INTO units (village_id, unit_type, count_home) VALUES (?, ?, ?)
           ON CONFLICT(village_id, unit_type) DO UPDATE SET count_home = count_home + excluded.count_home`,
                )
                .run(villageId, type, n);
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
        const recruits = this.db
            .select()
            .from(recruitQueue)
            .where(eq(recruitQueue.villageId, villageId))
            .orderBy(asc(recruitQueue.id))
            .all();
        const unitCounts = this.getUnits(villageId);
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
            recruitQueue: recruits,
            units: unitCounts,
            popUsed: this.popInUse(villageId, levels),
            popMax: farmCapacity(levels.farm),
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
        const traveling = this.db
            .select({ unitsJson: movements.unitsJson })
            .from(movements)
            .where(eq(movements.originVillageId, villageId))
            .all();
        for (const m of traveling)
            pop += unitPop(
                parseJsonColumn(
                    UnitsSchema,
                    m.unitsJson,
                    'movement.units',
                ),
            );
        const queued = this.db
            .select()
            .from(recruitQueue)
            .where(eq(recruitQueue.villageId, villageId))
            .all();
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
        this.persist();
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
    }
}
