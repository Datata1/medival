import {
    BUILDINGS,
    EMPTY_BUILDING_LEVELS,
    productionPerHour,
} from '../data/buildings.js';
import { UNITS } from '../data/units.js';
import { entriesOf, keysOf } from '../lib/objects.js';
import { amountAtRate, Duration, type DurationLike } from '../time.js';
import {
    type BuildingLevels,
    type BuildingType,
    RESOURCE_KEYS,
    type Resources,
    type Units,
    type UnitType,
} from '../types.js';

/**
 * Baut ein vollständiges `BuildingLevels` aus (unvollständigen) Datenbankzeilen.
 * Startet von einem Record mit allen Gebäuden auf Stufe 0 — dadurch ist das
 * Ergebnis per Konstruktion vollständig und braucht keinen Cast.
 */
export function buildingLevelsFrom(
    rows: Iterable<{ type: BuildingType; level: number }>,
): BuildingLevels {
    const levels: BuildingLevels = { ...EMPTY_BUILDING_LEVELS };
    for (const row of rows) levels[row.type] = row.level;
    return levels;
}

/** Cost to upgrade a building TO the given level. */
export function buildCost(
    type: BuildingType,
    level: number,
): Resources {
    const spec = BUILDINGS[type];
    const f = spec.costFactor ** (level - 1);
    return {
        wood: Math.round(spec.baseCost.wood * f),
        clay: Math.round(spec.baseCost.clay * f),
        iron: Math.round(spec.baseCost.iron * f),
    };
}

/**
 * Time to build TO the given level.
 * HQ reduces build time by 4% per level (multiplicative).
 */
export function buildTime(
    type: BuildingType,
    level: number,
    hqLevel: number,
    worldSpeed: number,
): Duration {
    const spec = BUILDINGS[type];
    const raw = Duration.seconds(
        spec.baseTimeS * spec.timeFactor ** (level - 1),
    );
    const hqBonus = 0.96 ** hqLevel;
    return Duration.atLeast(
        Duration.scale(raw, hqBonus / worldSpeed),
        Duration.seconds(1),
    );
}

/** Population used by a building at a level. */
export function buildingPop(type: BuildingType, level: number): number {
    if (level <= 0) return 0;
    const spec = BUILDINGS[type];
    if (spec.basePop === 0) return 0;
    return Math.round(spec.basePop * spec.popFactor ** (level - 1));
}

export function totalBuildingPop(levels: BuildingLevels): number {
    return keysOf(levels).reduce(
        (sum, t) => sum + buildingPop(t, levels[t]),
        0,
    );
}

export function unitPop(units: Units): number {
    return entriesOf(units).reduce(
        (sum, [t, n]) => sum + UNITS[t].pop * n,
        0,
    );
}

/** Whether prerequisites for building the first level are met. */
export function requirementsMet(
    type: BuildingType,
    levels: BuildingLevels,
): boolean {
    const req = BUILDINGS[type].requires;
    if (!req) return true;
    return entriesOf(req).every(([b, min]) => levels[b] >= min);
}

/** Production per game-hour for one resource building level, scaled by world speed. */
export function resourceRatePerHour(
    level: number,
    worldSpeed: number,
): number {
    return productionPerHour(level) * worldSpeed;
}

/**
 * Lazy resource evaluation: project stored resources forward by elapsed game time.
 * Returns clamped values; never mutates input.
 */
export function projectResources(
    stored: Resources,
    levels: {
        timber_camp: number;
        clay_pit: number;
        iron_mine: number;
    },
    capacity: number,
    elapsed: DurationLike,
    worldSpeed: number,
): Resources {
    const grown = (level: number, base: number) =>
        Math.min(
            capacity,
            base +
                amountAtRate(
                    resourceRatePerHour(level, worldSpeed),
                    elapsed,
                ),
        );
    return {
        wood: grown(levels.timber_camp, stored.wood),
        clay: grown(levels.clay_pit, stored.clay),
        iron: grown(levels.iron_mine, stored.iron),
    };
}

/**
 * Wann kann man sich `cost` leisten? (siehe plans/15-bot-grundgeruest.md)
 *
 * Der Kern der Bot-Planung: Weil die Produktion deterministisch ist, muss man
 * auf den Zeitpunkt nicht warten und auch nicht regelmäßig nachschauen — man
 * kann ihn ausrechnen und den nächsten Denk-Tick genau darauf legen. Damit
 * bleibt die Engine ohne Tick, so wie es Plan 14 für Barbaren gelöst hat.
 *
 *   t = max über {wood, clay, iron} von (kosten − vorrat) / rate
 *
 * Gibt `null` für „nie erreichbar" zurück — zwei Fälle, die beide keine
 * Wartezeit sind, sondern eine andere Entscheidung erzwingen:
 *
 *   - Rate 0 bei fehlendem Rohstoff → erst das Rohstoffgebäude bauen.
 *   - Kosten über der Speicherkapazität → erst den Speicher ausbauen.
 *
 * Ohne diese Unterscheidung liefe ein Bot in eine Endlosschleife: Er würde
 * ewig auf etwas sparen, das nie in sein Lager passt.
 */
export function timeUntilAffordable(
    have: Resources,
    cost: Resources,
    ratesPerHour: Resources,
    capacity = Number.POSITIVE_INFINITY,
): Duration | null {
    let longestHours = 0;
    for (const key of RESOURCE_KEYS) {
        const missing = cost[key] - have[key];
        if (missing <= 0) continue;
        if (cost[key] > capacity) return null; // passt nie ins Lager
        const rate = ratesPerHour[key];
        if (!(rate > 0)) return null; // wächst nie nach
        longestHours = Math.max(longestHours, missing / rate);
    }
    return Duration.hours(longestHours);
}

export function canAfford(have: Resources, cost: Resources): boolean {
    return (
        have.wood >= cost.wood &&
        have.clay >= cost.clay &&
        have.iron >= cost.iron
    );
}

export function subtractResources(
    have: Resources,
    cost: Resources,
): Resources {
    return {
        wood: have.wood - cost.wood,
        clay: have.clay - cost.clay,
        iron: have.iron - cost.iron,
    };
}

export function unitCost(type: UnitType, count: number): Resources {
    const c = UNITS[type].cost;
    return {
        wood: c.wood * count,
        clay: c.clay * count,
        iron: c.iron * count,
    };
}

/** Recruit time per unit. */
export function recruitTime(
    type: UnitType,
    worldSpeed: number,
): Duration {
    return Duration.atLeast(
        Duration.scale(
            Duration.seconds(UNITS[type].recruitTimeS),
            1 / worldSpeed,
        ),
        Duration.ms(500),
    );
}

/** Total loot capacity of a set of units. */
export function carryCapacity(units: Units): number {
    return entriesOf(units).reduce(
        (sum, [t, n]) => sum + UNITS[t].carry * n,
        0,
    );
}

/** Village points: sum of building levels weighted a bit by cost tier. */
export function villagePoints(levels: BuildingLevels): number {
    return keysOf(levels).reduce((sum: number, t) => {
        const lvl = levels[t];
        if (lvl <= 0) return sum;
        const spec = BUILDINGS[t];
        const weight = Math.max(
            1,
            Math.round(
                (spec.baseCost.wood +
                    spec.baseCost.clay +
                    spec.baseCost.iron) /
                    60,
            ),
        );
        let pts = 0;
        for (let l = 1; l <= lvl; l++)
            pts += Math.round(weight * 1.15 ** (l - 1));
        return sum + pts;
    }, 0);
}
