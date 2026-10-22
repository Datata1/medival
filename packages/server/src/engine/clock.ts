import { performance } from 'node:perf_hooks';
import type { DurationLike } from '@medival/shared';

/**
 * Per-world game-time clock. Game time advances 1:1 with wall time while
 * running (world speed scales durations/production, not the clock rate)
 * and freezes while paused or while the server is down.
 *
 * Uses the monotonic clock (performance.now) for the running delta, so NTP
 * corrections or manual system-clock changes can never warp game time
 * (siehe plans/03-zeit-stabilitaet-node.md).
 */
export class GameClock {
    private accumulatedMs: number;
    private runningSince: number | null;

    constructor(gameTimeMs: number, running: boolean) {
        this.accumulatedMs = gameTimeMs;
        this.runningSince = running ? performance.now() : null;
    }

    get running(): boolean {
        return this.runningSince !== null;
    }

    now(): number {
        return this.runningSince === null
            ? this.accumulatedMs
            : this.accumulatedMs +
                  (performance.now() - this.runningSince);
    }

    pause(): void {
        if (this.runningSince === null) return;
        this.accumulatedMs += performance.now() - this.runningSince;
        this.runningSince = null;
    }

    resume(): void {
        if (this.runningSince !== null) return;
        this.runningSince = performance.now();
    }

    /**
     * Stellt die Uhr auf einen Zeitpunkt — nur vorwärts. Für Testwelten, die
     * von Fälligkeit zu Fälligkeit laufen (plans/19-prototyp/19-1); eine Uhr,
     * die zurückspringt, würde bereits abgerechnete Events wiederholen.
     */
    setTo(gameTimeMs: number): void {
        const now = this.now();
        if (gameTimeMs < now)
            throw new RangeError(
                `GameClock.setTo: ${gameTimeMs} liegt vor ${now}`,
            );
        this.accumulatedMs += gameTimeMs - now;
    }

    /** Jump forward by the given duration (time warp / fast forward). */
    skip(d: DurationLike): void {
        this.accumulatedMs += d;
    }
}
