import {
    type IntervalHistogram,
    monitorEventLoopDelay,
} from 'node:perf_hooks';
import type { World } from './world.js';

const LOOP_DELAY_WARN_MS = 50;
const BACKLOG_WARN_MS = 1_000;

/**
 * Observability for the simulation (plans/03-zeit-stabilitaet-node.md):
 * event-loop delay percentiles plus per-world event backlog
 * (game-time distance to the oldest pending due event).
 */
export class EngineHealth {
    private readonly histogram: IntervalHistogram;

    constructor() {
        this.histogram = monitorEventLoopDelay({ resolution: 10 });
        this.histogram.enable();
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
                meanMs: this.histogram.mean / 1e6,
                p99Ms: this.histogram.percentile(99) / 1e6,
                maxMs: this.histogram.max / 1e6,
            },
            worlds: worldStats,
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
    }
}
