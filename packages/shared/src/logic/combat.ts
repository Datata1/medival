import {
    WALL_BASE_DEFENSE_PER_LEVEL,
    WALL_DEFENSE_FACTOR_PER_LEVEL,
} from '../data/buildings.js';
import {
    NOBLE_LOYALTY_MAX,
    NOBLE_LOYALTY_MIN,
    UNITS,
} from '../data/units.js';
import { entriesOf } from '../lib/objects.js';
import type { BattleResult, Units, UnitType } from '../types.js';
import { type Rng, randInt } from './rng.js';

export const LUCK_RANGE = 0.15;

function entries(units: Units): [UnitType, number][] {
    return entriesOf(units).filter(([, n]) => n > 0);
}

function attackPower(units: Units): {
    total: number;
    infRatio: number;
    cavRatio: number;
} {
    let inf = 0;
    let cav = 0;
    for (const [t, n] of entries(units)) {
        if (UNITS[t].isCavalry) cav += UNITS[t].attack * n;
        else inf += UNITS[t].attack * n;
    }
    const total = inf + cav;
    if (total === 0) return { total: 0, infRatio: 1, cavRatio: 0 };
    return { total, infRatio: inf / total, cavRatio: cav / total };
}

function defensePower(
    units: Units,
    infRatio: number,
    cavRatio: number,
): number {
    let defInf = 0;
    let defCav = 0;
    for (const [t, n] of entries(units)) {
        defInf += UNITS[t].defense * n;
        defCav += UNITS[t].defenseCavalry * n;
    }
    return defInf * infRatio + defCav * cavRatio;
}

function applyLosses(
    units: Units,
    ratio: number,
): { losses: Units; survivors: Units } {
    const losses: Units = {};
    const survivors: Units = {};
    for (const [t, n] of entries(units)) {
        const lost = Math.min(n, Math.round(n * ratio));
        losses[t] = lost;
        survivors[t] = n - lost;
    }
    return { losses, survivors };
}

/** Wall levels destroyed by a ram attack (computed from rams sent, not survivors). */
export function ramDamage(ramCount: number, wallLevel: number): number {
    if (ramCount <= 0 || wallLevel <= 0) return 0;
    return Math.min(wallLevel, Math.floor(ramCount / 4));
}

export interface BattleInput {
    attacker: Units;
    defender: Units;
    wallLevel: number;
    loyalty: number;
    rng: Rng;
}

/**
 * Resolve a battle at the moment of impact. Single-round model:
 * - Rams batter the wall down during the fight (half of final damage counts mid-battle).
 * - Defense is weighted by the attacker's infantry/cavalry composition.
 * - The wall multiplies defense and adds flat base defense.
 * - Winner-side losses follow the classic (loser/winner)^1.5 power rule.
 * - Each surviving noble on a winning attack deals one loyalty hit
 *   (unlike the original's one-hit-per-attack — saves noble-train micro).
 */
export function resolveBattle(input: BattleInput): BattleResult {
    const { attacker, defender, wallLevel, rng } = input;

    const rams = attacker.ram ?? 0;
    const fullDamage = ramDamage(rams, wallLevel);
    const wallDuringBattle = Math.max(
        0,
        wallLevel - Math.floor(fullDamage / 2),
    );

    const atk = attackPower(attacker);
    const luck = (rng() * 2 - 1) * LUCK_RANGE;
    const effectiveAttack = atk.total * (1 + luck);

    let defense = defensePower(defender, atk.infRatio, atk.cavRatio);
    defense *= 1 + WALL_DEFENSE_FACTOR_PER_LEVEL * wallDuringBattle;
    defense += WALL_BASE_DEFENSE_PER_LEVEL * wallDuringBattle;

    const attackerWon = effectiveAttack > defense;

    let attackerLosses: Units;
    let attackerSurvivors: Units;
    let defenderLosses: Units;
    let defenderSurvivors: Units;

    if (attackerWon) {
        const ratio =
            defense <= 0 ? 0 : (defense / effectiveAttack) ** 1.5;
        ({ losses: attackerLosses, survivors: attackerSurvivors } =
            applyLosses(attacker, ratio));
        ({ losses: defenderLosses, survivors: defenderSurvivors } =
            applyLosses(defender, 1));
    } else {
        const ratio =
            effectiveAttack <= 0
                ? 0
                : (effectiveAttack / defense) ** 1.5;
        ({ losses: attackerLosses, survivors: attackerSurvivors } =
            applyLosses(attacker, 1));
        ({ losses: defenderLosses, survivors: defenderSurvivors } =
            applyLosses(defender, ratio));
    }

    const wallLevelAfter = attackerWon
        ? Math.max(0, wallLevel - fullDamage)
        : Math.max(0, wallLevel - Math.floor(fullDamage / 2));

    let loyaltyDamage = 0;
    if (attackerWon) {
        for (let i = 0; i < (attackerSurvivors.noble ?? 0); i++) {
            loyaltyDamage += randInt(
                rng,
                NOBLE_LOYALTY_MIN,
                NOBLE_LOYALTY_MAX,
            );
        }
    }

    return {
        attackerWon,
        attackerLosses,
        defenderLosses,
        attackerSurvivors,
        defenderSurvivors,
        wallLevelBefore: wallLevel,
        wallLevelAfter,
        loyaltyDamage,
        luck,
    };
}
