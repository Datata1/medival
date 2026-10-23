import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameTime, hiddenCapacity } from '@medival/shared';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getResearch,
    getResearched,
} from '../../src/engine/research.js';
import { WorldManager } from '../../src/engine/worldManager.js';
import { act } from '../harness/act.js';
import { givenPlayer, givenVillage } from '../harness/given.js';
import { levelOf, reportsOf } from '../harness/query.js';
import {
    advanceTo,
    advanceYielding,
    createTestWorld,
    gameWeeks,
    QUIET_SETTINGS,
    type TestWorld,
} from '../harness/world.js';

/**
 * Schmiede, Versammlungsplatz, Versteck (plans/19-prototyp/19-13).
 */

let tw: TestWorld | null = null;
afterEach(() => {
    tw?.dispose();
    tw = null;
    vi.restoreAllMocks();
});

describe('Schmiede', () => {
    it('ohne Forschung keine Axt; nach der Forschung genau zum Zeitpunkt schon', () => {
        tw = createTestWorld();
        const { world } = tw;
        const p = givenPlayer(world, { name: 'A' });
        const v = givenVillage(world, p, {
            x: 10,
            y: 10,
            levels: {
                headquarters: 5,
                barracks: 3,
                smithy: 2,
                farm: 10,
                warehouse: 20,
            },
            resources: 'full',
            researched: [],
        });
        expect(() => act.recruit(world, v, 'axe', 1)).toThrow(
            /not_researched/,
        );
        // Speerträger brauchen keine Forschung.
        act.recruit(world, v, 'spear', 1);

        act.research(world, v, 'axe');
        expect(() => act.research(world, v, 'sword')).toThrow(
            /research_busy/,
        );
        const running = getResearch(world, v);
        if (!running) throw new Error('keine Forschung');
        expect(running.unit).toBe('axe');

        advanceTo(world, GameTime.of(running.completesAt - 1));
        expect(getResearched(world, v)).toEqual([]);
        advanceTo(world, running.completesAt);
        expect(getResearched(world, v)).toEqual(['axe']);
        expect(getResearch(world, v)).toBeNull();
        act.recruit(world, v, 'axe', 1);
    });

    it('verlangt die Schmiedenstufe und die Nebengebäude', () => {
        tw = createTestWorld();
        const { world } = tw;
        const p = givenPlayer(world, { name: 'A' });
        const v = givenVillage(world, p, {
            x: 10,
            y: 10,
            levels: { smithy: 2, warehouse: 20 },
            resources: 'full',
            researched: [],
        });
        expect(() => act.research(world, v, 'light_cavalry')).toThrow(
            /smithy_too_low/,
        );
        expect(() => act.research(world, v, 'spy')).toThrow(
            /requirements_missing/,
        );
        expect(() => act.research(world, v, 'spear')).toThrow(
            /no_research_needed/,
        );
    });
});

describe('Versammlungsplatz', () => {
    it('zerschossen kann das Dorf keine Truppen schicken, neu gebaut wieder', () => {
        tw = createTestWorld();
        const { world } = tw;
        const a = givenPlayer(world, { name: 'A' });
        const b = givenPlayer(world, { name: 'B' });
        const home = givenVillage(world, a, {
            x: 10,
            y: 10,
            units: { axe: 100, catapult: 2 },
        });
        const target = givenVillage(world, b, {
            x: 13,
            y: 10,
            units: { spear: 1 },
            levels: { warehouse: 10 },
        });
        world.sqlite
            .prepare(
                'UPDATE units SET count_home = 0 WHERE village_id = ?',
            )
            .run(target);
        // Zwei Katapulte reichen für Stufe 1 → 0.
        const { arrivalGameTime } = act.attack(
            world,
            home,
            target,
            { axe: 100, catapult: 2 },
            'rally_point',
        );
        advanceTo(world, GameTime.of(arrivalGameTime));
        expect(levelOf(world, target, 'rally_point')).toBe(0);

        world.addUnits(target, { spear: 5 });
        expect(() =>
            act.attack(world, target, home, { spear: 5 }),
        ).toThrow(/no_rally_point/);

        world.sqlite
            .prepare(
                'UPDATE villages SET wood = 1000, clay = 1000, iron = 1000 WHERE id = ?',
            )
            .run(target);
        act.build(world, target, 'rally_point');
        advanceTo(world, GameTime.add(world.now(), 3_600_000));
        expect(levelOf(world, target, 'rally_point')).toBe(1);
        act.attack(world, target, home, { spear: 5 });
    });
});

