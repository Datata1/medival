import {
    Duration,
    GameTime,
    PALADIN_REVIVE_TIME_S,
    type PaladinStatus,
    UnitsSchema,
} from '@medival/shared';
import { z } from 'zod';
import { parseJsonColumn, parseRow } from '../db/parse.js';
import { settleRecruits } from './military.js';
import type { World } from './world.js';

/**
 * Der Paladin (plans/19-prototyp/19-14): einer je Spieler, über alle Dörfer.
 *
 * Der Zustand wird **abgeleitet**, nicht gespeichert: aus den Truppen der
 * eigenen Dörfer, den Bewegungen, die von dort ausgingen, der
 * Ausbildungsschleife und den Todesfällen. Ein gespeicherter Zustand müsste
 * bei Eroberung, Rückkehr und Tod im Kampf mitgeführt werden — jede
 * vergessene Stelle ergäbe einen zweiten Paladin. Unterstützung geht nur an
 * eigene Dörfer (`support_own_only`) und landet dort in `units`; sie ist damit
 * schon abgedeckt.
 */
export type { PaladinStatus };

const HomeRowSchema = z.object({ village_id: z.number().int() });
const MarchRowSchema = z.object({
    id: z.number().int(),
    units_json: z.string(),
});
const QueueRowSchema = z.object({
    village_id: z.number().int(),
    started_at: z.number().int().nullable(),
    per_unit_ms: z.number().int(),
});
const DeathRowSchema = z.object({
    died_at: z.number().int().nullable(),
});

export function paladinStatus(
    world: World,
    playerId: number,
): PaladinStatus {
    // Erst abrechnen: Ein fertig ernannter Paladin steht sonst noch in der
    // Schleife statt im Dorf.
    const queued = world.sqlite
        .prepare(
            `SELECT q.village_id, q.started_at, q.per_unit_ms FROM recruit_queue q
             JOIN villages v ON v.id = q.village_id
             WHERE v.player_id = ? AND q.unit_type = 'paladin'`,
        )
        .all(playerId)
        .map((row) => parseRow(QueueRowSchema, row, 'recruit_queue'));
    for (const q of queued) settleRecruits(world, q.village_id);

    const home = world.sqlite
        .prepare(
            `SELECT u.village_id FROM units u JOIN villages v ON v.id = u.village_id
             WHERE v.player_id = ? AND u.unit_type = 'paladin' AND u.count_home > 0
             LIMIT 1`,
        )
        .get(playerId);
    if (home !== undefined)
        return {
            state: 'home',
            villageId: parseRow(HomeRowSchema, home, 'units')
                .village_id,
        };

    const marching = world.sqlite
        .prepare(
            `SELECT m.id, m.units_json FROM movements m
             JOIN villages v ON v.id = m.origin_village_id
             WHERE v.player_id = ? AND m.units_json LIKE '%"paladin"%'`,
        )
        .all(playerId)
        .map((row) => parseRow(MarchRowSchema, row, 'movements'));
    for (const m of marching) {
        const units = parseJsonColumn(
            UnitsSchema,
            m.units_json,
            'movements.units_json',
        );
        if ((units.paladin ?? 0) > 0)
            return { state: 'away', movementId: m.id };
    }

    const stillQueued = world.sqlite
        .prepare(
            `SELECT q.village_id, q.started_at, q.per_unit_ms FROM recruit_queue q
             JOIN villages v ON v.id = q.village_id
             WHERE v.player_id = ? AND q.unit_type = 'paladin' LIMIT 1`,
        )
        .get(playerId);
    if (stillQueued !== undefined) {
        const q = parseRow(
            QueueRowSchema,
            stillQueued,
            'recruit_queue',
        );
        return {
            state: 'appointing',
            villageId: q.village_id,
            readyAt:
                q.started_at === null
                    ? null
                    : GameTime.add(
                          GameTime.of(q.started_at),
                          q.per_unit_ms,
                      ),
        };
    }

    const death = parseRow(
        DeathRowSchema,
        world.sqlite
            .prepare(
                'SELECT MAX(died_at) AS died_at FROM paladin_deaths WHERE player_id = ?',
            )
            .get(playerId),
        'paladin_deaths',
    );
    if (death.died_at !== null)
        return { state: 'dead', since: GameTime.of(death.died_at) };
    return { state: 'none' };
}

/** Der Paladin eines Spielers ist im Kampf gefallen. */
export function recordPaladinDeath(
    world: World,
    playerId: number | null,
    at: GameTime,
): void {
    if (playerId === null) return;
    world.sqlite
        .prepare(
            'INSERT INTO paladin_deaths (player_id, died_at) VALUES (?, ?)',
        )
        .run(playerId, at);
}

/** Wiederbelebung: kostenlos, Dauer wie die Ernennung (skaliert mit `speed`). */
export function paladinReviveTime(speed: number): Duration {
    return Duration.seconds(PALADIN_REVIVE_TIME_S / speed);
}
