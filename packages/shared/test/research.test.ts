import { describe, expect, it } from 'vitest';
import {
    createRng,
    distributeLoot,
    EMPTY_BUILDING_LEVELS,
    hiddenCapacity,
    RESEARCH,
    recruitBlock,
    researchBlock,
    UNIT_ORDER,
} from '../src/index.js';

/** Schmiede, Versammlungsplatz, Versteck (plans/19-prototyp/19-13). */

/** Die Beuterechnung, wie sie bis 19-13 in `military.ts` stand. */
function lootBefore(
    r: { wood: number; clay: number; iron: number },
    capacity: number,
) {
    const total = r.wood + r.clay + r.iron;
    if (!(capacity > 0 && total > 0))
        return { wood: 0, clay: 0, iron: 0 };
    const share = Math.min(1, capacity / total);
    return {
        wood: Math.floor(r.wood * share),
        clay: Math.floor(r.clay * share),
        iron: Math.floor(r.iron * share),
    };
}

describe('distributeLoot', () => {
    it('ohne Versteck genau wie vor dem Umzug', () => {
        const rng = createRng(1913);
        for (let i = 0; i < 500; i++) {
            const r = {
                wood: Math.floor(rng() * 30000),
                clay: Math.floor(rng() * 30000),
                iron: Math.floor(rng() * 30000),
            };
            const capacity = Math.floor(rng() * 40000);
            expect(distributeLoot(r, 0, capacity)).toEqual(
                lootBefore(r, capacity),
            );
        }
    });

    it('lässt die geschützte Menge im Dorf', () => {
        expect(hiddenCapacity(3)).toBe(267);
        const loot = distributeLoot(
            { wood: 1000, clay: 1000, iron: 1000 },
            hiddenCapacity(3),
            100_000,
        );
        expect(loot).toEqual({ wood: 733, clay: 733, iron: 733 });
        expect(
            distributeLoot({ wood: 200, clay: 0, iron: 0 }, 267, 1000),
        ).toEqual({ wood: 0, clay: 0, iron: 0 });
    });

    it('Versteck-Kapazität: 0 ohne Versteck, knapp 2 000 auf Stufe 10', () => {
        expect(hiddenCapacity(0)).toBe(0);
        expect(hiddenCapacity(1)).toBe(150);
        expect(hiddenCapacity(10)).toBeGreaterThan(1900);
        expect(hiddenCapacity(10)).toBeLessThan(2100);
    });
});

describe('Forschung', () => {
    const levels = {
        ...EMPTY_BUILDING_LEVELS,
        barracks: 1,
        stable: 1,
        smithy: 2,
    };

    it('Speerträger und Adelsgeschlecht brauchen keine', () => {
        expect(RESEARCH.spear).toBeNull();
        expect(RESEARCH.noble).toBeNull();
        expect(recruitBlock('spear', levels, [])).toBeNull();
        for (const unit of UNIT_ORDER) {
            if (unit !== 'spear' && unit !== 'noble')
                expect(RESEARCH[unit]).not.toBeNull();
        }
    });

    it('ohne Forschung keine Axt, mit Forschung schon', () => {
        expect(recruitBlock('axe', levels, [])).toBe('not_researched');
        expect(recruitBlock('axe', levels, ['axe'])).toBeNull();
        // Das Gebäude zuerst: ohne Werkstatt keine Ramme, erforscht oder nicht.
        expect(recruitBlock('ram', levels, ['ram'])).toBe(
            'workshop_missing',
        );
    });

    it('verlangt Schmiedenstufe und Nebengebäude', () => {
        expect(researchBlock('axe', levels, [])).toBeNull();
        expect(researchBlock('light_cavalry', levels, [])).toBe(
            'smithy_too_low',
        );
        expect(
            researchBlock(
                'light_cavalry',
                { ...levels, smithy: 3, stable: 0 },
                [],
            ),
        ).toBe('requirements_missing');
        expect(researchBlock('axe', levels, ['axe'])).toBe(
            'already_researched',
        );
        expect(researchBlock('spear', levels, [])).toBe(
            'no_research_needed',
        );
    });
});
