import {
    attackMargin,
    attitudeOf,
    distance,
    entriesOf,
    travelTime,
    UNITS,
    type Units,
} from '@medival/shared';
import {
    PERSONALITY_WEIGHTS,
    type Personality,
} from '../personalities.js';

/**
 * Angriff und Unterstützung (siehe plans/17-staemme-und-krieg.md).
 *
 * **Pure Funktion** — durchgesetzt von `scripts/check-ai-purity.mjs`.
 *
 * Ein Bot kennt nur, was im Snapshot steht: Punkte, Entfernung, Besitzer,
 * Haltung. Er darf **nicht** in die Datenbank schauen, um die Verteidigung
 * eines Ziels abzulesen — ein Bot mit Röntgenblick trifft perfekte
 * Entscheidungen und ist als Gegner uninteressant.
 */

/** Ein mögliches Angriffsziel, so wie der Bot es sieht. */
export interface AttackTarget {
    villageId: number;
    /** `null` bei einem Barbarendorf. */
    ownerId: number | null;
    x: number;
    y: number;
    points: number;
    /** Wie der Bot über den Besitzer denkt. */
    standing: number;
    /**
     * Geschätzte Verteidigung. Kommt **nicht** aus der Datenbank, sondern aus
     * den Punkten des Ziels und dem, was der Bot aus eigenen Kämpfen weiß.
     */
    estimatedDefense: Units;
    estimatedWall: number;
}

/** Ein bedrängtes Stammesmitglied. */
export interface DistressCall {
    villageId: number;
    x: number;
    y: number;
    /** Spielzeit, zu der der Angriff eintrifft. */
    arrivalGameTime: number;
}

export interface AttackPlan {
    kind: 'attack';
    targetVillageId: number;
    units: Units;
}

export interface SupportPlan {
    kind: 'support';
    targetVillageId: number;
    units: Units;
}

/**
 * Wie deutlich der Sieg ausfallen muss, je Persönlichkeit — als Anteil
 * überlebender Angreifer. `raider` greift knapper an, `turtle` nur bei klarer
 * Überlegenheit.
 */
function requiredMargin(personality: Personality): number {
    const aggression = PERSONALITY_WEIGHTS[personality].aggression;
    // aggression 2,5 (raider) → 0,32 · 1,0 (balanced) → 0,50 · 0,2 (turtle) → 0,79
    return Math.max(0.25, Math.min(0.85, 0.55 / (aggression + 0.1)));
}

/** Anteil der Heimtruppen, den ein Bot höchstens auf einen Angriff schickt. */
const MAX_ATTACK_SHARE = 0.7;
/** Anteil der Heimtruppen für eine Unterstützung. */
const MAX_SUPPORT_SHARE = 0.5;

function scale(units: Units, share: number): Units {
    const out: Units = {};
    for (const [type, n] of entriesOf(units)) {
        const take = Math.floor(n * share);
        if (take > 0) out[type] = take;
    }
    return out;
}

function countOf(units: Units): number {
    return entriesOf(units).reduce((s, [, n]) => s + n, 0);
}

/** Nur Offensive schicken — Speerträger bleiben zu Hause und verteidigen. */
function offensiveUnits(units: Units): Units {
    const out: Units = {};
    for (const [type, n] of entriesOf(units)) {
        if (UNITS[type].attack >= UNITS[type].defense && n > 0)
            out[type] = n;
    }
    return out;
}

/** Umgekehrt: Was sich zum Verteidigen lohnt. */
function defensiveUnits(units: Units): Units {
    const out: Units = {};
    for (const [type, n] of entriesOf(units)) {
        if (UNITS[type].defense > UNITS[type].attack && n > 0)
            out[type] = n;
    }
    return out;
}

/**
 * Wen ein Bot angreift — oder `null`.
 *
 * Drei Bedingungen, alle drei müssen erfüllt sein:
 *   1. Das Ziel ist **feindlich oder herrenlos**. Ein neutraler Spieler wird
 *      nie angegriffen — das macht das Verhalten für den Spieler
 *      vorhersehbar. Barbarendörfer haben dagegen keinen Besitzer und damit
 *      keine Haltung; sie zu plündern ist folgenlos und genau das, was ein
 *      Spieler auch täte.
 *
 *      Ohne die Barbaren gäbe es in einer friedlichen Welt **gar keine**
 *      Angriffe: Feindschaft zwischen Bots entsteht nur durch Angriffe, und
 *      den ersten würde niemand führen (Befund aus Plan 17).
 *   2. Der Sieg ist deutlich genug (geschätzt mit `attackMargin`, also
 *      derselben Kampffunktion wie im echten Gefecht).
 *   3. Das Ziel lohnt sich — Punkte gegen Entfernung.
 */
export function decideAttack(
    home: { x: number; y: number; units: Units },
    targets: readonly AttackTarget[],
    personality: Personality,
): AttackPlan | null {
    const force = scale(offensiveUnits(home.units), MAX_ATTACK_SHARE);
    if (countOf(force) === 0) return null;

    const needed = requiredMargin(personality);
    let best: { plan: AttackPlan; score: number } | null = null;

    for (const target of targets) {
        const isBarbarian = target.ownerId === null;
        if (!isBarbarian && attitudeOf(target.standing) !== 'hostile')
            continue;
        const margin = attackMargin(
            force,
            target.estimatedDefense,
            target.estimatedWall,
        );
        if (margin < needed) continue;

        const dist = distance(home.x, home.y, target.x, target.y);
        // Nahe und wertvolle Ziele zuerst; die Entfernung kostet Marschzeit.
        // Feinde wiegen schwerer als Barbaren — ein Krieg hat Vorrang vor
        // dem Abfarmen.
        const weight = isBarbarian ? 1 : 2.5;
        const score = (target.points * margin * weight) / (1 + dist);
        if (!best || score > best.score) {
            best = {
                plan: {
                    kind: 'attack',
                    targetVillageId: target.villageId,
                    units: force,
                },
                score,
            };
        }
    }
    return best?.plan ?? null;
}

/**
 * Wem ein Bot zu Hilfe eilt — oder `null`.
 *
 * Entscheidend ist die Rechtzeitigkeit: Unterstützung, die zu spät kommt, ist
 * verschenkte Verteidigung und für den Empfänger ein Ärgernis, weil sie wie
 * Hilfe aussah.
 */
export function decideSupport(
    home: { x: number; y: number; units: Units },
    calls: readonly DistressCall[],
    now: number,
    unitSpeed: number,
): SupportPlan | null {
    const force = scale(defensiveUnits(home.units), MAX_SUPPORT_SHARE);
    if (countOf(force) === 0) return null;

    let best: { plan: SupportPlan; arrival: number } | null = null;
    for (const call of calls) {
        const travel = travelTime(
            home.x,
            home.y,
            call.x,
            call.y,
            force,
            unitSpeed,
        );
        // Muss vor dem Angriff eintreffen, sonst bringt es nichts.
        if (now + travel >= call.arrivalGameTime) continue;
        if (!best || call.arrivalGameTime < best.arrival) {
            best = {
                plan: {
                    kind: 'support',
                    targetVillageId: call.villageId,
                    units: force,
                },
                arrival: call.arrivalGameTime,
            };
        }
    }
    return best?.plan ?? null;
}

/** Nur für Tests und Balancing: die geforderte Deutlichkeit je Persönlichkeit. */
export { requiredMargin };
