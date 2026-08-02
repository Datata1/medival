import { Duration, GameTime } from '@medival/shared';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WORLD_DDL } from '../src/db/ddl.js';
import { GameClock } from '../src/engine/clock.js';
import { type GameEvent, Scheduler } from '../src/engine/scheduler.js';

let sqlite: Database.Database;
let clock: GameClock;

beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(WORLD_DDL);
    clock = new GameClock(0, false); // paused: time only advances via skip()
});

afterEach(() => {
    sqlite.close();
});

function makeScheduler(handler: (ev: GameEvent) => void) {
    const errors: Array<{ event: GameEvent; error: unknown }> = [];
    const scheduler = new Scheduler(
        drizzle(sqlite),
        clock,
        handler,
        (event, error) => errors.push({ event, error }),
    );
    return { scheduler, errors };
}

/** Drain the backlog synchronously (setImmediate continuations included). */
async function drain(scheduler: Scheduler) {
    for (let i = 0; i < 100; i++) {
        scheduler.processDue();
        await new Promise((r) => setImmediate(r));
    }
}

describe('Scheduler hardening', () => {
    it('a throwing handler does not wedge the queue', () => {
        const processed: string[] = [];
        const { scheduler, errors } = makeScheduler((ev) => {
            if (ev.type === 'poison') throw new Error('boom');
            processed.push(ev.type);
        });

        scheduler.insert('ok-1', GameTime.of(10), {});
        scheduler.insert('poison', GameTime.of(20), {});
        scheduler.insert('ok-2', GameTime.of(30), {});

        clock.skip(Duration.seconds(1));
        scheduler.processDue();

        expect(processed).toEqual(['ok-1', 'ok-2']);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.event.type).toBe('poison');
        // Queue is empty afterwards — nothing is stuck.
        expect(scheduler.nextDue()).toBeNull();
    });

    it('processes a 10k event storm completely and in order', async () => {
        const seen: number[] = [];
        const { scheduler } = makeScheduler((ev) => {
            seen.push(ev.dueGameTime);
        });

        const insert = sqlite.prepare(
            "INSERT INTO events (due_game_time, type, payload_json) VALUES (?, 'tick', '{}')",
        );
        const insertMany = sqlite.transaction(() => {
            for (let i = 1; i <= 10_000; i++) insert.run(i);
        });
        insertMany();

        clock.skip(Duration.seconds(11));
        await drain(scheduler);

        expect(seen).toHaveLength(10_000);
        // Strictly non-decreasing order across batch boundaries.
        for (let i = 1; i < seen.length; i++) {
            expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
        }
        expect(scheduler.nextDue()).toBeNull();
    });

    it('events inserted during processing run in the same drain when due', () => {
        const processed: string[] = [];
        const { scheduler } = makeScheduler((ev) => {
            processed.push(ev.type);
            if (ev.type === 'first')
                scheduler.insert('chained', GameTime.of(5), {});
        });

        scheduler.insert('first', GameTime.of(1), {});
        clock.skip(Duration.seconds(1));
        scheduler.processDue();

        expect(processed).toEqual(['first', 'chained']);
    });
});
