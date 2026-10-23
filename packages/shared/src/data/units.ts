import type { UnitSpec, UnitType } from '../types.js';

export const UNITS: Record<UnitType, UnitSpec> = {
    spear: {
        attack: 10,
        defense: 15,
        defenseCavalry: 45,
        defenseArcher: 20,
        speedMinPerField: 18,
        carry: 25,
        pop: 1,
        cost: { wood: 50, clay: 30, iron: 10 },
        recruitTimeS: 1020,
        recruitedAt: 'barracks',
        attackClass: 'infantry',
    },
    sword: {
        attack: 25,
        defense: 50,
        defenseCavalry: 15,
        defenseArcher: 40,
        speedMinPerField: 22,
        carry: 15,
        pop: 1,
        cost: { wood: 30, clay: 30, iron: 70 },
        recruitTimeS: 1500,
        recruitedAt: 'barracks',
        attackClass: 'infantry',
    },
    axe: {
        attack: 40,
        defense: 10,
        defenseCavalry: 5,
        defenseArcher: 10,
        speedMinPerField: 18,
        carry: 10,
        pop: 1,
        cost: { wood: 60, clay: 30, iron: 40 },
        recruitTimeS: 1320,
        recruitedAt: 'barracks',
        attackClass: 'infantry',
    },
    /**
     * Späher (plans/19-prototyp/19-10): greift nicht an, sondern erkundet. Ein
     * Angriff nur aus Spähern ist eine Spähmission und kämpft nur gegen die
     * Späher im Ziel. Werte nach Tribal Wars.
     */
    spy: {
        attack: 0,
        defense: 2,
        defenseCavalry: 1,
        defenseArcher: 2,
        speedMinPerField: 9,
        carry: 0,
        pop: 2,
        cost: { wood: 50, clay: 50, iron: 20 },
        recruitTimeS: 900,
        recruitedAt: 'stable',
        attackClass: 'cavalry',
    },
    /**
     * Bogenschützen (plans/19-prototyp/19-12): eigene Angriffsklasse, nur in
     * Welten mit `archers`. Werte nach Tribal Wars.
     */
    archer: {
        attack: 15,
        defense: 50,
        defenseCavalry: 40,
        defenseArcher: 5,
        speedMinPerField: 18,
        carry: 10,
        pop: 1,
        cost: { wood: 100, clay: 30, iron: 60 },
        recruitTimeS: 1800,
        recruitedAt: 'barracks',
        attackClass: 'archer',
    },
    light_cavalry: {
        attack: 130,
        defense: 30,
        defenseCavalry: 40,
        defenseArcher: 30,
        speedMinPerField: 10,
        carry: 80,
        pop: 4,
        cost: { wood: 125, clay: 100, iron: 250 },
        recruitTimeS: 1800,
        recruitedAt: 'stable',
        attackClass: 'cavalry',
    },
    mounted_archer: {
        attack: 120,
        defense: 40,
        defenseCavalry: 30,
        defenseArcher: 50,
        speedMinPerField: 10,
        carry: 50,
        pop: 5,
        cost: { wood: 250, clay: 100, iron: 150 },
        recruitTimeS: 2700,
        recruitedAt: 'stable',
        attackClass: 'archer',
    },
    heavy_cavalry: {
        attack: 150,
        defense: 200,
        defenseCavalry: 80,
        defenseArcher: 180,
        speedMinPerField: 11,
        carry: 50,
        pop: 6,
        cost: { wood: 200, clay: 150, iron: 600 },
        recruitTimeS: 3600,
        recruitedAt: 'stable',
        attackClass: 'cavalry',
    },
    // Seit 19-11 in der Werkstatt statt der Kaserne, wie in Tribal Wars.
    ram: {
        attack: 2,
        defense: 20,
        defenseCavalry: 50,
        defenseArcher: 20,
        speedMinPerField: 30,
        carry: 0,
        pop: 5,
        cost: { wood: 300, clay: 200, iron: 200 },
        recruitTimeS: 4800,
        recruitedAt: 'workshop',
        attackClass: 'infantry',
    },
    /**
     * Katapult (plans/19-prototyp/19-11): beschießt beim Angriff ein Gebäude,
     * das beim Abschicken gewählt wird. Werte nach Tribal Wars.
     */
    catapult: {
        attack: 100,
        defense: 100,
        defenseCavalry: 50,
        defenseArcher: 100,
        speedMinPerField: 30,
        carry: 0,
        pop: 8,
        cost: { wood: 320, clay: 400, iron: 100 },
        recruitTimeS: 7200,
        recruitedAt: 'workshop',
        attackClass: 'infantry',
    },
    noble: {
        attack: 30,
        defense: 100,
        defenseCavalry: 50,
        defenseArcher: 100,
        speedMinPerField: 35,
        carry: 0,
        pop: 100,
        cost: { wood: 40000, clay: 50000, iron: 50000 },
        recruitTimeS: 12600,
        recruitedAt: 'academy',
        attackClass: 'infantry',
    },
};

export const UNIT_ORDER = [
    'spear',
    'sword',
    'axe',
    'archer',
    'spy',
    'light_cavalry',
    'mounted_archer',
    'heavy_cavalry',
    'ram',
    'catapult',
    'noble',
] as const satisfies readonly UnitType[];

/** Nur in Welten mit `archers` (19-12); siehe `unitsEnabled`. */
export const ARCHER_UNITS = [
    'archer',
    'mounted_archer',
] as const satisfies readonly UnitType[];

/** Loyalty hit range per surviving noble attack (inclusive). */
export const NOBLE_LOYALTY_MIN = 20;
export const NOBLE_LOYALTY_MAX = 35;

/** Loyalty regeneration per hour at world speed 1. */
export const LOYALTY_REGEN_PER_HOUR = 1;

/**
 * Spähkampf (19-10): Anteil der angreifenden Späher, die fallen, ist
 * `min(1, (Verteidiger/Angreifer)^1,5 · Faktor)`. Bei Gleichstand fällt die
 * Hälfte, bei doppelter Übermacht der Verteidiger fallen alle.
 */
export const SPY_DEFENSE_FACTOR = 0.5;

/** Ab welchem Anteil überlebender Späher welche Stufe erkundet wird. */
export const SPY_TIER_BUILDINGS = 0.5;
export const SPY_TIER_UNITS_AWAY = 0.7;
