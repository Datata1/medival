export * from './data/buildings.js';
export * from './data/units.js';
export * from './lib/objects.js';
export * from './logic/combat.js';
export * from './logic/formulas.js';
export * from './logic/rng.js';
export * from './logic/travel.js';
export * from './schema/api.js';
export * from './schema/events.js';
export * from './schema/primitives.js';
export * from './schema/world.js';
export * from './time.js';
export * from './types.js';

import type { WorldSettings } from './types.js';

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
    speed: 200,
    unitSpeed: 30,
    mapSize: 100,
    botCount: 30,
    barbarianCount: 80,
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
    wall: 0,
    academy: 0,
} as const;

export const STARTING_RESOURCES = { wood: 500, clay: 500, iron: 400 };
