import type {
    BuildingLevels,
    BuildingSpec,
    BuildingType,
} from '../types.js';

export const BUILDINGS: Record<BuildingType, BuildingSpec> = {
    headquarters: {
        baseCost: { wood: 90, clay: 80, iron: 70 },
        costFactor: 1.26,
        baseTimeS: 900,
        timeFactor: 1.2,
        maxLevel: 30,
        basePop: 5,
        popFactor: 1.17,
    },
    timber_camp: {
        baseCost: { wood: 50, clay: 60, iron: 40 },
        costFactor: 1.25,
        baseTimeS: 900,
        timeFactor: 1.2,
        maxLevel: 30,
        basePop: 5,
        popFactor: 1.15,
    },
    clay_pit: {
        baseCost: { wood: 65, clay: 50, iron: 40 },
        costFactor: 1.25,
        baseTimeS: 900,
        timeFactor: 1.2,
        maxLevel: 30,
        basePop: 5,
        popFactor: 1.15,
    },
    iron_mine: {
        baseCost: { wood: 75, clay: 65, iron: 70 },
        costFactor: 1.25,
        baseTimeS: 1080,
        timeFactor: 1.2,
        maxLevel: 30,
        basePop: 5,
        popFactor: 1.15,
    },
    warehouse: {
        baseCost: { wood: 60, clay: 50, iron: 40 },
        costFactor: 1.265,
        baseTimeS: 1020,
        timeFactor: 1.2,
        maxLevel: 30,
        basePop: 0,
        popFactor: 1,
    },
    farm: {
        baseCost: { wood: 45, clay: 40, iron: 30 },
        costFactor: 1.3,
        baseTimeS: 1200,
        timeFactor: 1.2,
        maxLevel: 30,
        basePop: 0,
        popFactor: 1,
    },
    barracks: {
        baseCost: { wood: 200, clay: 170, iron: 90 },
        costFactor: 1.26,
        baseTimeS: 1800,
        timeFactor: 1.2,
        maxLevel: 25,
        basePop: 7,
        popFactor: 1.17,
        requires: { headquarters: 3 },
    },
    stable: {
        baseCost: { wood: 270, clay: 240, iron: 260 },
        costFactor: 1.26,
        baseTimeS: 3600,
        timeFactor: 1.2,
        maxLevel: 20,
        basePop: 8,
        popFactor: 1.17,
        requires: { headquarters: 10, barracks: 5 },
    },
    /**
     * Werkstatt (plans/19-prototyp/19-11): Rammböcke und Katapulte, mit
     * eigener Schleife neben der Kaserne. Werte nach Tribal Wars.
     */
    workshop: {
        baseCost: { wood: 300, clay: 240, iron: 260 },
        costFactor: 1.26,
        baseTimeS: 6000,
        timeFactor: 1.2,
        maxLevel: 15,
        basePop: 8,
        popFactor: 1.17,
        // Schmiede 10 (19-13): Belagerungsgerät kommt nach der Forschung.
        requires: { headquarters: 10, smithy: 10 },
    },
    /**
     * Schmiede (plans/19-prototyp/19-13): erforscht Einheiten. Ohne Forschung
     * gibt es nur Speerträger. Werte nach Tribal Wars.
     */
    smithy: {
        baseCost: { wood: 220, clay: 180, iron: 240 },
        costFactor: 1.26,
        baseTimeS: 6000,
        timeFactor: 1.2,
        maxLevel: 20,
        basePop: 20,
        popFactor: 1.17,
        requires: { headquarters: 5, barracks: 1 },
    },
    /**
     * Versammlungsplatz (19-13): ohne ihn kann ein Dorf keine Truppen
     * schicken. Jedes Dorf hat ihn ab Start; Katapulte können ihn
     * zerstören, dann muss er neu gebaut werden.
     */
    rally_point: {
        baseCost: { wood: 10, clay: 40, iron: 30 },
        costFactor: 1.26,
        baseTimeS: 600,
        timeFactor: 1.2,
        maxLevel: 1,
        basePop: 0,
        popFactor: 1,
    },
    wall: {
        baseCost: { wood: 50, clay: 100, iron: 20 },
        costFactor: 1.26,
        baseTimeS: 3600,
        timeFactor: 1.2,
        maxLevel: 20,
        basePop: 5,
        popFactor: 1.17,
        requires: { barracks: 1 },
    },
    /**
     * Versteck (19-13): schützt je Rohstoff `hiddenCapacity(level)` vor
     * Plünderung. Werte nach Tribal Wars.
     */
    hiding_place: {
        baseCost: { wood: 50, clay: 60, iron: 50 },
        costFactor: 1.25,
        baseTimeS: 1800,
        timeFactor: 1.2,
        maxLevel: 10,
        basePop: 2,
        popFactor: 1.17,
    },
    /**
     * Statue (plans/19-prototyp/19-14): ernennt den Paladin — einen je
     * Spieler, nicht je Dorf. Nur in Welten mit `paladin`.
     */
    statue: {
        baseCost: { wood: 220, clay: 220, iron: 220 },
        costFactor: 1,
        baseTimeS: 1500,
        timeFactor: 1,
        maxLevel: 1,
        basePop: 10,
        popFactor: 1,
    },
    market: {
        baseCost: { wood: 100, clay: 120, iron: 70 },
        costFactor: 1.26,
        baseTimeS: 1500,
        timeFactor: 1.2,
        maxLevel: 25,
        basePop: 4,
        popFactor: 1.17,
        requires: { headquarters: 3, warehouse: 2 },
    },
    academy: {
        baseCost: { wood: 15000, clay: 25000, iron: 10000 },
        costFactor: 2,
        baseTimeS: 10800,
        timeFactor: 1.2,
        maxLevel: 1,
        basePop: 80,
        popFactor: 1.17,
        requires: { headquarters: 20, stable: 10 },
    },
};

