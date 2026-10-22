import {
    CarriedResourcesSchema,
    canAfford,
    carryCapacity,
    distance,
    entriesOf,
    farmCapacity,
    GameTime,
    type MovementKind,
    recruitTime,
    resolveBattle,
    singleEntry,
    travelTime,
    UNIT_ORDER,
    UNITS,
    type Units,
    UnitsSchema,
    type UnitType,
    unitCost,
    unitPop,
    villagePoints,
    warehouseCapacity,
} from '@medival/shared';
import { and, eq } from 'drizzle-orm';
import { wakeBot } from '../ai/bot.js';
import {
    firstOrThrow,
    parseJsonColumn,
    parseRow,
} from '../db/parse.js';
import { PlayerBotFlagSchema } from '../db/rowSchemas.js';
import {
    buildings,
    movements,
    recruitQueue,
    reports,
    villages,
} from '../db/schema.js';
import { GameError } from './errors.js';
import { EVENT_PRIORITY } from './scheduler.js';
import { handleTradeArrival } from './trade.js';
import type { World } from './world.js';

const CONQUEST_LOYALTY_RESET = 25;

function sanitizeUnits(input: Record<string, unknown>): Units {
    const result: Units = {};
    for (const type of UNIT_ORDER) {
        const n = Math.floor(Number(input[type] ?? 0));
        if (n > 0) result[type] = n;
    }
    return result;
}

function isBotOrBarbarian(
    world: World,
    playerId: number | null,
): boolean {
    if (playerId === null) return true;
    const row = world.sqlite
        .prepare('SELECT is_bot FROM players WHERE id = ?')
        .get(playerId);
    if (row === undefined) return true;
    return (
        parseRow(PlayerBotFlagSchema, row, 'players.is_bot').is_bot ===
        1
    );
}

function writeReport(
    world: World,
    playerId: number | null,
    type: string,
    payload: Record<string, unknown>,
): void {
    if (playerId === null || isBotOrBarbarian(world, playerId)) return; // bots read state directly
    world.db
        .insert(reports)
        .values({
            playerId,
            createdGameTime: world.now(),
            type,
            payload: JSON.stringify(payload),
        })
        .run();
    world.broadcast({ type: 'report', playerId });
}

// ── recruitment ──────────────────────────────────────────────────────

/**
 * Queue `count` units. Each recruitment building (barracks/stable/academy)
 * processes its queue sequentially, one unit after another.
 *
 * Seit plans/19-prototyp/19-2 entsteht dafür **ein** Event je Auftrag
 * (`recruit_done` am Ende), nicht eines je Einheit. Was zwischendurch fertig
 * wird, rechnet `settleRecruits` beim Zugriff aus — wie die Rohstoffe.
 */
export function recruitUnits(
    world: World,
    villageId: number,
    unitType: UnitType,
    count: number,
): void {
    if (!UNITS[unitType]) throw new GameError('invalid_unit');
    count = Math.floor(count);
    if (count < 1) throw new GameError('invalid_count');
    const now = world.now();
    const building = UNITS[unitType].recruitedAt;

    world.sqlite.transaction(() => {
        const levels = world.getBuildingLevels(villageId);
        if (levels[building] < 1) {
            throw new GameError(
                building === 'barracks'
                    ? 'barracks_missing'
                    : building === 'stable'
                      ? 'stable_missing'
                      : 'academy_missing',
            );
        }

        const popAfter =
            world.popInUse(villageId, levels) +
            unitPop(singleEntry(unitType, count));
        if (popAfter > farmCapacity(levels.farm))
            throw new GameError('farm_too_small');

        const cost = unitCost(unitType, count);
        const have = world.settleResources(villageId, now);
        if (!canAfford(have, cost))
            throw new GameError('not_enough_resources');
        world.db
            .update(villages)
            .set({
                wood: have.wood - cost.wood,
                clay: have.clay - cost.clay,
                iron: have.iron - cost.iron,
            })
            .where(eq(villages.id, villageId))
            .run();

        // Ganze Millisekunden: Die Spalte ist INTEGER, und ein Bruchteil
        // würde sich über tausend Einheiten zu Sekunden aufsummieren.
        const perUnitMs = Math.max(
            1,
            Math.round(recruitTime(unitType, world.settings.speed)),
        );
        // Sequential per building: start immediately only if that building's
        // queue is idle (`popInUse` above has already settled it).
        const idle = !world.db
            .select()
            .from(recruitQueue)
            .where(eq(recruitQueue.villageId, villageId))
            .all()
            .some((q) => UNITS[q.unitType].recruitedAt === building);
        const row = firstOrThrow(
            world.db
                .insert(recruitQueue)
                .values({
                    villageId,
                    unitType,
                    count,
                    startedAt: idle ? now : null, // null = waiting for its turn
                    perUnitMs,
                })
                .returning({ id: recruitQueue.id })
                .all(),
            'internal',
        );
        if (idle)
            scheduleRecruitDone(world, row.id, now, count, perUnitMs);
    })();
    world.broadcast({ type: 'village_updated', villageId });
}

