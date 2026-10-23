import {
    canAfford,
    Duration,
    GameTime,
    isUnitEnabled,
    RESEARCH,
    researchBlock,
    researchCost,
    researchTimeS,
    type UnitType,
    UnitTypeSchema,
} from '@medival/shared';
import { z } from 'zod';
import { wakeBot } from '../ai/bot.js';
import { parseRow } from '../db/parse.js';
import { GameError } from './errors.js';
import type { World } from './world.js';

/**
 * Forschung in der Schmiede (plans/19-prototyp/19-13).
 *
 * Läuft wie ein Bauauftrag: bezahlen, einreihen, ein Event am Ende. Je Dorf
 * höchstens eine Forschung gleichzeitig — eine Schleife wie beim Bauen wäre
 * für einstufige Freischaltungen mehr Oberfläche als Spiel.
 */

const ResearchedRowSchema = z.object({ unit_type: UnitTypeSchema });
const QueueRowSchema = z.object({
    id: z.number().int(),
    village_id: z.number().int(),
    unit_type: UnitTypeSchema,
    completes_at: z.number().int(),
});

/** Erforschte Einheiten eines Dorfes (ohne die, die keine Forschung brauchen). */
export function getResearched(
    world: World,
    villageId: number,
): UnitType[] {
    return world.sqlite
        .prepare('SELECT unit_type FROM research WHERE village_id = ?')
        .all(villageId)
        .map(
            (row) =>
                parseRow(ResearchedRowSchema, row, 'research')
                    .unit_type,
        );
}

/** Die laufende Forschung eines Dorfes — oder `null`. */
export function getResearch(
    world: World,
    villageId: number,
): { unit: UnitType; completesAt: GameTime } | null {
    const row = world.sqlite
        .prepare('SELECT * FROM research_queue WHERE village_id = ?')
        .get(villageId);
    if (row === undefined) return null;
    const q = parseRow(QueueRowSchema, row, 'research_queue');
    return {
        unit: q.unit_type,
        completesAt: GameTime.of(q.completes_at),
    };
}

/** Eine Einheit als erforscht eintragen (Migration, Tests, Event). */
export function markResearched(
    world: World,
    villageId: number,
    units: readonly UnitType[],
): void {
    const insert = world.sqlite.prepare(
        'INSERT OR IGNORE INTO research (village_id, unit_type) VALUES (?, ?)',
    );
    for (const unit of units)
        if (RESEARCH[unit] !== null) insert.run(villageId, unit);
}

export function researchUnit(
    world: World,
    villageId: number,
    unit: UnitType,
): void {
    if (!isUnitEnabled(world.settings, unit))
        throw new GameError('unit_disabled');
    const now = world.now();
    world.sqlite.transaction(() => {
        const levels = world.getBuildingLevels(villageId);
        const block = researchBlock(
            unit,
            levels,
            getResearched(world, villageId),
        );
        if (block !== null) throw new GameError(block);
        if (getResearch(world, villageId) !== null)
            throw new GameError('research_busy');

        const cost = researchCost(unit);
        const have = world.settleResources(villageId, now);
        if (!canAfford(have, cost))
            throw new GameError('not_enough_resources');
        world.sqlite
            .prepare(
                'UPDATE villages SET wood = ?, clay = ?, iron = ? WHERE id = ?',
            )
            .run(
                have.wood - cost.wood,
                have.clay - cost.clay,
                have.iron - cost.iron,
                villageId,
            );

        const completesAt = GameTime.add(
            now,
            Duration.atLeast(
                Duration.seconds(
                    researchTimeS(unit) / world.settings.speed,
                ),
                Duration.seconds(1),
            ),
        );
        const info = world.sqlite
            .prepare(
                'INSERT INTO research_queue (village_id, unit_type, completes_at) VALUES (?, ?, ?)',
            )
            .run(villageId, unit, completesAt);
        world.scheduler.insert('research_complete', completesAt, {
            queueId: Number(info.lastInsertRowid),
        });
    })();
    world.broadcast({ type: 'village_updated', villageId });
}

export function handleResearchComplete(
    world: World,
    payload: { queueId: number },
): void {
    const row = world.sqlite
        .prepare('SELECT * FROM research_queue WHERE id = ?')
        .get(payload.queueId);
    if (row === undefined) return; // schon erledigt
    const q = parseRow(QueueRowSchema, row, 'research_queue');
    world.sqlite.transaction(() => {
        world.sqlite
            .prepare('DELETE FROM research_queue WHERE id = ?')
            .run(q.id);
        markResearched(world, q.village_id, [q.unit_type]);
    })();
    world.broadcast({
        type: 'village_updated',
        villageId: q.village_id,
    });
    wakeBot(world, world.getVillageRow(q.village_id).playerId);
}
