import { performance } from 'node:perf_hooks';
import type { DurationLike } from '@medival/shared';

/**
 * Quelle der Wanduhr in Epoch-Millisekunden (plans/19-prototyp/19-3).
 *
 * Monoton: einmal beim Prozessstart an die Systemzeit geankert
 * (`performance.timeOrigin`), danach nur noch `performance.now()`. Eine
 * NTP-Korrektur oder eine verstellte Systemuhr während der Laufzeit
 * verschiebt die Spielzeit damit nicht (Plan 03). Austauschbar, damit Tests
 * einen Serverausfall simulieren können, ohne zu warten.
 */
export const wallClock = {
    now: (): number => performance.timeOrigin + performance.now(),
};

/**
 * Spielzeit einer Welt — **an der Wanduhr** (plans/19-prototyp/19-3).
 *
 * Spielzeit ist die Zeit seit `epochZero`, der Wanduhrzeit, zu der die
 * Spielzeit 0 war. Ein Serverausfall hält die Welt deshalb nicht mehr an:
 * Nach dem Neustart steht die Uhr dort, wo sie ohne Ausfall stünde, und der
 * Scheduler holt das Verpasste nach. Eine Ankunftszeit ist damit ein
 * Versprechen, auf das sich Spieler verabreden können.
 *
 * Pausieren und Vorspulen gibt es weiterhin — als Entwicklerwerkzeug und für
 * Tests. Beides verschiebt nur `epochZero` bzw. friert die Uhr ein; die
 * Spielregeln merken davon nichts. World speed scales durations and
 * production, not the clock rate.
 */
export class GameClock {
    /** Wanduhrzeit (Epoch-ms), zu der die Spielzeit 0 war. */
    private epochZero: number;
    /** Eingefrorene Spielzeit, solange pausiert; sonst `null`. */
    private frozenAt: number | null;

    /**
     * @param gameTimeMs Spielzeit beim Anlegen bzw. die eingefrorene Zeit
     *   einer pausierten Welt.
     * @param running Ob die Uhr läuft.
     * @param epochZeroMs Gespeicherter Nullpunkt einer laufenden Welt. Fehlt
     *   er (neue Welt, Spielstand von vor 19-3), läuft die Uhr ab
     *   `gameTimeMs` weiter.
     */
    constructor(
        gameTimeMs: number,
        running: boolean,
        epochZeroMs: number | null = null,
    ) {
        this.epochZero =
            running && epochZeroMs !== null
                ? epochZeroMs
                : wallClock.now() - gameTimeMs;
        this.frozenAt = running ? null : gameTimeMs;
    }

    get running(): boolean {
        return this.frozenAt === null;
    }

    /**
     * Der Nullpunkt, wie er zu speichern bzw. dem Client zu melden ist. Bei
     * pausierter Uhr der Wert, den sie hätte, liefe sie jetzt weiter.
     */
    get epochZeroMs(): number {
        return this.frozenAt === null
            ? this.epochZero
            : wallClock.now() - this.frozenAt;
    }

    now(): number {
        return this.frozenAt ?? wallClock.now() - this.epochZero;
    }

    pause(): void {
        if (this.frozenAt !== null) return;
        this.frozenAt = this.now();
    }

    resume(): void {
        if (this.frozenAt === null) return;
        this.epochZero = wallClock.now() - this.frozenAt;
        this.frozenAt = null;
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
        this.skip(gameTimeMs - now);
    }

    /** Jump forward by the given duration (time warp / fast forward). */
    skip(d: DurationLike): void {
        if (this.frozenAt !== null) this.frozenAt += d;
        else this.epochZero -= d;
    }
}