function scheduleRecruitDone(
    world: World,
    queueId: number,
    startedAt: GameTime,
    count: number,
    perUnitMs: number,
): void {
    world.scheduler.insert(
        'recruit_done',
        GameTime.add(startedAt, count * perUnitMs),
        { queueId },
    );
}

/**
 * Rekrutierung faul abrechnen (plans/19-prototyp/19-2) — das vierte Glied
 * neben Rohstoffen, Loyalität und Ansehen.
 *
 * Je Gebäude läuft höchstens ein Auftrag; fertig ist, was seit `startedAt` in
 * ganzen `perUnitMs` hineinpasst. Ist ein Auftrag durch, beginnt der nächste
 * wartende desselben Gebäudes genau dann, wenn der vorige endete — nicht
 * erst, wenn jemand nachsieht. Mehrere Aufträge können so in einem Aufruf
 * nacheinander fertig werden.
 *
 * Aufgerufen von `World.getUnits` und damit überall, wo Truppen gezählt
 * werden: Dorfansicht, Abmarsch, Kampf (zum Ankunftszeitpunkt).
 */
export function settleRecruits(
    world: World,
    villageId: number,
    at: GameTime = world.now(),
): void {
    const rows = world.q.recruits.all({ villageId });
    if (rows.length === 0) return;

    world.sqlite.transaction(() => {
        for (const building of new Set(
            rows.map((r) => UNITS[r.unitType].recruitedAt),
        )) {
            const queue = rows.filter(
                (r) => UNITS[r.unitType].recruitedAt === building,
            );
            let active = queue.find((r) => r.startedAt !== null);
            while (active && active.startedAt !== null) {
                const done = Math.min(
                    active.count,
                    Math.floor(
                        GameTime.between(active.startedAt, at) /
                            active.perUnitMs,
                    ),
                );
                if (done <= 0) break;
                world.addUnits(
                    villageId,
                    singleEntry(active.unitType, done),
                );
                const startedAt = GameTime.add(
                    GameTime.of(active.startedAt),
                    done * active.perUnitMs,
                );
                if (done < active.count) {
                    world.db
                        .update(recruitQueue)
                        .set({ count: active.count - done, startedAt })
                        .where(eq(recruitQueue.id, active.id))
                        .run();
                    break;
                }
                world.db
                    .delete(recruitQueue)
                    .where(eq(recruitQueue.id, active.id))
                    .run();
                const finishedId = active.id;
                const next = queue.find(
                    (r) => r.startedAt === null && r.id > finishedId,
                );
                if (!next) break;
                world.db
                    .update(recruitQueue)
                    .set({ startedAt })
                    .where(eq(recruitQueue.id, next.id))
                    .run();
                scheduleRecruitDone(
                    world,
                    next.id,
                    startedAt,
                    next.count,
                    next.perUnitMs,
                );
                active = { ...next, startedAt };
            }
        }
    })();
}

/** Ein Auftrag ist fertig: abrechnen und den nächsten anstoßen. */
export function handleRecruitDone(
    world: World,
    payload: { queueId: number },
): void {
    const row = world.db
        .select({ villageId: recruitQueue.villageId })
        .from(recruitQueue)
        .where(eq(recruitQueue.id, payload.queueId))
        .all()[0];
    // Schon beim Zugriff abgerechnet (oder Dorf erobert): nichts zu tun.
    if (!row) return;
    settleRecruits(world, row.villageId);
    world.broadcast({
        type: 'village_updated',
        villageId: row.villageId,
    });
}

/**
 * Veraltetes `recruit_tick` aus Welten vor 19-2: abrechnen und sicherstellen,
 * dass der laufende Auftrag sein `recruit_done` bekommt. Ein doppeltes
 * `recruit_done` ist harmlos — der zweite Aufruf findet nichts mehr vor.
 */
