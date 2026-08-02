export type BuildingType =
    | 'headquarters'
    | 'timber_camp'
    | 'clay_pit'
    | 'iron_mine'
    | 'warehouse'
    | 'farm'
    | 'barracks'
    | 'stable'
    | 'wall'
    | 'academy'
    | 'market';

export type UnitType =
    | 'spear'
    | 'sword'
    | 'axe'
    | 'light_cavalry'
    | 'heavy_cavalry'
    | 'ram'
    | 'noble';

export interface Resources {
    wood: number;
    clay: number;
    iron: number;
}

/**
 * Die drei Rohstoffe in fester Reihenfolge — für Schleifen über `Resources`.
 * Bewusst ein Literal statt `keysOf`: Bei einem vierten Rohstoff soll der
 * Compiler eine Ergänzung erzwingen, nicht still eine Stelle auslassen.
 */
export const RESOURCE_KEYS = [
    'wood',
    'clay',
    'iron',
] as const satisfies readonly (keyof Resources)[];

export type Units = Partial<Record<UnitType, number>>;

export type BuildingLevels = Record<BuildingType, number>;

export interface BuildingSpec {
    /** Cost of level 1 */
    baseCost: Resources;
    /** Cost multiplier per level */
    costFactor: number;
    /** Build time of level 1 in seconds at world speed 1, HQ level 1 */
    baseTimeS: number;
    /** Build time multiplier per level */
    timeFactor: number;
    maxLevel: number;
    /** Population used per level (linear-ish, applied via popFactor) */
    basePop: number;
    popFactor: number;
    /** Minimum levels of other buildings required before level 1 can be built */
    requires?: Partial<Record<BuildingType, number>>;
}

export interface UnitSpec {
    attack: number;
    /** Defense against infantry */
    defense: number;
    /** Defense against cavalry */
    defenseCavalry: number;
    /** Minutes per map field at world speed 1 */
    speedMinPerField: number;
    /** Loot capacity */
    carry: number;
    /** Farm population per unit */
    pop: number;
    cost: Resources;
    /** Recruit time in seconds at world speed 1 */
    recruitTimeS: number;
    recruitedAt: 'barracks' | 'stable' | 'academy';
    isCavalry: boolean;
}

export type MovementKind =
    | 'attack'
    | 'support'
    | 'return'
    /** Rohstofflieferung; Händler kehren danach als `return` zurück. */
    | 'trade';

export const MOVEMENT_KINDS = [
    'attack',
    'support',
    'return',
    'trade',
] as const satisfies readonly MovementKind[];

export interface WorldSettings {
    /** Scales production, build/recruit times, loyalty regen. */
    speed: number;
    /** Separate scaling for troop travel; keeps marches playable at high speed. */
    unitSpeed: number;
    mapSize: number;
    botCount: number;
    barbarianCount: number;
    /**
     * Mittlere Handlungsversuche eines Barbarendorfs pro Stunde **bei
     * Weltgeschwindigkeit 1**; wird wie die Produktion mit `speed`
     * multipliziert. 0 hält Barbaren statisch (Verhalten vor Plan 14).
     */
    barbarianAttemptsPerHour: number;
    /** Punktedeckel, ab dem ein Barbarendorf nicht mehr ausbaut. */
    barbarianMaxPoints: number;
    /** Fraction of all villages the player must own to win, 0..1 */
    victoryVillageShare: number;
    seed: number;
}

export interface BattleSide {
    units: Units;
}

export interface BattleResult {
    attackerWon: boolean;
    attackerLosses: Units;
    defenderLosses: Units;
    attackerSurvivors: Units;
    defenderSurvivors: Units;
    wallLevelBefore: number;
    wallLevelAfter: number;
    loyaltyDamage: number;
    /** Luck applied to attacker, e.g. -0.15..+0.15 */
    luck: number;
}
