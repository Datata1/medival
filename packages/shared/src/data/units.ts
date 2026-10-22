import type { UnitSpec, UnitType } from '../types.js';

export const UNITS: Record<UnitType, UnitSpec> = {
    spear: {
        attack: 10,
        defense: 15,
        defenseCavalry: 45,
        speedMinPerField: 18,
        carry: 25,
        pop: 1,
        cost: { wood: 50, clay: 30, iron: 10 },
        recruitTimeS: 1020,
        recruitedAt: 'barracks',
        isCavalry: false,
    },
    sword: {
        attack: 25,
        defense: 50,
        defenseCavalry: 15,
        speedMinPerField: 22,
        carry: 15,
        pop: 1,
        cost: { wood: 30, clay: 30, iron: 70 },
        recruitTimeS: 1500,
        recruitedAt: 'barracks',
        isCavalry: false,
    },
    axe: {
        attack: 40,
        defense: 10,
        defenseCavalry: 5,
        speedMinPerField: 18,
        carry: 10,
        pop: 1,
        cost: { wood: 60, clay: 30, iron: 40 },
        recruitTimeS: 1320,
        recruitedAt: 'barracks',
        isCavalry: false,
    },
    light_cavalry: {
        attack: 130,
        defense: 30,
        defenseCavalry: 40,
        speedMinPerField: 10,
        carry: 80,
        pop: 4,
        cost: { wood: 125, clay: 100, iron: 250 },
        recruitTimeS: 1800,
        recruitedAt: 'stable',
        isCavalry: true,
    },
    heavy_cavalry: {
        attack: 150,
        defense: 200,
        defenseCavalry: 80,
        speedMinPerField: 11,
        carry: 50,
        pop: 6,
        cost: { wood: 200, clay: 150, iron: 600 },
        recruitTimeS: 3600,
        recruitedAt: 'stable',
        isCavalry: true,
    },
    ram: {
        attack: 2,
        defense: 20,
        defenseCavalry: 50,
        speedMinPerField: 30,
        carry: 0,
        pop: 5,
        cost: { wood: 300, clay: 200, iron: 200 },
        recruitTimeS: 4800,
        recruitedAt: 'barracks',
        isCavalry: false,
    },
    noble: {
        attack: 30,
        defense: 100,
        defenseCavalry: 50,
        speedMinPerField: 35,
        carry: 0,
        pop: 100,
        cost: { wood: 40000, clay: 50000, iron: 50000 },
        recruitTimeS: 12600,
        recruitedAt: 'academy',
        isCavalry: false,
    },
};

export const UNIT_ORDER = [
    'spear',
    'sword',
    'axe',
    'light_cavalry',
    'heavy_cavalry',
    'ram',
    'noble',
] as const satisfies readonly UnitType[];

/** Loyalty hit range per surviving noble attack (inclusive). */
export const NOBLE_LOYALTY_MIN = 20;
export const NOBLE_LOYALTY_MAX = 35;

/** Loyalty regeneration per hour at world speed 1. */
export const LOYALTY_REGEN_PER_HOUR = 1;
