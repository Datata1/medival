import {
    WALL_BASE_DEFENSE_PER_LEVEL,
    WALL_DEFENSE_FACTOR_PER_LEVEL,
} from '../data/buildings.js';
import {
    CATAPULTS_PER_LEVEL,
    MIN_LEVEL_AFTER_CATAPULTS,
} from '../data/siege.js';
import {
    NOBLE_LOYALTY_MAX,
    NOBLE_LOYALTY_MIN,
    SPY_DEFENSE_FACTOR,
    SPY_TIER_BUILDINGS,
    SPY_TIER_UNITS_AWAY,
    UNITS,
} from '../data/units.js';
import { entriesOf } from '../lib/objects.js';
import type {
    BattleResult,
    BuildingType,
    Units,
    UnitType,
} from '../types.js';
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
        if (UNITS[t].attackClass === 'cavalry')
            cav += UNITS[t].attack * n;
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

/**
 * Schätzt den Ausgang eines Angriffs **ohne** Glücksfaktor — für Bots
 * (siehe plans/17-staemme-und-krieg.md).
 *
 * Bewusst dieselbe `resolveBattle`-Funktion, die auch den echten Kampf
 * entscheidet: Ein zweites, vereinfachtes Kampfmodell für Bots wäre nach der
 * nächsten Balancing-Änderung falsch, ohne dass es jemand merkt. Der einzige
 * Unterschied ist der neutrale Zufall — geschätzt wird der Erwartungswert,
 * nicht ein einzelner Wurf.
 */
export function estimateBattle(
    attacker: Units,
    defender: Units,
    wallLevel: number,
): BattleResult {
    return resolveBattle({
        attacker,
        defender,
        wallLevel,
        loyalty: 100,
        rng: () => 0.5, // kein Glück, kein Pech
    });
}

/**
 * Wie deutlich ein Angriff ausgehen würde: Anteil der überlebenden Angreifer
 * am Verhältnis zur eingesetzten Streitmacht.
 *
 * 1 = ohne Verluste durchmarschiert, 0 = vollständig aufgerieben. Bots
 * verlangen je nach Persönlichkeit eine Mindestdeutlichkeit, statt jeden
 * knappen Sieg mitzunehmen.
 */
export function attackMargin(
    attacker: Units,
    defender: Units,
    wallLevel: number,
): number {
    const result = estimateBattle(attacker, defender, wallLevel);
    if (!result.attackerWon) return 0;
    const sent = entriesOf(attacker).reduce((s, [, n]) => s + n, 0);
    if (sent <= 0) return 0;
    const left = entriesOf(result.attackerSurvivors).reduce(
        (s, [, n]) => s + n,
        0,
    );
    return left / sent;
}

/**
 * Wie viel ein Spähtrupp erfährt (19-10): 0 = nichts (alle gefallen),
 * 1 = Rohstoffe und Truppen zu Hause, 2 = zusätzlich Gebäude,
 * 3 = zusätzlich Truppen außerhalb.
 */
export type SpyTier = 0 | 1 | 2 | 3;

/** Ist `units` ein reiner Spähtrupp? Dann kämpft er nur gegen Späher. */
export function isScoutMission(units: Units): boolean {
    const kinds = entries(units);
    return kinds.length > 0 && kinds.every(([t]) => t === 'spy');
}

/**
 * Spähkampf: Späher gegen Späher (plans/19-prototyp/19-10).
 *
 * Die übrige Verteidigung spielt keine Rolle — Späher schleichen sich vorbei
 * oder werden von gegnerischen Spähern gestellt. Die Verteidiger-Späher
 * verlieren nichts. **Pur**; der Zufall rundet nur den Bruchteil eines
 * Spähers, damit kleine Trupps nicht immer gleich ausgehen.
 */
export function resolveSpying(
    sent: number,
    defenderSpies: number,
    rng: Rng,
): { lost: number; survivors: number; tier: SpyTier } {
    if (sent <= 0) return { lost: 0, survivors: 0, tier: 0 };
    const share =
        defenderSpies <= 0
            ? 0
            : Math.min(
                  1,
                  (defenderSpies / sent) ** 1.5 * SPY_DEFENSE_FACTOR,
              );
    const exact = sent * share;
    const lost = Math.min(
        sent,
        Math.floor(exact) + (rng() < exact - Math.floor(exact) ? 1 : 0),
    );
    const survivors = sent - lost;
    return { lost, survivors, tier: spyTier(survivors, sent) };
}

export function spyTier(survivors: number, sent: number): SpyTier {
    if (survivors <= 0 || sent <= 0) return 0;
    const share = survivors / sent;
    if (share >= SPY_TIER_UNITS_AWAY) return 3;
    if (share >= SPY_TIER_BUILDINGS) return 2;
    return 1;
}

/**
 * Wie weit Katapulte ein Gebäude senken (plans/19-prototyp/19-11).
 *
 * Stufe für Stufe nach `CATAPULTS_PER_LEVEL`: Reichen die Katapulte für die
 * aktuelle Stufe, fällt sie, und die verbrauchten fehlen für die nächste. Bei
 * verlorenem Kampf wirkt nur die Hälfte — wie beim Rammbock, dessen halbe
 * Wirkung schon während des Gefechts zählt. Liefert die neue Stufe.
 */
export function catapultDamage(
    catapults: number,
    building: BuildingType,
    level: number,
    attackerWon: boolean,
): number {
    let left = attackerWon ? catapults : Math.floor(catapults / 2);
    let current = level;
    const floor = MIN_LEVEL_AFTER_CATAPULTS[building] ?? 0;
    while (current > floor) {
        const need =
            CATAPULTS_PER_LEVEL[current - 1] ??
            Number.POSITIVE_INFINITY;
        if (left < need) break;
        left -= need;
        current--;
    }
    return current;
}