describe('Versteck', () => {
    it('schützt je Rohstoff hiddenCapacity(level) vor der Plünderung', () => {
        tw = createTestWorld();
        const { world } = tw;
        const a = givenPlayer(world, { name: 'A' });
        const b = givenPlayer(world, { name: 'B' });
        const home = givenVillage(world, a, {
            x: 10,
            y: 10,
            units: { light_cavalry: 500 },
        });
        const target = givenVillage(world, b, {
            x: 13,
            y: 10,
            levels: { hiding_place: 5, warehouse: 10 },
            resources: { wood: 1000, clay: 1000, iron: 1000 },
        });
        const hidden = hiddenCapacity(5);
        const { arrivalGameTime } = act.attack(world, home, target, {
            light_cavalry: 500,
        });
        advanceTo(world, GameTime.of(arrivalGameTime));

        const left = world.getVillageRow(target);
        // Bis zur Ankunft kommt Produktion dazu; geschützt bleibt mindestens
        // die Versteckmenge, geplündert wurde alles darüber.
        for (const r of ['wood', 'clay', 'iron'] as const)
            expect(Math.floor(left[r])).toBe(hidden);
        const [report] = reportsOf(world, a);
        if (!report) throw new Error('kein Bericht');
        const { loot } = report.payload as { loot: { wood: number } };
        expect(loot.wood).toBeLessThan(1000);
        expect(loot.wood).toBeGreaterThanOrEqual(1000 - hidden);
    });
});

describe('Alte Spielstände', () => {
    it('behalten ihre Einheiten als erforscht und bekommen einen Versammlungsplatz', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'medival-smithy-'),
        );
        try {
            let manager = new WorldManager(dir);
            const world = manager.createWorld('Alt', QUIET_SETTINGS, {
                founder: { name: 'Spieler' },
            });
            world.addUnits(1, { axe: 7 });
            const id = world.id;
            manager.shutdown();

            // So sah die Welt vor 19-13 aus: keine Forschung, kein
            // Versammlungsplatz als Gebäude.
            const db = new Database(
                path.join(dir, `world_${id}.sqlite`),
            );
            db.exec(`
                DROP TABLE research;
                DROP TABLE research_queue;
                DELETE FROM buildings WHERE type IN ('rally_point', 'smithy', 'hiding_place');
            `);
            db.close();

            manager = new WorldManager(dir);
            const reopened = manager.getWorld(id);
            if (!reopened) throw new Error('Welt fehlt');
            expect(getResearched(reopened, 1)).toEqual(['axe']);
            expect(reopened.getBuildingLevels(1)).toMatchObject({
                rally_point: 1,
                smithy: 0,
                hiding_place: 0,
            });
            manager.shutdown();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('Bots forschen', () => {
    it('und heben danach mehr als Speerträger aus — ohne abgewiesene Rekrutierung', async () => {
        const warn = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => {});
        tw = createTestWorld(
            {
                speed: 200,
                unitSpeed: 200,
                mapSize: 30,
                botCount: 6,
                barbarianCount: 0,
                seed: 12,
            },
            'Forschungswelt',
        );
        const { world } = tw;
        await advanceYielding(world, gameWeeks(world, 3));

        const researched = (
            world.sqlite
                .prepare('SELECT COUNT(*) AS n FROM research')
                .get() as { n: number }
        ).n;
        const beyondSpears = (
            world.sqlite
                .prepare(
                    `SELECT COALESCE(SUM(u.count_home), 0) AS n FROM units u
                     JOIN villages v ON v.id = u.village_id
                     WHERE v.player_id > 1 AND u.unit_type <> 'spear'`,
                )
                .get() as { n: number }
        ).n;
        // Gemessen (19-13): 13 Forschungen in sechs Bot-Dörfern, 275
        // Einheiten außer Speerträgern, kein einziger abgewiesener Intent.
        expect(researched).toBeGreaterThan(0);
        expect(beyondSpears).toBeGreaterThan(0);
        const rejected = warn.mock.calls
            .map((c) => String(c[0]))
            .filter((m) => m.includes('abgewiesen'));
        expect(rejected).toEqual([]);
    }, 120_000);
});
