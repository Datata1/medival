import {
    canAfford,
    distance,
    GameTime,
    marketCapacity,
    merchantTravelTime,
    RESOURCE_KEYS,
    type Resources,
    warehouseCapacity,
} from '@medival/shared';
import { eq, or } from 'drizzle-orm';
import { firstOrThrow } from '../db/parse.js';
import { movements, villages } from '../db/schema.js';
import { GameError } from './errors.js';
import type { World } from './world.js';

/**
 * Rohstofflieferungen (siehe plans/16-ansehen-und-handel.md).
 *
 * Einseitige Lieferungen statt Angebot-und-Annahme: ein vollständiger
 * Kreislauf mit deutlich weniger Oberfläche. Das Ansehenssystem interessiert
 * sich ohnehin nicht dafür, wodurch der Warenwert entstanden ist — ein echter
 * Tauschmarkt ließe sich später darüberlegen, ohne die Beziehungslogik
 * anzufassen.
 */

/** Ganze Zahlen, nichts Negatives — die Eingabe kommt von außen. */
function sanitizeResources(input: Record<string, unknown>): Resources {
    const out: Resources = { wood: 0, clay: 0, iron: 0 };
    for (const key of RESOURCE_KEYS) {
        const n = Math.floor(Number(input[key] ?? 0));
        if (n > 0) out[key] = n;
    }
    return out;
}

export function totalOf(resources: Resources): number {
    return resources.wood + resources.clay + resources.iron;
}

/**
 * Wie viel Last gerade unterwegs ist. Händler kehren zurück, sind bis dahin
 * aber gebunden — sonst ließe sich dieselbe Kapazität beliebig oft einsetzen.
 */
export function merchantsInUse(
    world: World,
    villageId: number,
): number {
    const rows = world.db
        .select()
        .from(movements)
        .where(
            or(
                eq(movements.originVillageId, villageId),
                eq(movements.targetVillageId, villageId),
            ),
        )
        .all()
        .filter(
            (m) =>
                m.kind === 'trade' && m.originVillageId === villageId,
        );
    let used = 0;
    for (const m of rows) {
        const carried: unknown = JSON.parse(m.carriesJson);
        if (typeof carried === 'object' && carried !== null) {
            used += totalOf(sanitizeResources({ ...carried }));
        }
    }
    return used;
}

/** Freie Transportkapazität eines Dorfes. */
export function freeMerchantCapacity(
    world: World,
    villageId: number,
): number {
    const level = world.getBuildingLevels(villageId).market;
    return Math.max(
        0,
        marketCapacity(level) - merchantsInUse(world, villageId),
    );
}

/**
 * Schickt Rohstoffe von einem Dorf zum anderen.
 *
 * Die Rückreise der Händler wird erst bei der Ankunft eingeplant — so lange
 * sind sie gebunden, und die Kapazitätsrechnung oben stimmt.
 */
export function sendResources(
    world: World,
    originId: number,
    targetId: number,
    input: Record<string, unknown>,
): { arrivalGameTime: number } {
    const load = sanitizeResources(input);
    const total = totalOf(load);
    if (total <= 0) throw new GameError('no_resources_selected');
    if (originId === targetId) throw new GameError('target_is_origin');

    const now = world.now();
    let arrivalGameTime = GameTime.zero;

    world.sqlite.transaction(() => {
        const origin = world.getVillageRow(originId);
        const target = world.getVillageRow(targetId);
        // An herrenlose Dörfer zu liefern hätte keinen Empfänger und keine
        // Wirkung — es wäre schlicht ein Verlust.
        if (target.playerId === null)
            throw new GameError('target_is_barbarian');

        const level = world.getBuildingLevels(originId).market;
        if (level < 1) throw new GameError('market_missing');
        if (total > freeMerchantCapacity(world, originId))
            throw new GameError('not_enough_merchants');

        const have = world.settleResources(originId, now);
        if (!canAfford(have, load))
            throw new GameError('not_enough_resources');
        world.db
            .update(villages)
            .set({
                wood: have.wood - load.wood,
                clay: have.clay - load.clay,
                iron: have.iron - load.iron,
            })
            .where(eq(villages.id, originId))
            .run();

        arrivalGameTime = GameTime.add(
            now,
            merchantTravelTime(
                origin.x,
                origin.y,
                target.x,
                target.y,
                world.settings.unitSpeed,
            ),
        );
        const movement = firstOrThrow(
            world.db
                .insert(movements)
                .values({
                    originVillageId: originId,
                    targetVillageId: targetId,
                    kind: 'trade',
                    unitsJson: '{}',
                    departureGameTime: now,
                    arrivalGameTime,
                    carriesJson: JSON.stringify(load),
                })
                .returning({ id: movements.id })
                .all(),
            'internal',
        );
        world.scheduler.insert('arrival', arrivalGameTime, {
            movementId: movement.id,
        });
    })();

    world.broadcast({
        type: 'movement',
        originVillageId: originId,
        targetVillageId: targetId,
    });
    return { arrivalGameTime };
}

/**
 * Eine Lieferung kommt an: gutschreiben, Ansehen heben, Händler heimschicken.
 *
 * Wird aus `handleArrival` aufgerufen und läuft dort bereits in einer
 * Transaktion.
 */
export function handleTradeArrival(
    world: World,
    originId: number,
    targetId: number,
    carried: Resources,
    at: GameTime,
): void {
    const origin = world.getVillageRow(originId);
    const target = world.getVillageRow(targetId);

    // Gutschreiben, gedeckelt auf den Speicher des Empfängers. Ohne den Deckel
    // ließe sich ein Lager über seine Kapazität hinaus füllen.
    const have = world.settleResources(targetId, at);
    const cap = warehouseCapacity(
        world.getBuildingLevels(targetId).warehouse,
    );
    const credited: Resources = {
        wood: Math.min(cap, have.wood + carried.wood) - have.wood,
        clay: Math.min(cap, have.clay + carried.clay) - have.clay,
        iron: Math.min(cap, have.iron + carried.iron) - have.iron,
    };
    world.db
        .update(villages)
        .set({
            wood: have.wood + credited.wood,
            clay: have.clay + credited.clay,
            iron: have.iron + credited.iron,
        })
        .where(eq(villages.id, targetId))
        .run();

    /*
     * Ansehen: Der Empfänger denkt besser über den Absender. Bewertet wird,
     * was **angekommen** ist — für Rohstoffe, die am vollen Lager verpufft
     * sind, gibt es keine Dankbarkeit.
     */
    world.adjustStanding(
        target.playerId,
        origin.playerId,
        { kind: 'shipment', value: totalOf(credited) },
        distance(origin.x, origin.y, target.x, target.y),
        at,
    );

    // Händler kehren zurück — ohne Einheiten und ohne Fracht.
    const back = GameTime.add(
        at,
        merchantTravelTime(
            target.x,
            target.y,
            origin.x,
            origin.y,
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
                unitsJson: '{}',
                departureGameTime: at,
                arrivalGameTime: back,
                carriesJson: '{}',
            })
            .returning({ id: movements.id })
            .all(),
        'internal',
    );
    world.scheduler.insert('arrival', back, {
        movementId: movement.id,
    });
}