export function handleRecruitTick(
    world: World,
    payload: { queueId: number },
): void {
    const row = world.db
        .select()
        .from(recruitQueue)
        .where(eq(recruitQueue.id, payload.queueId))
        .all()[0];
    if (!row) return;
    settleRecruits(world, row.villageId);
    const after = world.db
        .select()
        .from(recruitQueue)
        .where(eq(recruitQueue.id, row.id))
        .all()[0];
    if (after && after.startedAt !== null)
        scheduleRecruitDone(
            world,
            after.id,
            GameTime.of(after.startedAt),
            after.count,
            after.perUnitMs,
        );
    world.broadcast({
        type: 'village_updated',
        villageId: row.villageId,
    });
}

/**
 * Ansehen für erhaltene Unterstützung (plans/16-ansehen-und-handel.md).
 *
 * Bewertet wird der Verteidigungswert der geschickten Truppen, nicht ihre
 * Anzahl — zehn Speerträger sind weniger wert als zehn Schwertkämpfer.
 */
function creditSupport(
    world: World,
    originId: number,
    targetId: number,
    sent: Units,
): void {
    const origin = world.getVillageRow(originId);
    const target = world.getVillageRow(targetId);
    if (origin.playerId === target.playerId) return; // eigene Dörfer zählen nicht
    let value = 0;
    for (const [type, n] of entriesOf(sent)) {
        value +=
            ((UNITS[type].defense + UNITS[type].defenseCavalry) / 2) *
            n;
    }
    world.adjustStanding(
        target.playerId,
        origin.playerId,
        { kind: 'support', value },
        distance(origin.x, origin.y, target.x, target.y),
    );
}

// ── movements ────────────────────────────────────────────────────────

export function sendUnits(
    world: World,
    originId: number,
    targetId: number,
    kind: Exclude<MovementKind, 'return'>,
    unitsInput: Record<string, unknown>,
): { arrivalGameTime: number } {
    if (kind !== 'attack' && kind !== 'support')
        throw new GameError('invalid_movement');
    const sent = sanitizeUnits(unitsInput);
    if (Object.keys(sent).length === 0)
        throw new GameError('no_units_selected');
    if (originId === targetId) throw new GameError('target_is_origin');

    const now = world.now();
    let arrivalGameTime = GameTime.zero;
    world.sqlite.transaction(() => {
        const origin = world.getVillageRow(originId);
        const target = world.getVillageRow(targetId);
        if (kind === 'support' && target.playerId !== origin.playerId) {
            throw new GameError('support_own_only');
        }
        if (kind === 'attack' && target.playerId === origin.playerId) {
            throw new GameError('own_village_attack');
        }

        const home = world.getUnits(originId);
        for (const [type, n] of entriesOf(sent)) {
            if ((home[type] ?? 0) < n)
                throw new GameError('not_enough_units');
        }
        const negative: Units = {};
        for (const [type, n] of entriesOf(sent)) negative[type] = -n;
        world.addUnits(originId, negative);

        arrivalGameTime = GameTime.add(
            now,
            travelTime(
                origin.x,
                origin.y,
                target.x,
                target.y,
                sent,
                world.settings.unitSpeed,
            ),
        );
        const movement = firstOrThrow(
            world.db
                .insert(movements)
                .values({
                    originVillageId: originId,
                    targetVillageId: targetId,
                    kind,
                    unitsJson: JSON.stringify(sent),
                    departureGameTime: now,
                    arrivalGameTime,
                })
                .returning({ id: movements.id })
                .all(),
            'internal',
        );
        // Angriffe nach Unterstützung derselben Millisekunde (19-2).
        world.scheduler.insert(
            'arrival',
            arrivalGameTime,
            { movementId: movement.id },
            kind === 'attack'
                ? EVENT_PRIORITY.arrival_attack
                : EVENT_PRIORITY.arrival,
        );
    })();
    world.broadcast({
        type: 'movement',
        originVillageId: originId,
        targetVillageId: targetId,
    });
    // Das Ziel sieht den Angriff kommen (19-4) — ein Bot soll darauf
    // reagieren können, nicht erst beim nächsten regulären Tick.
    if (kind === 'attack')
        wakeBot(world, world.getVillageRow(targetId).playerId);
    return { arrivalGameTime };
}

