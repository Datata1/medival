import { describe, expect, it } from 'vitest';
import { createRng, Duration, exponentialWait } from '../src/index.js';

/**
 * Die exponentielle Wartezeit ist der Kern von Plan 14: Statt für jedes
 * Barbarendorf jede Sekunde zu würfeln, wird einmal gezogen, *wann* der
 * nächste Treffer fällt. Das ist nur dann zulässig, wenn dabei wirklich
 * dieselbe Verteilung herauskommt — deshalb diese Tests.
 */
describe('exponentialWait', () => {
    it('trifft den erwarteten Mittelwert', () => {
        const rng = createRng(1234);
        const rate = 1; // 1 Versuch je Spielstunde → Mittelwert 1 h
        const samples = 10_000;

        let sum = 0;
        for (let i = 0; i < samples; i++) {
            const wait = exponentialWait(rng, rate);
            expect(wait).not.toBeNull();
            sum += Duration.toHours(wait ?? Duration.zero);
        }

        // Erwartungswert einer Exponentialverteilung ist 1/λ.
        expect(sum / samples).toBeCloseTo(1, 1);
    });

    it('skaliert umgekehrt mit der Rate', () => {
        const mean = (rate: number) => {
            const rng = createRng(99);
            let sum = 0;
            for (let i = 0; i < 5000; i++) {
                sum += Duration.toHours(
                    exponentialWait(rng, rate) ?? Duration.zero,
                );
            }
            return sum / 5000;
        };

        // Viermal so oft heißt: im Mittel ein Viertel der Wartezeit.
        expect(mean(4)).toBeCloseTo(mean(1) / 4, 1);
    });

    it('hat die Streuung einer Exponentialverteilung', () => {
        // Ein häufiger Fehler wäre, versehentlich gleichverteilt zu ziehen.
        // Bei der Exponentialverteilung ist die Standardabweichung gleich dem
        // Mittelwert; bei einer Gleichverteilung wäre sie deutlich kleiner.
        const rng = createRng(7);
        const values: number[] = [];
        for (let i = 0; i < 10_000; i++) {
            values.push(
                Duration.toHours(
                    exponentialWait(rng, 1) ?? Duration.zero,
                ),
            );
        }
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance =
            values.reduce((a, b) => a + (b - mean) ** 2, 0) /
            values.length;

        expect(Math.sqrt(variance)).toBeCloseTo(mean, 1);
    });

    it('ist deterministisch — gleicher Seed, gleiche Folge', () => {
        const draw = () => {
            const rng = createRng(2024);
            return Array.from({ length: 20 }, () =>
                exponentialWait(rng, 2),
            );
        };
        // Ohne Determinismus wäre kein Spielstand reproduzierbar.
        expect(draw()).toEqual(draw());
    });

    it('gibt bei Rate 0 „nie" zurück statt Infinity', () => {
        // Infinity würde als Zeitstempel in der Event-Tabelle landen und den
        // Scheduler auf einem kaputten Wert festnageln.
        expect(exponentialWait(createRng(1), 0)).toBeNull();
    });

    it('gibt bei unsinnigen Raten „nie" zurück', () => {
        for (const rate of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(exponentialWait(createRng(1), rate)).toBeNull();
        }
    });

    it('liefert nie eine unendliche Wartezeit', () => {
        // mulberry32 kann 0 liefern; mit -ln(rng()) wäre das Infinity.
        // Der Code zieht deshalb -ln(1 - rng()).
        const rng = createRng(555);
        for (let i = 0; i < 50_000; i++) {
            const wait = exponentialWait(rng, 1);
            expect(Number.isFinite(wait ?? Number.NaN)).toBe(true);
            expect(wait).toBeGreaterThanOrEqual(0);
        }
    });
});
