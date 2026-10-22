import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameTime } from '@medival/shared';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
    type AttackTarget,
    decideScouting,
} from '../../src/ai/decide/military.js';
import { WorldManager } from '../../src/engine/worldManager.js';
import { act } from '../harness/act.js';
import { givenPlayer, givenVillage } from '../harness/given.js';
import { reportsOf, unitsAt } from '../harness/query.js';
import {
    advanceTo,
    createTestWorld,
    QUIET_SETTINGS,
    type TestWorld,
} from '../harness/world.js';

/**
 * Späher & Spähberichte (plans/19-prototyp/19-10).
 */

let tw: TestWorld | null = null;
afterEach(() => {
    tw?.dispose();
    tw = null;
});

/** A (10|10) und B (14|10), beide Menschen — Berichte werden geschrieben. */
function duel() {
    tw = createTestWorld();
    const { world } = tw;
    const a = givenPlayer(world, { name: 'A' });
    const b = givenPlayer(world, { name: 'B' });
    const home = givenVillage(world, a, {
        x: 10,
        y: 10,
        units: { spy: 5, axe: 100 },
    });
    const target = givenVillage(world, b, {
        x: 14,
        y: 10,
        levels: { wall: 3, barracks: 2 },
        units: { spear: 100 },
        resources: { wood: 700, clay: 600, iron: 500 },
    });
    return { world, a, b, home, target };
}

describe('Spähmission', () => {
    it('sieht Truppen, Rohstoffe und Gebäude — der Verteidiger merkt nichts', () => {
        const { world, a, b, home, target } = duel();
        const { arrivalGameTime } = act.attack(world, home, target, {
            spy: 5,
        });
        advanceTo(world, GameTime.of(arrivalGameTime));

        const [report] = reportsOf(world, a);
        expect(report?.type).toBe('scout');
        expect(report?.payload).toMatchObject({
            sent: 5,
            lost: 0,
            tier: 3,
            units: { spear: 100 },
            buildings: expect.objectContaining({
                wall: 3,
                barracks: 2,
            }),
        });
        // Rohstoffe zum Ankunftszeitpunkt — mit der Produktion seit dem Start.
        if (!report) throw new Error('kein Spähbericht');
        const seen = (report.payload as { resources: { wood: number } })
            .resources;
        expect(seen.wood).toBeGreaterThanOrEqual(700);
        expect(reportsOf(world, b)).toEqual([]);
        // Die Speere haben nicht gekämpft.
        expect(unitsAt(world, target).spear).toBe(100);
        // Die Späher kehren heim.
        advanceTo(world, GameTime.of(arrivalGameTime * 2));
        expect(unitsAt(world, home).spy).toBe(5);
    });

    it('scheitert an mehr gegnerischen Spähern — nur der Verteidiger erfährt davon', () => {
        const { world, a, b, home, target } = duel();
        world.addUnits(target, { spy: 20 });
        const { arrivalGameTime } = act.attack(world, home, target, {
            spy: 5,
        });
        advanceTo(world, GameTime.of(arrivalGameTime * 3));

        expect(reportsOf(world, a)).toEqual([]);
        const [notice] = reportsOf(world, b);
        expect(notice?.type).toBe('scout_defense');
        expect(notice?.payload).toMatchObject({
            sent: 5,
            lost: 5,
            defenderSpies: 20,
            units: null,
            resources: null,
        });
        expect(unitsAt(world, home).spy ?? 0).toBe(0);
    });

    it('überlebende Späher eines gemischten Angriffs sehen Lager und Gebäude', () => {
        const { world, a, home, target } = duel();
        world.sqlite
            .prepare(
                "UPDATE units SET count_home = 5 WHERE village_id = ? AND unit_type = 'spear'",
            )
            .run(target);
        const { arrivalGameTime } = act.attack(world, home, target, {
            axe: 100,
            spy: 5,
        });
        advanceTo(world, GameTime.of(arrivalGameTime));

        const [report] = reportsOf(world, a);
        expect(report?.type).toBe('attack');
        expect(report?.payload).toMatchObject({
            attackerWon: true,
            scouted: {
                buildings: expect.objectContaining({ wall: 3 }),
            },
        });
    });

    it('merkt sich das Gesehene für den Spähenden — auch für Bots', () => {
        const { world, home, target } = duel();
        const bot = givenPlayer(world, { bot: true });
        world.sqlite
            .prepare('UPDATE villages SET player_id = ? WHERE id = ?')
            .run(bot, home);
        const { arrivalGameTime } = act.attack(world, home, target, {
            spy: 5,
        });
        advanceTo(world, GameTime.of(arrivalGameTime));
        const intel = world.sqlite
            .prepare(
                'SELECT payload_json AS p FROM scout_intel WHERE player_id = ? AND village_id = ?',
            )
            .get(bot, target) as { p: string } | undefined;
        expect(JSON.parse(intel?.p ?? '{}')).toMatchObject({
            units: { spear: 100 },
            wall: 3,
        });
    });
});

