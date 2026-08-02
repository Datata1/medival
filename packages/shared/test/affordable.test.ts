import { describe, expect, it } from 'vitest';
import {
    Duration,
    projectResources,
    type Resources,
    timeUntilAffordable,
} from '../src/index.js';

/**
 * `timeUntilAffordable` ist die zweite tragende Idee von Plan 15: Weil die
 * Produktion deterministisch ist, muss ein Bot nicht pollen, sondern kann
 * ausrechnen, wann er sich etwas leisten kann.
 */
describe('timeUntilAffordable', () => {
    const rates: Resources = { wood: 100, clay: 100, iron: 100 };

    it('gibt 0 zurück, wenn schon genug da ist', () => {
        expect(
            timeUntilAffordable(
                { wood: 500, clay: 500, iron: 500 },
                { wood: 100, clay: 100, iron: 100 },
                rates,
            ),
        ).toBe(0);
    });

    it('rechnet die Wartezeit für den knappsten Rohstoff', () => {
        // Holz fehlt 100 (1 h), Eisen fehlt 200 (2 h) → 2 h entscheidet.
        const wait = timeUntilAffordable(
            { wood: 0, clay: 1000, iron: 0 },
            { wood: 100, clay: 0, iron: 200 },
            rates,
        );
        expect(Duration.toHours(wait ?? Duration.zero)).toBeCloseTo(2);
    });

    it('stimmt mit projectResources überein', () => {
        // Derselbe Zusammenhang, einmal vorwärts und einmal rückwärts
        // gerechnet. Der Test hält beide Formeln zusammen: Driftet eine ab,
        // würden Bots auf einen Zeitpunkt warten, an dem es noch nicht reicht.
        const stored: Resources = { wood: 0, clay: 0, iron: 0 };
        const cost: Resources = { wood: 450, clay: 300, iron: 150 };
        const levels = { timber_camp: 5, clay_pit: 5, iron_mine: 5 };
        const speed = 10;
        const capacity = 100_000;

        const projected = (elapsed: number) =>
            projectResources(stored, levels, capacity, elapsed, speed);
        const ratesPerHour: Resources = {
            wood: projected(Duration.hours(1)).wood,
            clay: projected(Duration.hours(1)).clay,
            iron: projected(Duration.hours(1)).iron,
        };

        const wait = timeUntilAffordable(
            stored,
            cost,
            ratesPerHour,
            capacity,
        );
        expect(wait).not.toBeNull();

        const atWait = projected(wait ?? Duration.zero);
        expect(atWait.wood).toBeGreaterThanOrEqual(cost.wood - 0.001);
        expect(atWait.clay).toBeGreaterThanOrEqual(cost.clay - 0.001);
        expect(atWait.iron).toBeGreaterThanOrEqual(cost.iron - 0.001);

        // Und kurz davor reicht es noch nicht — die Zeit ist nicht zu groß.
        const justBefore = projected((wait ?? 0) * 0.9);
        const short =
            justBefore.wood < cost.wood ||
            justBefore.clay < cost.clay ||
            justBefore.iron < cost.iron;
        expect(short).toBe(true);
    });

    it('meldet „nie", wenn ein Rohstoff nicht nachwächst', () => {
        // Eisenmine auf Stufe 0 bei einem Ziel, das Eisen braucht: Der Bot
        // muss erst die Mine bauen, nicht warten.
        expect(
            timeUntilAffordable(
                { wood: 1000, clay: 1000, iron: 0 },
                { wood: 10, clay: 10, iron: 50 },
                { wood: 100, clay: 100, iron: 0 },
            ),
        ).toBeNull();
    });

    it('meldet „nie", wenn die Kosten nicht in den Speicher passen', () => {
        // Ohne diese Prüfung würde ein Bot ewig auf etwas sparen, das sein
        // Lager gar nicht fassen kann — eine Endlosschleife.
        expect(
            timeUntilAffordable(
                { wood: 0, clay: 0, iron: 0 },
                { wood: 5000, clay: 10, iron: 10 },
                rates,
                1000,
            ),
        ).toBeNull();
    });

    it('stört sich nicht an einem Rohstoff ohne Rate, der nicht gebraucht wird', () => {
        // Eisen fehlt zwar die Rate, wird aber auch nicht verlangt.
        const wait = timeUntilAffordable(
            { wood: 0, clay: 0, iron: 0 },
            { wood: 100, clay: 100, iron: 0 },
            { wood: 100, clay: 100, iron: 0 },
        );
        expect(Duration.toHours(wait ?? Duration.zero)).toBeCloseTo(1);
    });
});
