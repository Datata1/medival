import { GameTime, UnitsSchema } from '@medival/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { paladinStatus } from '../../src/engine/paladin.js';
import { act } from '../harness/act.js';
import { givenPlayer, givenVillage } from '../harness/given.js';
import { unitsAt } from '../harness/query.js';
import {
    advanceTo,
    advanceYielding,
    createTestWorld,
    gameWeeks,
    type TestWorld,
} from '../harness/world.js';

/**
 * Paladin & Statue (plans/19-prototyp/19-14).
 */

let tw: TestWorld | null = null;
afterEach(() => {
    tw?.dispose();
    tw = null;
});

const STATUE = { statue: 1, farm: 10, warehouse: 10 };

/** Spieler A mit zwei Dörfern, beide mit Statue. */
function twoVillages() {
    tw = createTestWorld();
    const { world } = tw;
    const a = givenPlayer(world, { name: 'A' });
    const v1 = givenVillage(world, a, {
        x: 10,
        y: 10,
        levels: STATUE,
        resources: 'full',
    });
    const v2 = givenVillage(world, a, {
        x: 14,
        y: 10,
        levels: STATUE,
        resources: 'full',
    });
    return { world, a, v1, v2 };
}

function readyAt(
    world: TestWorld['world'],
    playerId: number,
): GameTime {
    const s = paladinStatus(world, playerId);
    if (s.state !== 'appointing' || s.readyAt === null)
        throw new Error(`kein laufender Paladin: ${s.state}`);
    return s.readyAt;
}

describe('Ein Paladin je Spieler', () => {
    it('über alle Dörfer — in Ernennung, zu Hause und unterwegs', () => {
        const { world, a, v1, v2 } = twoVillages();
        expect(paladinStatus(world, a)).toEqual({ state: 'none' });
        expect(() => act.recruit(world, v1, 'paladin', 2)).toThrow(
            /paladin_single/,
        );

        act.recruit(world, v1, 'paladin', 1);
        expect(() => act.recruit(world, v2, 'paladin', 1)).toThrow(
            /paladin_reviving/,
        );

        advanceTo(world, readyAt(world, a));
        expect(paladinStatus(world, a)).toEqual({
            state: 'home',
            villageId: v1,
        });
        expect(() => act.recruit(world, v2, 'paladin', 1)).toThrow(
            /paladin_exists/,
        );

        // Unterwegs zum eigenen zweiten Dorf zählt er ebenso.
        act.support(world, v1, v2, { paladin: 1 });
        expect(paladinStatus(world, a).state).toBe('away');
        expect(() => act.recruit(world, v2, 'paladin', 1)).toThrow(
            /paladin_exists/,
        );
    });
});

describe('Tod und Wiederbelebung', () => {
    it('fällt im Kampf, wird kostenlos und in genau der Ernennungszeit wiederbelebt', () => {
        const { world, a, v1 } = twoVillages();
        const b = givenPlayer(world, { name: 'B' });
        const fortress = givenVillage(world, b, {
            x: 12,
            y: 12,
            levels: { wall: 20 },
            units: { spear: 5000, sword: 5000 },
        });
        world.addUnits(v1, { paladin: 1 });

        const { arrivalGameTime } = act.attack(world, v1, fortress, {
            paladin: 1,
        });
        advanceTo(world, GameTime.of(arrivalGameTime));
        const dead = paladinStatus(world, a);
        expect(dead).toEqual({
            state: 'dead',
            since: arrivalGameTime,
        });

        const before = world.getVillageRow(v1);
        const at = world.now();
        act.recruit(world, v1, 'paladin', 1);
        const after = world.getVillageRow(v1);
        // Kostenlos: Das Lager ist voll und bleibt es.
        expect(after.wood).toBeGreaterThanOrEqual(before.wood);
        const ready = readyAt(world, a);
        // 21 600 s bei Weltgeschwindigkeit 100.
        expect(ready - at).toBe(216_000);
        advanceTo(world, GameTime.of(ready - 1));
        expect(paladinStatus(world, a).state).toBe('appointing');
        advanceTo(world, ready);
        expect(paladinStatus(world, a)).toEqual({
            state: 'home',
            villageId: v1,
        });
        expect(unitsAt(world, v1).paladin).toBe(1);
    });
});

describe('Welt-Option paladin', () => {
    it('ausgeschaltet: keine Statue, kein Paladin', () => {
        tw = createTestWorld({ paladin: false });
        const { world } = tw;
        const p = givenPlayer(world, { name: 'A' });
        const v = givenVillage(world, p, {
            x: 10,
            y: 10,
            levels: STATUE,
            resources: 'full',
        });
        expect(() => act.build(world, v, 'statue')).toThrow(
            /building_disabled/,
        );
        expect(() => act.recruit(world, v, 'paladin', 1)).toThrow(
            /unit_disabled/,
        );
        expect(world.villageView(v).paladin).toBeNull();
    });
});

describe('Bots', () => {
    it('haben nach drei Spielwochen höchstens einen Paladin je Spieler', async () => {
        tw = createTestWorld(
            {
                speed: 200,
                unitSpeed: 200,
                mapSize: 30,
                botCount: 6,
                barbarianCount: 4,
                seed: 14,
            },
            'Paladinwelt',
        );
        const { world } = tw;
        await advanceYielding(world, gameWeeks(world, 3));

        const perPlayer = new Map<number, number>();
        const add = (player: number | null, n: number) => {
            if (player === null || n <= 0) return;
            perPlayer.set(player, (perPlayer.get(player) ?? 0) + n);
        };
        for (const row of world.sqlite
            .prepare(
                `SELECT v.player_id AS p, u.count_home AS n FROM units u
                 JOIN villages v ON v.id = u.village_id WHERE u.unit_type = 'paladin'
                 UNION ALL
                 SELECT v.player_id, q.count FROM recruit_queue q
                 JOIN villages v ON v.id = q.village_id WHERE q.unit_type = 'paladin'`,
            )
            .all() as { p: number | null; n: number }[])
            add(row.p, row.n);
        for (const row of world.sqlite
            .prepare(
                `SELECT v.player_id AS p, m.units_json AS u FROM movements m
                 JOIN villages v ON v.id = m.origin_village_id`,
            )
            .all() as { p: number | null; u: string }[])
            add(
                row.p,
                UnitsSchema.parse(JSON.parse(row.u)).paladin ?? 0,
            );

        const statues = (
            world.sqlite
                .prepare(
                    "SELECT COUNT(*) AS n FROM buildings WHERE type = 'statue' AND level > 0",
                )
                .get() as { n: number }
        ).n;
        // Gemessen (19-14): alle sechs Bots haben eine Statue und genau einen
        // Paladin.
        expect(statues).toBeGreaterThan(0);
        expect(perPlayer.size).toBeGreaterThan(0);
        for (const n of perPlayer.values()) expect(n).toBe(1);
    }, 120_000);
});
