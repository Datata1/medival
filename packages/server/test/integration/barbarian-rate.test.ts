import { afterEach, describe, expect, it } from 'vitest';
import {
    BARBARIAN_MAX_ACTIONS_PER_TICK,
    BARBARIAN_MAX_TICKS_PER_HOUR,
    barbarianTickPlan,
} from '../../src/ai/barbarian.js';
import { observeEvents, pointsOf } from '../harness/query.js';
import {
    advanceYielding,
    createTestWorld,
    type TestWorld,
} from '../harness/world.js';

/**
 * Barbaren-Rate bei hohem Speed (plans/20-nacharbeiten/20-2).
 */

let tw: TestWorld | null = null;
afterEach(() => {
    tw?.dispose();
    tw = null;
});

describe('barbarianTickPlan', () => {
    it('ändert unter dem Deckel nichts', () => {
        expect(barbarianTickPlan(1, 10, false)).toEqual({
            rate: 10,
            actions: 1,
        });
        expect(barbarianTickPlan(3, 200, false)).toEqual({
            rate: 600,
            actions: 1,
        });
    });

    it('teilt darüber die Rate auf mehrere Handlungen je Tick auf', () => {
        const plan = barbarianTickPlan(1, 1000, false);
        expect(plan.actions).toBe(2);
        expect(plan.rate).toBe(500);
        expect(plan.rate * plan.actions).toBe(1000);
        expect(plan.rate).toBeLessThanOrEqual(
            BARBARIAN_MAX_TICKS_PER_HOUR,
        );
    });

    it('macht höchstens BARBARIAN_MAX_ACTIONS_PER_TICK Handlungen', () => {
        const plan = barbarianTickPlan(60, 10_000, false);
        expect(plan.actions).toBe(BARBARIAN_MAX_ACTIONS_PER_TICK);
        expect(plan.rate * plan.actions).toBe(600_000);
    });
});

describe('Barbaren bei Speed 1000', () => {
    it('ticken seltener und wachsen fast so schnell wie ohne Deckel', async () => {
        tw = createTestWorld(
            {
                speed: 1000,
                unitSpeed: 1000,
                mapSize: 100,
                botCount: 0,
                barbarianCount: 40,
                barbarianAttemptsPerHour: 1,
                seed: 1,
            },
            'Schnell',
        );
        const { world } = tw;
        const before = pointsOf(world, null);
        let ticks = 0;
        const stop = observeEvents(world, (e) => {
            if (e.type === 'barbarian_tick') ticks++;
        });
        await advanceYielding(world, 6 * 60_000);
        stop();

        // Ohne Deckel: 40 Dörfer × 1 000 je Stunde × 0,1 h = 4 000 Ticks
        // (gemessen 4 005) und 9 355 Punkte Zuwachs bei diesem Seed.
        expect(ticks).toBeLessThan(2_500);
        expect(pointsOf(world, null) - before).toBeGreaterThan(
            0.9 * 9_355,
        );
    }, 120_000);
});