describe('Bots spähen ihr Lieblingsziel aus', () => {
    const target = (patch: Partial<AttackTarget>): AttackTarget => ({
        villageId: 1,
        ownerId: null,
        x: 12,
        y: 10,
        points: 300,
        standing: 0,
        estimatedDefense: { spear: 30 },
        estimatedWall: 1,
        scouted: false,
        ...patch,
    });
    const home = { x: 10, y: 10, units: { spy: 5 } };

    it('schickt Späher zum besten unbekannten Ziel und behält einen zu Hause', () => {
        const plan = decideScouting(
            home,
            [
                target({ villageId: 1, points: 100 }),
                target({ villageId: 2, points: 900 }),
            ],
            'raider',
        );
        expect(plan).toEqual({
            kind: 'scout',
            targetVillageId: 2,
            units: { spy: 3 },
        });
        expect(
            decideScouting(
                { ...home, units: { spy: 2 } },
                [target({})],
                'raider',
            )?.units,
        ).toEqual({ spy: 1 });
    });

    it('späht nicht, wenn das Lieblingsziel schon erkundet ist oder Späher unterwegs sind', () => {
        expect(
            decideScouting(home, [target({ scouted: true })], 'raider'),
        ).toBeNull();
        expect(
            decideScouting(
                { ...home, scoutsInFlight: true },
                [target({})],
                'raider',
            ),
        ).toBeNull();
    });

    it('turtle späht nie, neutrale Spieler werden nicht ausgespäht', () => {
        expect(decideScouting(home, [target({})], 'turtle')).toBeNull();
        expect(
            decideScouting(
                home,
                [target({ ownerId: 7, standing: 0 })],
                'raider',
            ),
        ).toBeNull();
    });
});

describe('Alte Spielstände', () => {
    it('lassen nach dem Öffnen Späher zu (CHECK-Liste wird erneuert)', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'medival-spy-'),
        );
        try {
            let manager = new WorldManager(dir);
            const world = manager.createWorld('Alt', QUIET_SETTINGS, {
                founder: { name: 'Spieler' },
            });
            world.addUnits(1, { spear: 12 });
            const id = world.id;
            manager.shutdown();

            // So sah `units` vor 19-10 aus: ohne 'spy' in der Liste.
            const db = new Database(
                path.join(dir, `world_${id}.sqlite`),
            );
            db.exec(`
                ALTER TABLE units RENAME TO units_new;
                CREATE TABLE units (
                  village_id INTEGER NOT NULL,
                  unit_type TEXT NOT NULL CHECK (unit_type IN ('spear', 'sword', 'axe', 'light_cavalry', 'heavy_cavalry', 'ram', 'noble')),
                  count_home INTEGER NOT NULL DEFAULT 0,
                  UNIQUE(village_id, unit_type)
                );
                INSERT INTO units SELECT * FROM units_new;
                DROP TABLE units_new;
            `);
            expect(() =>
                db
                    .prepare(
                        "INSERT INTO units (village_id, unit_type, count_home) VALUES (1, 'spy', 1)",
                    )
                    .run(),
            ).toThrow(/CHECK/);
            db.close();

            manager = new WorldManager(dir);
            const reopened = manager.getWorld(id);
            if (!reopened) throw new Error('Welt fehlt');
            reopened.addUnits(1, { spy: 3 });
            expect(reopened.getUnits(1)).toMatchObject({
                spear: 12,
                spy: 3,
            });
            manager.shutdown();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
