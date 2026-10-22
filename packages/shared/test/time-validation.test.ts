import { describe, expect, it } from 'vitest';
import {
    amountAtRate,
    Duration,
    GameTime,
    TimeValueError,
} from '../src/index.js';

/**
 * Diese Tests sichern die Ausnahme ab, die time.ts vom Cast-Verbot hat:
 * Die Casts dort sind nur zulässig, weil kein ungültiger Wert an ihnen
 * vorbeikommt (siehe plans/08-no-typecasting.md).
 */
describe('Zeitwerte lassen ungültige Zahlen nicht durch', () => {
    it('weist NaN in Duration ab', () => {
        expect(() => Duration.ms(Number.NaN)).toThrow(TimeValueError);
        expect(() => Duration.seconds(Number.NaN)).toThrow(
            TimeValueError,
        );
        expect(() => Duration.scale(1000, Number.NaN)).toThrow(
            TimeValueError,
        );
    });

    it('weist Infinity ab', () => {
        expect(() => Duration.ms(Number.POSITIVE_INFINITY)).toThrow(
            TimeValueError,
        );
        expect(() => GameTime.of(Number.POSITIVE_INFINITY)).toThrow(
            TimeValueError,
        );
    });

    it('weist negative GameTime ab (Spielzeit beginnt bei 0)', () => {
        expect(() => GameTime.of(-1)).toThrow(TimeValueError);
        expect(GameTime.of(0)).toBe(0);
    });

    it('fängt den NaN-Pfad ab, der aus ungültigen Welt-Einstellungen entstand', () => {
        // Reproduziert plans/08: buildTime() rechnete hqBonus / "schnell" → NaN.
        const bogusSpeed = Number('schnell');
        expect(() =>
            Duration.scale(Duration.seconds(900), 1 / bogusSpeed),
        ).toThrow(TimeValueError);
        expect(() =>
            Duration.atLeast(Number.NaN, Duration.seconds(1)),
        ).toThrow(TimeValueError);
    });

    it('weist ungültige Raten in amountAtRate ab', () => {
        expect(() =>
            amountAtRate(Number.NaN, Duration.hours(1)),
        ).toThrow(TimeValueError);
    });

    it('lässt gültige Werte unverändert durch', () => {
        expect(Duration.hours(2)).toBe(7_200_000);
        expect(
            GameTime.add(GameTime.of(1000), Duration.seconds(1)),
        ).toBe(2000);
        expect(amountAtRate(30, Duration.hours(2))).toBe(60);
    });
});

describe('GameTime ist ganzzahlig (plans/19-prototyp/19-2)', () => {
    it('rundet auf ganze Millisekunden', () => {
        expect(GameTime.of(1000.4)).toBe(1000);
        expect(GameTime.of(1000.5)).toBe(1001);
        expect(
            GameTime.add(GameTime.of(10), Duration.hours(1e-7)),
        ).toBe(10);
        expect(
            Number.isInteger(
                GameTime.add(
                    GameTime.zero,
                    Duration.scale(1000, 1 / 3),
                ),
            ),
        ).toBe(true);
    });
});