export const BUILDING_ORDER = [
    'headquarters',
    'timber_camp',
    'clay_pit',
    'iron_mine',
    'warehouse',
    'farm',
    'barracks',
    'stable',
    'workshop',
    'smithy',
    'rally_point',
    'wall',
    'hiding_place',
    'statue',
    'market',
    'academy',
] as const satisfies readonly BuildingType[];

/**
 * Alle Gebäude auf Stufe 0. Bewusst als vollständiges Literal statt generiert:
 * So erzwingt der Compiler bei einem neuen Gebäudetyp eine Ergänzung hier —
 * eine generierte Variante bräuchte einen Cast und würde still unvollständig.
 */
export const EMPTY_BUILDING_LEVELS: BuildingLevels = {
    headquarters: 0,
    timber_camp: 0,
    clay_pit: 0,
    iron_mine: 0,
    warehouse: 0,
    farm: 0,
    barracks: 0,
    stable: 0,
    workshop: 0,
    smithy: 0,
    rally_point: 0,
    wall: 0,
    hiding_place: 0,
    statue: 0,
    market: 0,
    academy: 0,
};

/** Wall: multiplies total defense and contributes flat base defense. */
export const WALL_DEFENSE_FACTOR_PER_LEVEL = 0.05;
export const WALL_BASE_DEFENSE_PER_LEVEL = 30;

/**
 * Geschützte Menge je Rohstoff im Versteck (19-13): Sie bleibt bei einer
 * Plünderung im Dorf. Stufe 10 schützt knapp 2 000.
 */
export function hiddenCapacity(level: number): number {
    if (level <= 0) return 0;
    return Math.round(150 * 1.3335 ** (level - 1));
}

/** Warehouse capacity at a given level. */
export function warehouseCapacity(level: number): number {
    if (level <= 0) return 500;
    return Math.round(1000 * 1.2294 ** (level - 1));
}

/** Max farm population at a given level. */
export function farmCapacity(level: number): number {
    if (level <= 0) return 0;
    return Math.round(240 * 1.172 ** (level - 1));
}

/**
 * Händler eines Marktplatzes. Sie sind die Obergrenze für gekaufte
 * Freundschaft (plans/16-ansehen-und-handel.md): Ohne sie ließe sich dieselbe
 * Menge beliebig oft in kleinen Portionen verschicken, und Ansehen wäre
 * schlicht käuflich.
 */
export function merchantCount(level: number): number {
    return level <= 0 ? 0 : level;
}

/** Wie viele Rohstoffe ein Händler trägt. */
export const MERCHANT_CAPACITY = 1000;

/** Gesamte Transportkapazität eines Marktplatzes. */
export function marketCapacity(level: number): number {
    return merchantCount(level) * MERCHANT_CAPACITY;
}

/**
 * Minuten je Feld für Händler bei Weltgeschwindigkeit 1 — langsamer als
 * Kavallerie, schneller als Rammböcke.
 */
export const MERCHANT_MIN_PER_FIELD = 25;

/** Resource production per hour at world speed 1 for a mine/camp/pit level. */
export function productionPerHour(level: number): number {
    if (level <= 0) return 5;
    return Math.round(30 * 1.163 ** (level - 1));
}
