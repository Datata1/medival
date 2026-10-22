import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Duration, GameTime } from '@medival/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { WorldManager } from '../../src/engine/worldManager.js';
import { act } from '../harness/act.js';
import { givenPlayer, givenVillage } from '../harness/given.js';
import { levelOf, reportsOf, unitsAt } from '../harness/query.js';
import {
    advance,
    advanceTo,
    advanceUntil,
    createTestWorld,
    QUIET_SETTINGS,
    type TestWorld,
} from '../harness/world.js';

/**
 * Werkstatt, Katapult, Rammbock-Umzug (plans/19-prototyp/19-11).
 */

let tw: TestWorld | null = null;
afterEach(() => {
    tw?.dispose();
    tw = null;
});

/** A (10|10) mit Katapulten und Äxten, B (13|10) ohne Verteidigung. */
function siege(defender: Record<string, number> = {}) {
    tw = createTestWorld();
    const { world } = tw;
    const a = givenPlayer(world, { name: 'A' });
    const b = givenPlayer(world, { name: 'B' });
    const home = givenVillage(world, a, {
        x: 10,
        y: 10,
        units: { axe: 200, catapult: 30 },
    });
    const target = givenVillage(world, b, {
        x: 13,
        y: 10,
        levels: {
            barracks: 10,
            headquarters: 5,
            wall: 2,
            warehouse: 30,
        },
        units: defender,
    });
    return { world, a, b, home, target };
}

describe('Katapulte', () => {
    it('schießen das gewählte Gebäude nach der Tabelle herunter', () => {
        const { world, a, b, home, target } = siege();
        const pointsBefore = world.getVillageRow(target).points;
        // 12 Katapulte: 10→9 (4), 9→8 (4), 8→7 (4) — genau drei Stufen.
        const { arrivalGameTime } = act.attack(
            world,
            home,
            target,
            { axe: 200, catapult: 12 },
            'barracks',
        );
        advanceTo(world, GameTime.of(arrivalGameTime));

        expect(levelOf(world, target, 'barracks')).toBe(7);
        expect(world.getVillageRow(target).points).toBeLessThan(
            pointsBefore,
        );
        const [report] = reportsOf(world, a);
        expect(report?.payload).toMatchObject({
            attackerWon: true,
            buildingDamage: { building: 'barracks', from: 10, to: 7 },
        });
        expect(reportsOf(world, b)[0]?.payload).toMatchObject({
            buildingDamage: { building: 'barracks', from: 10, to: 7 },
        });
    });

    it('ohne gewähltes Ziel treffen sie das Hauptgebäude, nie unter Stufe 1', () => {
        const { world, home, target } = siege();
        const { arrivalGameTime } = act.attack(world, home, target, {
            axe: 200,
            catapult: 30,
        });
        advanceTo(world, GameTime.of(arrivalGameTime));
        expect(levelOf(world, target, 'headquarters')).toBe(1);
    });

    it('ein laufender Ausbau baut auf der beschossenen Stufe weiter', () => {
        const { world, home, target } = siege();
        world.sqlite
            .prepare(
                'UPDATE villages SET wood = 50000, clay = 50000, iron = 50000 WHERE id = ?',
            )
            .run(target);
        act.build(world, target, 'barracks');
        const { arrivalGameTime } = act.attack(
            world,
            home,
            target,
            { axe: 200, catapult: 12 },
            'barracks',
        );
        advanceTo(world, GameTime.of(arrivalGameTime));
        expect(levelOf(world, target, 'barracks')).toBe(7);
        advance(world, 30 * 24 * 3_600_000);
        expect(levelOf(world, target, 'barracks')).toBe(8);
    });
});

describe('Werkstatt', () => {
    it('Rammen brauchen die Werkstatt und laufen neben der Kaserne', () => {
        tw = createTestWorld();
        const { world } = tw;
        const p = givenPlayer(world, { name: 'A' });
        const village = givenVillage(world, p, {
            x: 10,
            y: 10,
            levels: {
                barracks: 5,
                farm: 20,
                headquarters: 10,
                warehouse: 30,
            },
            resources: 'full',
        });
        expect(() => act.recruit(world, village, 'ram', 1)).toThrow(
            /workshop_missing/,
        );

        world.sqlite
            .prepare(
                "UPDATE buildings SET level = 3 WHERE village_id = ? AND type = 'workshop'",
            )
            .run(village);
        act.recruit(world, village, 'spear', 200);
        act.recruit(world, village, 'ram', 1);
        // Die Ramme wird fertig, während die Kaserne noch Speere baut.
        expect(
            advanceUntil(
                world,
                () => unitsAt(world, village).ram === 1,
                Duration.hours(1),
            ),
        ).toBe(true);
        expect(unitsAt(world, village).spear ?? 0).toBeLessThan(200);
    });

    it('ein alter Rammenauftrag hinter der Kaserne läuft in der Werkstatt an', () => {
        tw = createTestWorld();
        const { world } = tw;
        const p = givenPlayer(world, { name: 'A' });
        const village = givenVillage(world, p, {
            x: 10,
            y: 10,
            levels: {
                barracks: 5,
                farm: 20,
                workshop: 1,
                warehouse: 30,
            },
            resources: 'full',
        });
        act.recruit(world, village, 'spear', 200);
        // So stand er vor 19-11 in der Schlange: wartend hinter den Speeren.
        world.sqlite
            .prepare(
                "INSERT INTO recruit_queue (village_id, unit_type, count, started_at, per_unit_ms) VALUES (?, 'ram', 2, NULL, 60000)",
            )
            .run(village);
        advance(world, 3 * 3_600_000);
        expect(unitsAt(world, village).ram).toBe(2);
    });
});

describe('Alte Spielstände', () => {
    it('bekommen nach dem Öffnen eine Werkstatt auf Stufe 0', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'medival-ws-'),
        );
        try {
            let manager = new WorldManager(dir);
            const world = manager.createWorld('Alt', QUIET_SETTINGS, {
                founder: { name: 'Spieler' },
            });
            const id = world.id;
            world.sqlite
                .prepare(
                    "DELETE FROM buildings WHERE type = 'workshop'",
                )
                .run();
            manager.shutdown();

            manager = new WorldManager(dir);
            const reopened = manager.getWorld(id);
            if (!reopened) throw new Error('Welt fehlt');
            const rows = reopened.sqlite
                .prepare(
                    "SELECT level FROM buildings WHERE type = 'workshop'",
                )
                .all();
            expect(rows).toEqual([{ level: 0 }]);
            manager.shutdown();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
