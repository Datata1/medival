import { GameTime } from '@medival/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { paladinStatus } from '../../src/engine/paladin.js';
import { act } from '../harness/act.js';
import { givenPlayer, givenVillage } from '../harness/given.js';
import { ownerOf, unitsAt } from '../harness/query.js';
import {
    advanceTo,
    createTestWorld,
    type TestWorld,
} from '../harness/world.js';

/**
 * Truppen unterwegs bei Eroberung (plans/20-nacharbeiten/20-3).
 */

let tw: TestWorld | null = null;
afterEach(() => {
    tw?.dispose();
    tw = null;
});

/**
 * A besitzt X (10|10) und Y (10|20). B steht neben X (13|10) und erobert es
 * mit einem Adelsgeschlecht bei Loyalität 1.
 */
function setup() {
    tw = createTestWorld();
    const { world } = tw;
    const a = givenPlayer(world, { name: 'A' });
    const b = givenPlayer(world, { name: 'B' });
    const x = givenVillage(world, a, {
        x: 10,
        y: 10,
        units: { axe: 50, paladin: 1 },
    });
    const y = givenVillage(world, a, {
        x: 10,
        y: 20,
        units: { spear: 30 },
    });
    const far = givenVillage(world, null, { x: 40, y: 40 });
    const bHome = givenVillage(world, b, {
        x: 13,
        y: 10,
        units: { axe: 500, noble: 1 },
    });
    world.sqlite
        .prepare('UPDATE villages SET loyalty = 1 WHERE id = ?')
        .run(x);
    const conquer = () => {
        const { arrivalGameTime } = act.attack(world, bHome, x, {
            axe: 500,
            noble: 1,
        });
        advanceTo(world, GameTime.of(arrivalGameTime));
        expect(ownerOf(world, x)).toBe(b);
    };
    return { world, a, b, x, y, far, conquer };
}

describe('Eroberung mit Truppen unterwegs', () => {
    it('Truppen samt Paladin, die von X ausgezogen sind, gehen verloren', () => {
        const { world, a, b, x, far, conquer } = setup();
        // A's Truppen ziehen von X zu einem fernen Barbarendorf.
        act.attack(world, x, far, { axe: 50, paladin: 1 });
        conquer();

        const left = world.sqlite
            .prepare(
                'SELECT COUNT(*) AS n FROM movements WHERE origin_village_id = ?',
            )
            .get(x) as { n: number };
        expect(left.n).toBe(0);
        const orphans = world.sqlite
            .prepare(
                `SELECT COUNT(*) AS n FROM events e WHERE e.type = 'arrival'
                 AND NOT EXISTS (SELECT 1 FROM movements m WHERE m.id = json_extract(e.payload_json, '$.movementId'))`,
            )
            .get() as { n: number };
        expect(orphans.n).toBe(0);
        expect(paladinStatus(world, a).state).toBe('dead');
        expect(paladinStatus(world, b).state).toBe('none');
    });

    it('Unterstützung auf dem Weg zum eroberten Dorf kehrt um', () => {
        const { world, a, x, y, conquer } = setup();
        // A schickt aus Y Unterstützung nach X; sie kommt nach der Eroberung an.
        const { arrivalGameTime } = act.support(world, y, x, {
            spear: 30,
        });
        conquer();
        advanceTo(world, GameTime.of(arrivalGameTime));
        expect(unitsAt(world, x).spear ?? 0).toBe(0);
        // Sie ist auf dem Heimweg und kommt in Y an.
        advanceTo(world, GameTime.of(arrivalGameTime * 3));
        expect(unitsAt(world, y).spear).toBe(30);
        expect(ownerOf(world, y)).toBe(a);
    });

    it('eine Lieferung von X läuft weiter', () => {
        const { world, x, y, conquer } = setup();
        world.sqlite
            .prepare(
                "UPDATE buildings SET level = 1 WHERE village_id = ? AND type = 'market'",
            )
            .run(x);
        world.sqlite
            .prepare('UPDATE villages SET wood = 500 WHERE id = ?')
            .run(x);
        act.ship(world, x, y, { wood: 100, clay: 0, iron: 0 });
        conquer();
        const trade = world.sqlite
            .prepare(
                "SELECT COUNT(*) AS n FROM movements WHERE origin_village_id = ? AND kind = 'trade'",
            )
            .get(x) as { n: number };
        expect(trade.n).toBe(1);
    });
});
