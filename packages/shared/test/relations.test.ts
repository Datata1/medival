import { describe, expect, it } from 'vitest';
import {
    applyRelationEvent,
    attitudeOf,
    Duration,
    decayStanding,
    distanceInfluence,
    RELATION_RANGE,
    relationDelta,
    STANDING_HALF_LIFE,
    standingEquilibrium,
} from '../src/index.js';

describe('Abklingen des Ansehens', () => {
    it('halbiert sich nach einer Halbwertszeit', () => {
        expect(decayStanding(80, STANDING_HALF_LIFE)).toBeCloseTo(40);
    });

    it('ist nach zehn Halbwertszeiten praktisch verflogen', () => {
        const left = decayStanding(
            100,
            Duration.scale(STANDING_HALF_LIFE, 10),
        );
        expect(Math.abs(left)).toBeLessThan(0.2);
    });

    it('zieht auch Feindschaft gegen null', () => {
        // Beziehungen kühlen in beide Richtungen ab.
        expect(decayStanding(-80, STANDING_HALF_LIFE)).toBeCloseTo(-40);
    });

    it('lässt 0 bei 0 und ändert nichts ohne Zeit', () => {
        expect(decayStanding(0, STANDING_HALF_LIFE)).toBe(0);
        expect(decayStanding(50, 0)).toBe(50);
    });

    it('bleibt im gültigen Bereich, auch bei Unsinn', () => {
        expect(decayStanding(1e9, 0)).toBe(100);
        expect(decayStanding(Number.NaN, 0)).toBe(0);
    });
});

describe('Entfernungsdämpfung', () => {
    it('ist 1 in unmittelbarer Nachbarschaft', () => {
        expect(distanceInfluence(0)).toBe(1);
    });

    it('ist genau 0,5 bei der Reichweite', () => {
        expect(distanceInfluence(RELATION_RANGE)).toBeCloseTo(0.5);
    });

    it('fällt monoton und wird nie negativ', () => {
        let previous = Number.POSITIVE_INFINITY;
        for (let d = 0; d <= 200; d += 5) {
            const value = distanceInfluence(d);
            expect(value).toBeLessThanOrEqual(previous);
            expect(value).toBeGreaterThanOrEqual(0);
            previous = value;
        }
    });

    it('geht in der Ferne gegen null', () => {
        expect(distanceInfluence(RELATION_RANGE * 20)).toBeLessThan(
            0.01,
        );
    });
});

describe('Gleichgewicht — der eigentliche Nachweis', () => {
    /*
     * Die Vorgabe lautete: „je weiter weg desto weniger hat der effekt und
     * geht ins neutrale über". Entscheidend ist nicht, dass ein ferner
     * Partner *langsamer* freundlich wird, sondern dass er **neutral bleibt**
     * — egal wie viel man liefert.
     */
    const shipment = { kind: 'shipment', value: 3000 } as const;
    const daily = Duration.hours(4);

    it('ein naher Partner wird freundlich', () => {
        const near = standingEquilibrium(shipment, 3, daily);
        expect(attitudeOf(near)).toBe('friendly');
    });

    it('ein ferner Partner bleibt bei derselben Menge neutral', () => {
        const far = standingEquilibrium(
            shipment,
            RELATION_RANGE * 10,
            daily,
        );
        expect(attitudeOf(far)).toBe('neutral');
    });

    it('das Gleichgewicht fällt monoton mit der Entfernung', () => {
        const values = [0, 5, 15, 40, 100, 300].map((d) =>
            standingEquilibrium(shipment, d, daily),
        );
        for (let i = 1; i < values.length; i++) {
            expect(values[i]).toBeLessThan(values[i - 1] ?? 0);
        }
    });

    it('stimmt mit der ausgeführten Schleife überein', () => {
        // Die geschlossene Formel gegen die tatsächliche Wiederholung prüfen:
        // Driftet eine ab, stimmt das Balancing nicht mehr mit der Anzeige.
        let standing = 0;
        for (let i = 0; i < 400; i++) {
            standing = applyRelationEvent(standing, daily, shipment, 3);
        }
        expect(standing).toBeCloseTo(
            standingEquilibrium(shipment, 3, daily),
            1,
        );
    });
});

describe('Auslöser', () => {
    it('ein Angriff wiegt schwerer als eine gleich große Lieferung', () => {
        const gained = relationDelta(
            { kind: 'shipment', value: 1000 },
            0,
        );
        const lost = relationDelta(
            { kind: 'attacked', losses: 1000 },
            0,
        );
        expect(Math.abs(lost)).toBeGreaterThan(gained);
    });

    it('Unterstützung wiegt schwerer als eine Lieferung', () => {
        expect(
            relationDelta({ kind: 'support', value: 1000 }, 0),
        ).toBeGreaterThan(
            relationDelta({ kind: 'shipment', value: 1000 }, 0),
        );
    });

    it('ein verlorenes Dorf ignoriert die Entfernung', () => {
        // Wer einem ein Dorf nimmt, war per Definition nah genug.
        expect(relationDelta({ kind: 'villageLost' }, 0)).toBe(
            relationDelta({ kind: 'villageLost' }, 500),
        );
    });

    it('deckelt einzelne Ereignisse', () => {
        // Eine Riesenlieferung darf eine Beziehung nicht in einem Zug kippen.
        expect(
            relationDelta({ kind: 'shipment', value: 1e9 }, 0),
        ).toBeLessThanOrEqual(25);
    });

    it('bleibt insgesamt im Bereich −100…100', () => {
        let standing = 0;
        for (let i = 0; i < 200; i++) {
            standing = applyRelationEvent(
                standing,
                0,
                { kind: 'shipment', value: 100_000 },
                0,
            );
        }
        expect(standing).toBe(100);

        for (let i = 0; i < 200; i++) {
            standing = applyRelationEvent(
                standing,
                0,
                { kind: 'attacked', losses: 100_000 },
                0,
            );
        }
        expect(standing).toBe(-100);
    });
});

describe('Haltungen', () => {
    it('ordnet die Schwellen richtig zu', () => {
        expect(attitudeOf(-100)).toBe('hostile');
        expect(attitudeOf(-41)).toBe('hostile');
        expect(attitudeOf(-40)).toBe('wary');
        expect(attitudeOf(-11)).toBe('wary');
        expect(attitudeOf(-10)).toBe('neutral');
        expect(attitudeOf(0)).toBe('neutral');
        expect(attitudeOf(24)).toBe('neutral');
        expect(attitudeOf(25)).toBe('friendly');
        expect(attitudeOf(59)).toBe('friendly');
        expect(attitudeOf(60)).toBe('allied');
        expect(attitudeOf(100)).toBe('allied');
    });
});
