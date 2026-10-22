import {
    attackMargin,
    attitudeOf,
    type BuildingType,
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
    /**
     * Stammt die Schätzung aus frischem Spähwissen (19-10)? Dann ist sie keine
     * Schätzung mehr, sondern das, was die Späher gesehen haben.
     */
    scouted?: boolean;
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
    /** Wenn Katapulte mitgehen: was sie beschießen (19-11). */
    catapultTarget?: BuildingType;
}

/**
 * Was Katapulte eines Bots beschießen: `raider` die Kaserne — wer keine
 * Truppen mehr nachziehen kann, ist als Gegner erledigt —, alle anderen den
 * Wall, damit der nächste Angriff leichter durchkommt.
 */
function catapultTargetFor(personality: Personality): BuildingType {
    return personality === 'raider' ? 'barracks' : 'wall';
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
                    ...((force.catapult ?? 0) > 0
                        ? {
                              catapultTarget:
                                  catapultTargetFor(personality),
                          }
                        : {}),
                },
                score,
            };
        }
    }
    return best?.plan ?? null;
}

export interface ScoutPlan {
    kind: 'scout';
    targetVillageId: number;
    units: Units;
}

/** So viele Späher gehen auf eine Mission; einer bleibt zur Abwehr zu Hause. */
const SCOUT_PARTY = 3;
/** Wer weniger angriffslustig ist, späht auch nicht aus. */
const SCOUT_MIN_AGGRESSION = 0.5;

/**
 * Wen ein Bot ausspäht — oder `null` (plans/19-prototyp/19-10).
 *
 * Ausgespäht wird **das eine Ziel, das der Bot am liebsten angreifen würde**
 * (feindlich oder herrenlos, Punkte gegen Entfernung wie in `decideAttack`),
 * und nur, solange es kein frisches Spähwissen hat und von diesem Dorf kein
 * Spähtrupp unterwegs ist. Danach greift `decideAttack` mit den gesehenen
 * Truppen statt mit einer Schätzung aus den Punkten an.
 *
 * Der erste Entwurf spähte bei jedem Tick das nächste unbekannte Ziel in
 * Reichweite aus: 9 030 Ankünfte in einer Spielstunde bei zehn Bots, fast
 * alles Späher. Wissen ist nur etwas wert, wenn man danach handelt.
 *
 * `turtle` späht nicht: Wer nie angreift, braucht das Wissen nicht.
 */
export function decideScouting(
    home: {
        x: number;
        y: number;
        units: Units;
        /** Ist von diesem Dorf schon ein Spähtrupp unterwegs? */
        scoutsInFlight?: boolean;
    },
    targets: readonly AttackTarget[],
    personality: Personality,
): ScoutPlan | null {
    if (
        PERSONALITY_WEIGHTS[personality].aggression <
        SCOUT_MIN_AGGRESSION
    )
        return null;
    if (home.scoutsInFlight) return null;
    const spies = home.units.spy ?? 0;
    if (spies < 2) return null;

    let best: { target: AttackTarget; score: number } | null = null;
    for (const target of targets) {
        const isBarbarian = target.ownerId === null;
        if (!isBarbarian && attitudeOf(target.standing) !== 'hostile')
            continue;
        const dist = distance(home.x, home.y, target.x, target.y);
        const weight = isBarbarian ? 1 : 2.5;
        const score = (target.points * weight) / (1 + dist);
        if (!best || score > best.score) best = { target, score };
    }
    // Das Lieblingsziel ist schon erkundet: nichts zu tun.
    if (!best || best.target.scouted) return null;
    return {
        kind: 'scout',
        targetVillageId: best.target.villageId,
        units: { spy: Math.min(SCOUT_PARTY, spies - 1) },
    };
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
