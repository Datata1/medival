import {
    type BuildingType,
    CarriedResourcesSchema,
    canAfford,
    carryCapacity,
    catapultDamage,
    DEFAULT_CATAPULT_TARGET,
    distance,
    distributeLoot,
    entriesOf,
    farmCapacity,
    GameTime,
    hiddenCapacity,
    isScoutMission,
    isUnitEnabled,
    type MovementKind,
    type Resources,
    recruitBlock,
    recruitTime,
    resolveBattle,
    resolveSpying,
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
import {
    paladinReviveTime,
    paladinStatus,
    recordPaladinDeath,
} from './paladin.js';
import { getResearched } from './research.js';
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
    // Was es in dieser Welt nicht gibt, kann man nicht ausheben (19-12).
    if (!isUnitEnabled(world.settings, unitType))
        throw new GameError('unit_disabled');
    count = Math.floor(count);
    if (count < 1) throw new GameError('invalid_count');
    const now = world.now();
    const building = UNITS[unitType].recruitedAt;
    // Paladin (19-14): einer je Spieler; nach seinem Tod kostenlos, aber
    // so lange wie eine Ernennung.
    let revive = false;
    if (unitType === 'paladin') {
        if (count !== 1) throw new GameError('paladin_single');
        const owner = world.getVillageRow(villageId).playerId;
        if (owner === null) throw new GameError('paladin_single');
        const status = paladinStatus(world, owner);
        if (status.state === 'home' || status.state === 'away')
            throw new GameError('paladin_exists');
        if (status.state === 'appointing')
            throw new GameError('paladin_reviving');
        revive = status.state === 'dead';
    }

    world.sqlite.transaction(() => {
        const levels = world.getBuildingLevels(villageId);
        // Gebäude und Forschung an einer Stelle (19-13, `recruitBlock`).
        const block = recruitBlock(
            unitType,
            levels,
            getResearched(world, villageId),
        );
        if (block !== null) throw new GameError(block);

        const popAfter =
            world.popInUse(villageId, levels) +
            unitPop(singleEntry(unitType, count));
        if (popAfter > farmCapacity(levels.farm))
            throw new GameError('farm_too_small');

        const cost = revive
            ? { wood: 0, clay: 0, iron: 0 }
            : unitCost(unitType, count);
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
            Math.round(
                revive
                    ? paladinReviveTime(world.settings.speed)
                    : recruitTime(unitType, world.settings.speed),
            ),
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
            /*
             * Wartende Aufträge ohne laufenden davor: Das entsteht, wenn eine
             * Einheit das Gebäude wechselt (19-11: Rammböcke von der Kaserne
             * in die Werkstatt). Hinter einem Kasernenauftrag eingereiht,
             * hätte sie in der Werkstatt niemand mehr angestoßen.
             */
            const firstWaiting = queue[0];
            if (!active && firstWaiting) {
                world.db
                    .update(recruitQueue)
                    .set({ startedAt: at })
                    .where(eq(recruitQueue.id, firstWaiting.id))
                    .run();
                scheduleRecruitDone(
                    world,
                    firstWaiting.id,
                    at,
                    firstWaiting.count,
                    firstWaiting.perUnitMs,
                );
                active = { ...firstWaiting, startedAt: at };
            }
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
    /** Ziel mitgeschickter Katapulte (19-11); Standard: Hauptgebäude. */
    catapultTarget?: BuildingType,
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
        // Ohne Versammlungsplatz marschiert niemand (19-13).
        if (world.getBuildingLevels(originId).rally_point < 1)
            throw new GameError('no_rally_point');

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
                    catapultTarget:
                        kind === 'attack' && (sent.catapult ?? 0) > 0
                            ? (catapultTarget ??
                              DEFAULT_CATAPULT_TARGET)
                            : null,
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
                /*
                 * Das Ziel gehört inzwischen jemand anderem (erobert, 20-3):
                 * Die Unterstützung kehrt um, statt den Eroberer zu
                 * verstärken.
                 */
                const supportOrigin = world.getVillageRow(
                    m.originVillageId,
                );
                const supportTarget = world.getVillageRow(
                    m.targetVillageId,
                );
                if (supportOrigin.playerId !== supportTarget.playerId) {
                    sendHome(
                        world,
                        supportOrigin,
                        supportTarget,
                        units,
                        { wood: 0, clay: 0, iron: 0 },
                        GameTime.of(m.arrivalGameTime),
                    );
                    affected.push(m.originVillageId);
                    break;
                }
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
                // Nur Späher: Spähmission statt Kampf (19-10).
                if (isScoutMission(units))
                    resolveScoutArrival(
                        world,
                        m.originVillageId,
                        m.targetVillageId,
                        units,
                        GameTime.of(m.arrivalGameTime),
                    );
                else
                    resolveAttackArrival(
                        world,
                        m.originVillageId,
                        m.targetVillageId,
                        units,
                        GameTime.of(m.arrivalGameTime),
                        m.catapultTarget,
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

/**
 * Ein Gebäude um `levels` Stufen senken — samt Punkten und laufender
 * Bauaufträge (19-11). Ein Auftrag für dasselbe Gebäude baut danach auf der
 * beschossenen Stufe weiter auf: Wer Stufe 12 baute und auf 9 beschossen
 * wird, bekommt nach Fertigstellung Stufe 10, nicht 12. Bezahlt ist der
 * Auftrag schon; das ist der Preis eines Beschusses mitten im Ausbau.
 */
function lowerBuilding(
    world: World,
    villageId: number,
    building: BuildingType,
    levels: number,
): void {
    world.sqlite
        .prepare(
            'UPDATE buildings SET level = MAX(0, level - ?) WHERE village_id = ? AND type = ?',
        )
        .run(levels, villageId, building);
    world.sqlite
        .prepare(
            'UPDATE build_queue SET target_level = MAX(1, target_level - ?) WHERE village_id = ? AND building_type = ?',
        )
        .run(levels, villageId, building);
    world.db
        .update(villages)
        .set({
            points: villagePoints(world.getBuildingLevels(villageId)),
        })
        .where(eq(villages.id, villageId))
        .run();
}

/**
 * Truppen eines eroberten Dorfes, die unterwegs sind, gehen verloren
 * (plans/20-nacharbeiten/20-3) — wie in Tribal Wars.
 *
 * Vorher gehörten ihre Bewegungen über `origin_village_id` plötzlich dem
 * Eroberer, und ein Rückweg landete in seinem Dorf. Für den Paladin hieß das:
 * Der alte Besitzer durfte einen neuen ernennen, der neue hatte womöglich
 * zwei. Lieferungen bleiben; sie tragen nur Rohstoffe.
 */
function abandonMarches(
    world: World,
    villageId: number,
    oldOwner: number | null,
    at: GameTime,
): void {
    const marches = world.db
        .select()
        .from(movements)
        .where(eq(movements.originVillageId, villageId))
        .all()
        .filter((m) => m.kind !== 'trade');
    for (const m of marches) {
        const units = parseJsonColumn(
            UnitsSchema,
            m.unitsJson,
            'movement.units',
        );
        if ((units.paladin ?? 0) > 0)
            recordPaladinDeath(world, oldOwner, at);
        world.db.delete(movements).where(eq(movements.id, m.id)).run();
        world.sqlite
            .prepare(
                "DELETE FROM events WHERE type = 'arrival' AND json_extract(payload_json, '$.movementId') = ?",
            )
            .run(m.id);
    }
}

/**
 * Überlebende auf den Heimweg schicken — mit Beute, falls es welche gibt.
 * Gemeinsam für Angriffe und Spähmissionen (19-10).
 */
function sendHome(
    world: World,
    origin: { id: number; x: number; y: number },
    target: { x: number; y: number },
    survivors: Units,
    loot: Resources,
    now: GameTime,
): void {
    if (Object.keys(survivors).length === 0) return;
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
                originVillageId: origin.id,
                targetVillageId: origin.id,
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

/**
 * Spähmission (plans/19-prototyp/19-10): Späher gegen Späher, die übrige
 * Verteidigung bleibt außen vor. Was die Überlebenden sehen, hängt von ihrem
 * Anteil ab (`spyTier`). Gerechnet wird zum Ankunftszeitpunkt — Rohstoffe und
 * fertige Rekruten so, wie sie in dieser Millisekunde stehen.
 */
function resolveScoutArrival(
    world: World,
    originId: number,
    targetId: number,
    sent: Units,
    now: GameTime,
): void {
    const origin = world.getVillageRow(originId);
    const target = world.getVillageRow(targetId);
    const spies = sent.spy ?? 0;
    const home = world.getUnits(targetId);
    const resources = world.settleResources(targetId, now);
    const levels = world.getBuildingLevels(targetId);
    const result = resolveSpying(spies, home.spy ?? 0, world.rng.next);

    const tier = result.tier;
    const payload = {
        attackerVillage: villageRefOf(origin),
        defenderVillage: villageRefOf(target),
        sent: spies,
        lost: result.lost,
        tier,
        defenderSpies: null,
        resources: tier >= 1 ? roundResources(resources) : null,
        units: tier >= 1 ? home : null,
        buildings: tier >= 2 ? levels : null,
        unitsAway: tier >= 3 ? unitsAwayFrom(world, targetId) : null,
    };

    if (tier > 0) {
        // Das Wissen merkt sich der Spähende — auch Bots, die keine Berichte
        // bekommen, entscheiden damit (19-10).
        recordIntel(world, origin.playerId, targetId, now, {
            units: home,
            wall: levels.wall,
            points: target.points,
        });
        writeReport(world, origin.playerId, 'scout', payload);
    }
    // Der Verteidiger merkt den Versuch nur, wenn seine Späher jemanden
    // gestellt haben.
    if (result.lost > 0)
        writeReport(world, target.playerId, 'scout_defense', {
            ...payload,
            defenderSpies: home.spy ?? 0,
            resources: null,
            units: null,
            buildings: null,
            unitsAway: null,
        });

    sendHome(
        world,
        origin,
        target,
        result.survivors > 0 ? { spy: result.survivors } : {},
        { wood: 0, clay: 0, iron: 0 },
        now,
    );
}

function villageRefOf(v: {
    id: number;
    name: string;
    x: number;
    y: number;
}) {
    return { id: v.id, name: v.name, x: v.x, y: v.y };
}

function roundResources(r: Resources): Resources {
    return {
        wood: Math.floor(r.wood),
        clay: Math.floor(r.clay),
        iron: Math.floor(r.iron),
    };
}

/** Truppen eines Dorfes, die gerade unterwegs sind (Angriff, Unterstützung, Rückweg). */
function unitsAwayFrom(world: World, villageId: number): Units {
    const away: Units = {};
    for (const m of world.db
        .select({
            kind: movements.kind,
            unitsJson: movements.unitsJson,
        })
        .from(movements)
        .where(eq(movements.originVillageId, villageId))
        .all()) {
        if (m.kind === 'trade') continue;
        for (const [type, n] of entriesOf(
            parseJsonColumn(UnitsSchema, m.unitsJson, 'movement.units'),
        ))
            away[type] = (away[type] ?? 0) + n;
    }
    return away;
}

/** Letztes Spähwissen eines Spielers über ein Dorf speichern. */
function recordIntel(
    world: World,
    playerId: number | null,
    villageId: number,
    now: GameTime,
    intel: { units: Units; wall: number; points: number },
): void {
    if (playerId === null) return;
    world.sqlite
        .prepare(
            `INSERT INTO scout_intel (player_id, village_id, game_time, payload_json)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(player_id, village_id)
             DO UPDATE SET game_time = excluded.game_time, payload_json = excluded.payload_json`,
        )
        .run(playerId, villageId, now, JSON.stringify(intel));
}

function resolveAttackArrival(
    world: World,
    originId: number,
    targetId: number,
    attackerUnits: Units,
    battleTime: GameTime,
    catapultTarget: BuildingType | null = null,
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

    // Gefallene Paladine (19-14) — auf beiden Seiten.
    if ((result.attackerLosses.paladin ?? 0) > 0)
        recordPaladinDeath(world, origin.playerId, now);
    if ((result.defenderLosses.paladin ?? 0) > 0)
        recordPaladinDeath(world, target.playerId, now);

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

    // Katapulte (19-11): nach dem Wall, auf das beim Abschicken gewählte Ziel.
    let buildingDamage: {
        building: BuildingType;
        from: number;
        to: number;
    } | null = null;
    const catapults = attackerUnits.catapult ?? 0;
    if (catapults > 0) {
        const building = catapultTarget ?? DEFAULT_CATAPULT_TARGET;
        const from =
            building === 'wall'
                ? result.wallLevelAfter
                : targetLevels[building];
        const to = catapultDamage(
            catapults,
            building,
            from,
            result.attackerWon,
        );
        if (to < from) {
            buildingDamage = { building, from, to };
            lowerBuilding(world, targetId, building, from - to);
        }
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
            abandonMarches(world, targetId, target.playerId, now);
        }
        if (!conquered) {
            world.db
                .update(villages)
                .set({ loyalty: loyaltyAfter, loyaltyUpdatedAt: now })
                .where(eq(villages.id, targetId))
                .run();
        }
    }

    // Beute (19-13: über `distributeLoot`, abzüglich Versteck).
    let loot = { wood: 0, clay: 0, iron: 0 };
    if (result.attackerWon) {
        loot = distributeLoot(
            targetResources,
            hiddenCapacity(targetLevels.hiding_place),
            carryCapacity(survivors),
        );
        if (loot.wood + loot.clay + loot.iron > 0) {
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
    sendHome(world, origin, target, survivors, loot, now);

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
        buildingDamage,
        // Überlebende Späher im gemischten Angriff sehen Lager und Gebäude (19-10).
        scouted:
            (survivors.spy ?? 0) > 0
                ? {
                      resources: roundResources(targetResources),
                      buildings: targetLevels,
                  }
                : null,
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
    // Was überlebende Späher sahen, gilt auch für Bots (19-10).
    if ((survivors.spy ?? 0) > 0 && !conquered)
        recordIntel(world, origin.playerId, targetId, now, {
            units: result.defenderSurvivors,
            wall: result.wallLevelAfter,
            points: target.points,
        });
}