export function handleArrival(
    world: World,
    payload: { movementId: number },
): void {
    const affected: number[] = [];
    // Wer von dieser Ankunft erfährt — vor dem Kampf gelesen, damit bei einer
    // Eroberung auch der alte Besitzer geweckt wird (19-4).
    const toWake = new Set<number | null>();
    world.sqlite.transaction(() => {
        const m = world.db
            .select()
            .from(movements)
            .where(eq(movements.id, payload.movementId))
            .all()[0];
        if (!m) return;
        toWake.add(world.getVillageRow(m.originVillageId).playerId);
        toWake.add(world.getVillageRow(m.targetVillageId).playerId);
        world.db.delete(movements).where(eq(movements.id, m.id)).run();
        const units = parseJsonColumn(
            UnitsSchema,
            m.unitsJson,
            'movement.units',
        );
        const carries = parseJsonColumn(
            CarriedResourcesSchema,
            m.carriesJson,
            'movement.carries',
        );

        switch (m.kind) {
            case 'support': {
                world.addUnits(m.targetVillageId, units);
                // Unterstützung wiegt schwerer als eine Lieferung: Wer
                // Verteidiger schickt, riskiert sie auch.
                creditSupport(
                    world,
                    m.originVillageId,
                    m.targetVillageId,
                    units,
                );
                affected.push(m.targetVillageId);
                break;
            }
            case 'trade': {
                handleTradeArrival(
                    world,
                    m.originVillageId,
                    m.targetVillageId,
                    carries,
                    GameTime.of(m.arrivalGameTime),
                );
                affected.push(m.originVillageId, m.targetVillageId);
                break;
            }
            case 'return': {
                world.addUnits(m.targetVillageId, units);
                const have = world.settleResources(m.targetVillageId);
                const cap = warehouseCapacity(
                    world.getBuildingLevels(m.targetVillageId)
                        .warehouse,
                );
                world.db
                    .update(villages)
                    .set({
                        wood: Math.min(cap, have.wood + carries.wood),
                        clay: Math.min(cap, have.clay + carries.clay),
                        iron: Math.min(cap, have.iron + carries.iron),
                    })
                    .where(eq(villages.id, m.targetVillageId))
                    .run();
                affected.push(m.targetVillageId);
                break;
            }
            case 'attack': {
                // Use the movement's arrival time as battle time so catch-up
                // processing (after pause/restart) stays consistent.
                resolveAttackArrival(
                    world,
                    m.originVillageId,
                    m.targetVillageId,
                    units,
                    GameTime.of(m.arrivalGameTime),
                );
                affected.push(m.originVillageId, m.targetVillageId);
                break;
            }
        }
    })();
    for (const id of affected)
        world.broadcast({ type: 'village_updated', villageId: id });
    for (const playerId of toWake) wakeBot(world, playerId);
}

