import { describe, expect, it } from 'vitest';
import {
    buildCost,
    buildingPop,
    buildTime,
    canAfford,
    carryCapacity,
    Duration,
    farmCapacity,
    productionPerHour,
    projectResources,
    requirementsMet,
    STARTING_BUILDINGS,
    unitCost,
    villagePoints,
    warehouseCapacity,
} from '../src/index.js';

describe('build costs', () => {
    it('level 1 equals base cost', () => {
        expect(buildCost('headquarters', 1)).toEqual({
            wood: 90,
            clay: 80,
            iron: 70,
        });
    });

    it('costs grow with level', () => {
        const l1 = buildCost('timber_camp', 1);
        const l10 = buildCost('timber_camp', 10);
        expect(l10.wood).toBeGreaterThan(l1.wood * 5);
    });
});

describe('build time', () => {
    it('HQ level reduces build time', () => {
        const slow = buildTime('barracks', 5, 1, 1);
        const fast = buildTime('barracks', 5, 20, 1);
        expect(fast).toBeLessThan(slow);
    });

    it('world speed divides build time', () => {
        const s1 = buildTime('farm', 3, 5, 1);
        const s100 = buildTime('farm', 3, 5, 100);
        expect(s100).toBeLessThanOrEqual(Math.ceil(s1 / 100) + 1000);
        expect(s100).toBeGreaterThanOrEqual(1000);
    });

    it('never returns less than 1 second', () => {
        expect(
            buildTime('timber_camp', 1, 30, 1000),
        ).toBeGreaterThanOrEqual(1000);
    });
});

describe('production & storage', () => {
    it('matches classic reference values', () => {
        expect(productionPerHour(1)).toBe(30);
        expect(warehouseCapacity(1)).toBe(1000);
        expect(farmCapacity(1)).toBe(240);
    });

    it('projects resources lazily and clamps at capacity', () => {
        const res = projectResources(
            { wood: 100, clay: 100, iron: 100 },
            { timber_camp: 1, clay_pit: 1, iron_mine: 1 },
            1000,
            Duration.hours(1),
            1,
        );
        expect(res.wood).toBeCloseTo(130);
        const capped = projectResources(
            { wood: 990, clay: 0, iron: 0 },
            { timber_camp: 10, clay_pit: 1, iron_mine: 1 },
            1000,
            Duration.hours(1),
            100,
        );
        expect(capped.wood).toBe(1000);
    });
});

describe('requirements & population', () => {
    it('stable requires HQ 10 and barracks 5', () => {
        const levels = { ...STARTING_BUILDINGS };
        expect(requirementsMet('stable', levels)).toBe(false);
        expect(
            requirementsMet('stable', {
                ...levels,
                headquarters: 10,
                barracks: 5,
            }),
        ).toBe(true);
    });

    it('warehouse and farm consume no population', () => {
        expect(buildingPop('warehouse', 20)).toBe(0);
        expect(buildingPop('farm', 20)).toBe(0);
        expect(buildingPop('headquarters', 1)).toBe(5);
    });
});

describe('units & misc', () => {
    it('unit costs scale linearly', () => {
        expect(unitCost('spear', 10)).toEqual({
            wood: 500,
            clay: 300,
            iron: 100,
        });
    });

    it('carry capacity sums per unit', () => {
        expect(carryCapacity({ spear: 2, light_cavalry: 1 })).toBe(
            2 * 25 + 80,
        );
    });

    it('canAfford compares all three resources', () => {
        expect(
            canAfford(
                { wood: 10, clay: 10, iron: 10 },
                { wood: 10, clay: 10, iron: 11 },
            ),
        ).toBe(false);
    });

    it('village points grow with buildings', () => {
        const start = villagePoints({ ...STARTING_BUILDINGS });
        const grown = villagePoints({
            ...STARTING_BUILDINGS,
            headquarters: 10,
            farm: 10,
        });
        expect(grown).toBeGreaterThan(start);
        expect(start).toBeGreaterThan(0);
    });
});
