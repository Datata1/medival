export * from './data/buildings.js';
export * from './data/siege.js';
export * from './data/units.js';
export * from './lib/objects.js';
export * from './logic/combat.js';
export * from './logic/continent.js';
export * from './logic/formulas.js';
export * from './logic/placement.js';
export * from './logic/relations.js';
export * from './logic/rng.js';
export * from './logic/terrain.js';
export * from './logic/tiles.js';
export * from './logic/travel.js';
export * from './schema/api.js';
export * from './schema/events.js';
export * from './schema/primitives.js';
export * from './schema/world.js';
export * from './time.js';
export * from './types.js';

import type { WorldSettings } from './types.js';

/**
 * Standard für neue Welten: Speed 1 wie eine Mehrspielerwelt
 * (plans/19-prototyp/19-3). Schnelle Welten zum Ausprobieren wählt man beim
 * Anlegen; Tests setzen ihren Speed ohnehin selbst.
 */
export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
    speed: 1,
    unitSpeed: 1,
    mapSize: 1000,
    botCount: 30,
    barbarianCount: 80,
    settlementDensity: 0.15,
    barbariansPerSettler: 2,
    barbarianAttemptsPerHour: 1,
    barbarianMaxPoints: 1500,
    victoryVillageShare: 0.6,
    seed: 0,
};

export const STARTING_LOYALTY = 100;

export const STARTING_BUILDINGS = {
    headquarters: 1,
    timber_camp: 1,
    clay_pit: 1,
    iron_mine: 1,
    warehouse: 1,
    farm: 1,
    barracks: 0,
    stable: 0,
    workshop: 0,
    wall: 0,
    market: 0,
    academy: 0,
} as const;

export const STARTING_RESOURCES = { wood: 500, clay: 500, iron: 400 };
