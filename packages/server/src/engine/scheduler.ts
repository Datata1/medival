import { GameTime } from '@medival/shared';
import { asc, eq, lte, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { events } from '../db/schema.js';
import type { GameClock } from './clock.js';

export interface GameEvent {
    id: number;
    dueGameTime: GameTime;
    type: string;
    /** Ungeprüft — der Handler parst gegen das Schema des Event-Typs. */
    payload: unknown;
}

/**
 * Batch size per synchronous slice. better-sqlite3 is synchronous, so an
 * unbounded catch-up (long pause, hundreds of bots) would block HTTP/WS for
 * its whole duration; after each slice we yield via setImmediate and continue.
 */
const BATCH_SIZE = 200;

/**
 * Event queue backed by the world's `events` table. Holds a single armed
 * setTimeout for the next due event; everything else lives in SQLite so a
 * restart loses nothing.
 *
 * Hardening (plans/03-zeit-stabilitaet-node.md): a throwing handler is logged
 * and skipped instead of wedging the queue, processing yields between batches,
 * and the timer is re-armed on every exit path.
 */
export class Scheduler {
    private timer: NodeJS.Timeout | null = null;
    private processing = false;

    constructor(
        private readonly db: BetterSQLite3Database<
            Record<string, unknown>
        >,
        private readonly clock: GameClock,
        private readonly handler: (event: GameEvent) => void,
        private readonly onHandlerError: (
            event: GameEvent,
            error: unknown,
        ) => void = (ev, err) =>
            console.error(
                `[scheduler] event ${ev.type}#${ev.id} failed:`,
                err,
            ),
    ) {}

    insert(
        type: string,
        dueGameTime: GameTime,
        payload: Record<string, unknown>,
    ): void {
        this.db
            .insert(events)
            .values({
                dueGameTime,
                type,
                payload: JSON.stringify(payload),
            })
            .run();
        this.arm();
    }

    /**
     * Zieht ein ausstehendes Event auf `due` vor — nie nach hinten
     * (plans/19-prototyp/19-4). Für `wakeBot`: Ein Bot bekommt keinen zweiten
     * Tick, sein vorhandener wird früher fällig.
     */
    pullForward(id: number, due: GameTime): void {
        this.db
            .update(events)
            .set({
                dueGameTime: sql`MIN(${events.dueGameTime}, ${due})`,
            })
            .where(eq(events.id, id))
            .run();
        if (!this.processing) this.arm();
    }

    /** Game time of the oldest pending event, or null if the queue is empty. */
    nextDue(): GameTime | null {
        const next = this.db
            .select()
            .from(events)
            .orderBy(asc(events.dueGameTime))
            .limit(1)
            .all()[0];
        return next ? GameTime.of(next.dueGameTime) : null;
    }

    /**
     * Process due events in order, at most BATCH_SIZE per synchronous slice;
     * a larger backlog continues on the next event-loop turn. Always re-arms.
     */
    processDue(): void {
        if (this.processing) return;
        this.processing = true;
        let moreDue = false;
        try {
            const until = Math.floor(this.clock.now());
            for (let i = 0; i < BATCH_SIZE; i++) {
                if (!this.runNext(until)) break;
                if (i === BATCH_SIZE - 1) moreDue = true;
            }
        } finally {
            this.processing = false;
            if (moreDue) {
                // Yield so HTTP/WS get a turn, then continue the backlog.
                setImmediate(() => this.processDue());
            } else {
                this.arm();
            }
        }
    }

    /**
     * Verarbeitet **alle** Events mit Fälligkeit ≤ `until`, strikt geordnet
     * und ohne Batch-Abbruch (plans/19-prototyp/19-1-integrationstest-harness.md).
     *
     * Anders als `processDue` gibt diese Methode den Event-Loop nicht frei.
     * Sie ist für Testwelten gedacht, die Event für Event ablaufen, und für
     * das Nachholen vor einem Befehl (19-2). Handler, die neue, bereits
     * fällige Events anlegen, werden im selben Aufruf mit abgearbeitet.
     *
     * Reentrant aufgerufen (aus einem Handler heraus) tut sie nichts und
     * liefert 0 — das laufende Abarbeiten holt ohnehin alles nach.
     */
    drainUntil(until: GameTime): number {
        if (this.processing) return 0;
        this.processing = true;
        let count = 0;
        try {
            while (this.runNext(until)) count++;
        } finally {
            this.processing = false;
            this.arm();
        }
        return count;
    }

    /**
     * Nimmt das älteste Event mit Fälligkeit ≤ `until` aus der Tabelle und
     * führt es aus. Liefert `false`, wenn keines fällig ist.
     */
    private runNext(until: number): boolean {
        // Re-query after each event: handlers may insert new events that are already due.
        const next = this.db
            .select()
            .from(events)
            .where(lte(events.dueGameTime, until))
            .orderBy(asc(events.dueGameTime), asc(events.id))
            .limit(1)
            .all()[0];
        if (!next) return false;
        this.db.delete(events).where(eq(events.id, next.id)).run();
        const event: GameEvent = {
            id: next.id,
            dueGameTime: GameTime.of(next.dueGameTime),
            type: next.type,
            payload: JSON.parse(next.payload),
        };
        try {
            this.handler(event);
        } catch (error) {
            // One poison event must never freeze the world.
            this.onHandlerError(event, error);
        }
        return true;
    }

    /** (Re-)arm the timer for the next pending event. No-op while paused. */
    arm(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (!this.clock.running) return;
        const next = this.nextDue();
        if (next === null) return;
        const delay = Math.max(0, next - this.clock.now());
        this.timer = setTimeout(
            () => this.processDue(),
            Math.min(delay, 2_147_000_000),
        );
        this.timer.unref?.();
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
