import { describe, expect, it } from 'vitest';
import { amountAtRate, Duration, GameTime } from '../src/index.js';

describe('Duration', () => {
    it('constructs from units', () => {
        expect(Duration.seconds(2)).toBe(2_000);
        expect(Duration.minutes(3)).toBe(180_000);
        expect(Duration.hours(1.5)).toBe(5_400_000);
        expect(Duration.zero).toBe(0);
    });

    it('adds, scales and clamps', () => {
        expect(Duration.add(Duration.seconds(1), 500)).toBe(1_500);
        expect(Duration.scale(Duration.minutes(10), 0.5)).toBe(300_000);
        expect(Duration.atLeast(120.4, Duration.seconds(1))).toBe(
            1_000,
        );
        expect(Duration.atLeast(1_200.6, Duration.seconds(1))).toBe(
            1_201,
        );
    });

    it('converts back to units', () => {
        expect(Duration.toHours(Duration.hours(2))).toBe(2);
        expect(Duration.toSeconds(Duration.minutes(1))).toBe(60);
    });
});

describe('GameTime', () => {
    it('advances by durations', () => {
        const t = GameTime.add(GameTime.zero, Duration.minutes(5));
        expect(t).toBe(300_000);
        expect(GameTime.max(t, GameTime.of(1))).toBe(t);
    });

    it('between clamps negative spans to zero', () => {
        expect(
            GameTime.between(GameTime.of(1_000), GameTime.of(4_000)),
        ).toBe(3_000);
        expect(
            GameTime.between(GameTime.of(4_000), GameTime.of(1_000)),
        ).toBe(0);
    });
});

describe('amountAtRate', () => {
    it('applies an hourly rate over a duration', () => {
        expect(amountAtRate(30, Duration.hours(2))).toBe(60);
        expect(amountAtRate(3_000, Duration.minutes(1))).toBe(50);
        expect(amountAtRate(100, Duration.zero)).toBe(0);
    });
});
