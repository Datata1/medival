import { Duration, type DurationLike } from '../time.js';

/**
 * Ansehen zwischen zwei Spielern (siehe plans/16-ansehen-und-handel.md).
 *
 * Alles hier ist **pur**: keine Datenbank, keine Uhr. Die Werte kommen herein,
 * das Ergebnis geht heraus — testbar mit Literalen.
 */

/** Wertebereich des Ansehens. */
export const STANDING_MIN = -100;
export const STANDING_MAX = 100;

/**
 * Nach dieser Zeitspanne ist die Hälfte des Ansehens verflogen.
 *
 * Beziehungen kühlen von selbst ab; wer nichts tut, wird wieder neutral.
 * Bewusst in Spielzeit und **nicht** mit der Weltgeschwindigkeit skaliert:
 * Zuneigung ist keine Produktion. Zwölf Stunden sind lang genug, dass eine
 * Freundschaft eine Sitzung überdauert, und kurz genug, dass ein einmaliger
 * Ausrutscher nicht ewig nachhängt.
 */
export const STANDING_HALF_LIFE = Duration.hours(12);

/**
 * Entfernung, bei der ein Ereignis nur noch halb so stark wirkt.
 *
 * Bei einer Karte von 100×100 Feldern sind 15 Felder gute Nachbarschaft —
 * innerhalb eines Nachtangriffs erreichbar, also genau die Reichweite, in der
 * gegenseitige Wahrnehmung überhaupt Sinn ergibt.
 */
export const RELATION_RANGE = 15;

/** Diskrete Haltungen. Das Spiel rechnet mit Zahlen, entscheidet aber hiermit. */
export const ATTITUDES = [
    'hostile',
    'wary',
    'neutral',
    'friendly',
    'allied',
] as const;

export type Attitude = (typeof ATTITUDES)[number];

/** Untergrenzen, absteigend geprüft. */
const ATTITUDE_THRESHOLDS: readonly [Attitude, number][] = [
    ['allied', 60],
    ['friendly', 25],
    ['neutral', -10],
    ['wary', -40],
    ['hostile', Number.NEGATIVE_INFINITY],
];

export function attitudeOf(standing: number): Attitude {
    for (const [attitude, min] of ATTITUDE_THRESHOLDS) {
        if (standing >= min) return attitude;
    }
    return 'hostile';
}

export function clampStanding(standing: number): number {
    if (!Number.isFinite(standing)) return 0;
    return Math.max(STANDING_MIN, Math.min(STANDING_MAX, standing));
}

/**
 * Faules Abklingen — dasselbe Muster wie Ressourcen und Loyalität.
 *
 * Kein Tick: Bei 31 Spielern gäbe es bis zu 930 Paare, die regelmäßig gegen
 * null gezogen werden müssten. Stattdessen wird beim Zugriff gerechnet, genau
 * wie `projectResources` und die Loyalitätsregeneration es tun. Eine
 * Beziehung, die niemand abfragt, kostet nichts.
 */
export function decayStanding(
    standing: number,
    elapsed: DurationLike,
): number {
    if (standing === 0) return 0;
    const halfLives = elapsed / STANDING_HALF_LIFE;
    if (!Number.isFinite(halfLives) || halfLives <= 0) {
        return clampStanding(standing);
    }
    return clampStanding(standing * 0.5 ** halfLives);
}

/**
 * Wie stark ein Ereignis über eine Entfernung hinweg wirkt.
 *
 *     einfluss(d) = 1 / (1 + (d / RANGE)²)
 *
 * 1,0 in der Nachbarschaft, 0,5 bei `RELATION_RANGE`, gegen 0 in der Ferne.
 * Der quadratische Nenner sorgt für einen weichen Übergang; ein linearer
 * Abfall hätte eine sichtbare Kante an der Reichweitengrenze.
 *
 * Weil jeder Anstoß mit der Entfernung schrumpft, der Zerfall aber **nicht**,
 * stellt sich von selbst ein entfernungsabhängiges Gleichgewicht ein: Ein
 * ferner Partner bleibt trotz Dauerlieferung nahe neutral. Genau das ist
 * gewünscht — und es ist ein Ausdruck, kein Sonderfall.
 */
export function distanceInfluence(distance: number): number {
    if (!Number.isFinite(distance) || distance < 0) return 0;
    const ratio = distance / RELATION_RANGE;
    return 1 / (1 + ratio * ratio);
}

/** Was das Ansehen bewegt. */
export type RelationEvent =
    | { kind: 'shipment'; value: number }
    | { kind: 'support'; value: number }
    | { kind: 'attacked'; losses: number }
    | { kind: 'villageLost' };

/**
 * Grundwerte je Ereignis, vor der Entfernungsdämpfung.
 *
 * Angriffe wiegen schwerer als Lieferungen: Freundschaft soll man sich
 * erarbeiten müssen, Feindschaft geht schnell.
 */
const SHIPMENT_PER_1000 = 4;
const SUPPORT_PER_1000 = 8;
const ATTACK_PER_1000_LOSSES = -14;
const VILLAGE_LOST = -60;
/** Obergrenze je Einzelereignis, damit eine Großlieferung nicht alles kippt. */
const MAX_STEP = 25;

/**
 * Wie stark ein einzelnes Ereignis das Ansehen verschiebt.
 * Getrennt von `applyRelationEvent`, damit Tests die Dämpfung isoliert prüfen.
 */
export function relationDelta(
    event: RelationEvent,
    distance: number,
): number {
    const influence = distanceInfluence(distance);
    switch (event.kind) {
        case 'shipment':
            return clampStep(
                (event.value / 1000) * SHIPMENT_PER_1000 * influence,
            );
        case 'support':
            return clampStep(
                (event.value / 1000) * SUPPORT_PER_1000 * influence,
            );
        case 'attacked':
            return clampStep(
                (event.losses / 1000) *
                    ATTACK_PER_1000_LOSSES *
                    influence,
            );
        case 'villageLost':
            // Wer einem ein Dorf nimmt, war per Definition nah genug — hier
            // wirkt die Entfernungsdämpfung ausdrücklich nicht.
            return VILLAGE_LOST;
    }
}

function clampStep(delta: number): number {
    if (!Number.isFinite(delta)) return 0;
    return Math.max(-MAX_STEP, Math.min(MAX_STEP, delta));
}

/**
 * Abklingen und Ereignis in einem Schritt — die Form, in der der Server es
 * braucht: gespeicherter Wert plus verstrichene Zeit plus was passiert ist.
 */
export function applyRelationEvent(
    stored: number,
    elapsed: DurationLike,
    event: RelationEvent,
    distance: number,
): number {
    return clampStanding(
        decayStanding(stored, elapsed) + relationDelta(event, distance),
    );
}

/**
 * Gleichgewicht bei regelmäßiger Wiederholung eines Ereignisses.
 *
 * Nur für Tests und Balancing — beantwortet die Frage „wohin führt es, wenn
 * ich diesem Nachbarn dauerhaft liefere?", ohne die Schleife auszuführen.
 * Geometrische Reihe: s = δ / (1 − q) mit q = 0,5^(intervall/halbwertszeit).
 */
export function standingEquilibrium(
    event: RelationEvent,
    distance: number,
    interval: DurationLike,
): number {
    const q = 0.5 ** (interval / STANDING_HALF_LIFE);
    if (q >= 1) return clampStanding(STANDING_MAX);
    return clampStanding(relationDelta(event, distance) / (1 - q));
}