function resolveAttackArrival(
    world: World,
    originId: number,
    targetId: number,
    attackerUnits: Units,
    battleTime: GameTime,
): void {
    const now = battleTime;
    const origin = world.getVillageRow(originId);
    const target = world.getVillageRow(targetId);
    const targetLevels = world.getBuildingLevels(targetId);
    const defenderUnits = world.getUnits(targetId);
    const loyaltyBefore = world.settleLoyalty(targetId, now);
    const targetResources = world.settleResources(targetId, now);

    const result = resolveBattle({
        attacker: attackerUnits,
        defender: defenderUnits,
        wallLevel: targetLevels.wall,
        loyalty: loyaltyBefore,
        rng: world.rng.next,
    });

    // Defender losses (all on defeat, partial on win).
    const defenderDelta: Units = {};
    for (const [type, n] of entriesOf(result.defenderLosses)) {
        defenderDelta[type] = -n;
    }
    world.addUnits(targetId, defenderDelta);

    // Wall damage.
    if (result.wallLevelAfter !== result.wallLevelBefore) {
        world.db
            .update(buildings)
            .set({ level: result.wallLevelAfter })
            .where(
                and(
                    eq(buildings.villageId, targetId),
                    eq(buildings.type, 'wall'),
                ),
            )
            .run();
        world.db
            .update(villages)
            .set({
                points: villagePoints(
                    world.getBuildingLevels(targetId),
                ),
            })
            .where(eq(villages.id, targetId))
            .run();
    }

    // Loyalty & conquest.
    let loyaltyAfter = loyaltyBefore;
    let conquered = false;
    const survivors: Units = { ...result.attackerSurvivors };
    if (result.loyaltyDamage > 0) {
        loyaltyAfter = loyaltyBefore - result.loyaltyDamage;
        if (loyaltyAfter <= 0 && origin.playerId !== null) {
            conquered = true;
            loyaltyAfter = CONQUEST_LOYALTY_RESET;
            survivors.noble = (survivors.noble ?? 0) - 1; // the noble settles in
            if (survivors.noble <= 0) delete survivors.noble;
            world.db
                .update(villages)
                .set({
                    playerId: origin.playerId,
                    loyalty: loyaltyAfter,
                    loyaltyUpdatedAt: now,
                })
                .where(eq(villages.id, targetId))
                .run();
            // Open orders die with the old owner.
            world.db
                .delete(recruitQueue)
                .where(eq(recruitQueue.villageId, targetId))
                .run();
        }
        if (!conquered) {
            world.db
                .update(villages)
                .set({ loyalty: loyaltyAfter, loyaltyUpdatedAt: now })
                .where(eq(villages.id, targetId))
                .run();
        }
    }

    // Loot.
    let loot = { wood: 0, clay: 0, iron: 0 };
    if (result.attackerWon) {
        const capacity = carryCapacity(survivors);
        const total =
            targetResources.wood +
            targetResources.clay +
            targetResources.iron;
        if (capacity > 0 && total > 0) {
            const share = Math.min(1, capacity / total);
            loot = {
                wood: Math.floor(targetResources.wood * share),
                clay: Math.floor(targetResources.clay * share),
                iron: Math.floor(targetResources.iron * share),
            };
            world.db
                .update(villages)
                .set({
                    wood: targetResources.wood - loot.wood,
                    clay: targetResources.clay - loot.clay,
                    iron: targetResources.iron - loot.iron,
                })
                .where(eq(villages.id, targetId))
                .run();
        }
    }

    // Send survivors home.
    if (Object.keys(survivors).length > 0) {
        const arrivalGameTime = GameTime.add(
            now,
            travelTime(
                target.x,
                target.y,
                origin.x,
                origin.y,
                survivors,
                world.settings.unitSpeed,
            ),
        );
        const movement = firstOrThrow(
            world.db
                .insert(movements)
                .values({
                    originVillageId: originId,
                    targetVillageId: originId,
                    kind: 'return',
                    unitsJson: JSON.stringify(survivors),
                    departureGameTime: now,
                    arrivalGameTime,
                    carriesJson: JSON.stringify(loot),
                })
                .returning({ id: movements.id })
                .all(),
            'internal',
        );
        world.scheduler.insert('arrival', arrivalGameTime, {
            movementId: movement.id,
        });
    }

    const reportPayload = {
        attackerVillage: {
            id: origin.id,
            name: origin.name,
            x: origin.x,
            y: origin.y,
        },
        defenderVillage: {
            id: target.id,
            name: target.name,
            x: target.x,
            y: target.y,
        },
        attackerWon: result.attackerWon,
        attacker: attackerUnits,
        attackerLosses: result.attackerLosses,
        defender: defenderUnits,
        defenderLosses: result.defenderLosses,
        wallBefore: result.wallLevelBefore,
        wallAfter: result.wallLevelAfter,
        loyaltyBefore: Math.round(loyaltyBefore),
        loyaltyAfter: Math.round(loyaltyAfter),
        luck: Math.round(result.luck * 100),
        loot,
        conquered,
    };
    /*
     * Ansehen: Der Verteidiger denkt schlechter über den Angreifer. Bewertet
     * werden die *eigenen* Verluste — ein abgewehrter Späherangriff wiegt
     * weniger als eine niedergewalzte Garnison. Ein verlorenes Dorf zählt
     * gesondert und ohne Entfernungsdämpfung: Wer einem ein Dorf nimmt, war
     * per Definition nah genug.
     */
    let defenderLossValue = 0;
    for (const [type, n] of entriesOf(result.defenderLosses)) {
        defenderLossValue +=
            ((UNITS[type].defense + UNITS[type].defenseCavalry) / 2) *
            n;
    }
    const dist = distance(origin.x, origin.y, target.x, target.y);
    if (defenderLossValue > 0) {
        world.adjustStanding(
            target.playerId,
            origin.playerId,
            { kind: 'attacked', losses: defenderLossValue },
            dist,
            now,
        );
    }
    if (conquered) {
        world.adjustStanding(
            target.playerId,
            origin.playerId,
            { kind: 'villageLost' },
            dist,
            now,
        );
    }

    writeReport(world, origin.playerId, 'attack', reportPayload);
    writeReport(world, target.playerId, 'defense', reportPayload);
    // Ein Besitzerwechsel steht auf jeder Karte (19-9: öffentlich).
    if (conquered) world.broadcast({ type: 'map_changed' });
}
