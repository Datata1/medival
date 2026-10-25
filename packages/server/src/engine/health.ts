import {
    createHistogram,
    type IntervalHistogram,
    monitorEventLoopDelay,
    type RecordableHistogram,
} from 'node:perf_hooks';
import type { World } from './world.js';

/**
 * Dauer einzelner Vorgänge, gesammelt zwischen zwei Health-Checks
 * (plans/19-prototyp/19-5). Ein einfacher Puffer statt eines Histogramms:
 * Für p50/p99 über ein 15-s-Fenster reicht das, und es braucht nichts.
 */
export class Timings {
    private samples: number[] = [];

    record(ms: number): void {
        // Obergrenze, damit ein langes Fenster den Speicher nicht füllt.
        if (this.samples.length < 50_000) this.samples.push(ms);
    }

    snapshot(): { count: number; p50Ms: number; p99Ms: number } {
        const sorted = [...this.samples].sort((a, b) => a - b);
        const at = (q: number) =>
            sorted[
                Math.min(
                    sorted.length - 1,
                    Math.floor(sorted.length * q),
                )
            ] ?? 0;
        return {
            count: sorted.length,
            p50Ms: at(0.5),
            p99Ms: at(0.99),
        };
    }

    reset(): void {
        this.samples = [];
    }
}

/** Dauer je Bot-Tick (wahrnehmen, entscheiden, ausführen) über alle Welten. */
export const botTickTimings = new Timings();

/**
 * Ein Histogramm in Millisekunden über beliebig lange Zeiträume
 * (plans/19-prototyp/19-15). Anders als `Timings` behält es keine einzelnen
 * Werte: Eine Stunde Lastprobe sind Millionen Events, und `createHistogram`
 * braucht dafür festen Speicher.
 */
export class DurationHistogram {
    private readonly h: RecordableHistogram = createHistogram();

    record(ms: number): void {
        // Auflösung 1 µs; das Histogramm nimmt nur ganze Zahlen ≥ 1.
        this.h.record(Math.max(1, Math.round(ms * 1000)));
    }

    snapshot(): {
        count: number;
        p50Ms: number;
        p99Ms: number;
        maxMs: number;
    } {
        const count = this.h.count;
        const at = (q: number) =>
            count === 0 ? 0 : this.h.percentile(q) / 1000;
        return {
            count,
            p50Ms: at(50),
            p99Ms: at(99),
            maxMs: count === 0 ? 0 : this.h.max / 1000,
        };
    }

    reset(): void {
        this.h.reset();
    }
}

/**
 * Seit Serverstart bzw. dem letzten `resetTotals` (19-15) — die Grundlage der
 * Lastprobe. Die Fensterwerte oben setzt der Health-Check alle 15 s zurück.
 */
export const totals = {
    botTick: new DurationHistogram(),
    /** Verarbeitungsdauer je Event-Typ. */
    eventDuration: new Map<string, DurationHistogram>(),
    /** Wie spät ein Event nach seiner Fälligkeit dran war (Wanduhr). */
    eventLag: new DurationHistogram(),
    botIntents: { done: 0, rejected: 0 },
    /** Dauer der WAL-Checkpoints im Persist-Takt (19-15). */
    checkpoint: new DurationHistogram(),
};

/** Vom Scheduler je verarbeitetem Event aufgerufen. */
export function recordEvent(
    type: string,
    durationMs: number,
    lagMs: number,
): void {
    let h = totals.eventDuration.get(type);
    if (!h) {
        h = new DurationHistogram();
        totals.eventDuration.set(type, h);
    }
    h.record(durationMs);
    totals.eventLag.record(Math.max(0, lagMs));
}

const LOOP_DELAY_WARN_MS = 50;

/**
 * Auflösung der Event-Loop-Messung. `monitorEventLoopDelay` meldet den
 * ganzen Abstand zwischen zwei Messpunkten, nicht nur die Verspätung: Im
 * Leerlauf stehen bei 10 ms Auflösung 10,5 ms im Histogramm, ein Block von
 * 30 ms erscheint als 39 ms (gemessen, 19-15). Gemeldet wird deshalb der
 * Wert abzüglich der Auflösung — die Verzögerung, die ein Spieler spürt.
 */
const LOOP_RESOLUTION_MS = 10;
const loopDelay = (ns: number) =>
    Math.max(0, ns / 1e6 - LOOP_RESOLUTION_MS);
const BACKLOG_WARN_MS = 1_000;

/**
 * Observability for the simulation (plans/03-zeit-stabilitaet-node.md):
 * event-loop delay percentiles plus per-world event backlog
 * (game-time distance to the oldest pending due event).
 */
export class EngineHealth {
    private readonly histogram: IntervalHistogram;
    /** Wie `histogram`, aber ohne den 15-s-Reset (19-15). */
    private readonly loopTotal: IntervalHistogram;

    constructor() {
        this.histogram = monitorEventLoopDelay({
            resolution: LOOP_RESOLUTION_MS,
        });
        this.histogram.enable();
        this.loopTotal = monitorEventLoopDelay({
            resolution: LOOP_RESOLUTION_MS,
        });
        this.loopTotal.enable();
    }

    /** Gesamtwerte zurücksetzen — nach dem Aufbau einer Lastprobe. */
    resetTotals(): void {
        this.loopTotal.reset();
        totals.botTick.reset();
        totals.eventLag.reset();
        totals.eventDuration.clear();
        totals.checkpoint.reset();
        totals.botIntents.done = 0;
        totals.botIntents.rejected = 0;
    }

    snapshot(worlds: Iterable<World>) {
        const worldStats = [];
        for (const w of worlds) {
            const nextDue = w.scheduler.nextDue();
            const backlogMs =
                nextDue === null ? 0 : Math.max(0, w.now() - nextDue);
            worldStats.push({
                id: w.id,
                name: w.name,
                status: w.status,
                gameTime: w.now(),
                eventBacklogMs: backlogMs,
            });
        }
        return {
            eventLoop: {
                meanMs: loopDelay(this.histogram.mean),
                p99Ms: loopDelay(this.histogram.percentile(99)),
                maxMs: loopDelay(this.histogram.max),
            },
            botTick: botTickTimings.snapshot(),
            worlds: worldStats,
            totals: {
                eventLoop: {
                    p50Ms: loopDelay(this.loopTotal.percentile(50)),
                    p99Ms: loopDelay(this.loopTotal.percentile(99)),
                    maxMs: loopDelay(this.loopTotal.max),
                },
                botTick: totals.botTick.snapshot(),
                eventLag: totals.eventLag.snapshot(),
                events: Object.fromEntries(
                    [...totals.eventDuration].map(([type, h]) => [
                        type,
                        h.snapshot(),
                    ]),
                ),
                botIntents: { ...totals.botIntents },
                checkpoint: totals.checkpoint.snapshot(),
            },
        };
    }

    /** Log warnings for lagging loop or lagging worlds; called periodically. */
    check(worlds: Iterable<World>): void {
        const snap = this.snapshot(worlds);
        if (snap.eventLoop.p99Ms > LOOP_DELAY_WARN_MS) {
            console.warn(
                `[health] event loop p99 ${snap.eventLoop.p99Ms.toFixed(1)}ms`,
            );
        }
        for (const w of snap.worlds) {
            if (
                w.status === 'running' &&
                w.eventBacklogMs > BACKLOG_WARN_MS
            ) {
                console.warn(
                    `[health] world ${w.id} (${w.name}) is ${Math.round(w.eventBacklogMs)}ms behind schedule`,
                );
            }
        }
        this.histogram.reset();
        botTickTimings.reset();
    }
}
