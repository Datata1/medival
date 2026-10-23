import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { WorldManager } from '../../src/engine/worldManager.js';
import { act } from '../harness/act.js';
import {
    createTestApp,
    loginAs,
    type TestApp,
} from '../harness/app.js';
import { givenPlayer, givenVillage } from '../harness/given.js';
import {
    advanceYielding,
    createTestWorld,
    gameWeeks,
    QUIET_SETTINGS,
    type TestWorld,
} from '../harness/world.js';

/**
 * Bogenschützen als Welt-Option (plans/19-prototyp/19-12).
 */

let tw: TestWorld | null = null;
let api: TestApp | null = null;
afterEach(async () => {
    tw?.dispose();
    tw = null;
    await api?.dispose();
    api = null;
});

describe('Welt-Option archers', () => {
    it('ist standardmäßig an: Bogenschützen lassen sich ausheben', () => {
        tw = createTestWorld();
        const { world } = tw;
        expect(world.settings.archers).toBe(true);
        const p = givenPlayer(world, { name: 'A' });
        const v = givenVillage(world, p, {
            x: 10,
            y: 10,
            levels: { barracks: 1, stable: 1, farm: 10 },
            resources: 'full',
        });
        act.recruit(world, v, 'archer', 1);
        act.recruit(world, v, 'mounted_archer', 1);
    });

    it('ausgeschaltet: Rekrutierung über die API wird mit unit_disabled abgewiesen', async () => {
        api = await createTestApp();
        const world = api.manager.createWorld(
            'Ohne Bogen',
            { ...QUIET_SETTINGS, archers: false },
            { paused: true },
        );
        const { cookie } = await loginAs(api, 'Adalbert');
        const joined = await api.app.inject({
            method: 'POST',
            url: `/api/worlds/${world.id}/join`,
            headers: { cookie },
        });
        const village = (
            joined.json() as { playerVillages: { id: number }[] }
        ).playerVillages[0]?.id;
        if (village === undefined) throw new Error('kein Dorf');
        world.sqlite
            .prepare(
                "UPDATE buildings SET level = 5 WHERE village_id = ? AND type IN ('barracks', 'farm')",
            )
            .run(village);

        const res = await api.app.inject({
            method: 'POST',
            url: `/api/worlds/${world.id}/villages/${village}/recruit`,
            headers: { cookie },
            payload: { unit: 'archer', count: 1 },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'unit_disabled' });

        const summary = await api.app.inject({
            url: `/api/worlds/${world.id}`,
            headers: { cookie },
        });
        expect(summary.json()).toMatchObject({
            settings: { archers: false },
        });
    });

    it('alte Welten ohne die Einstellung laden mit Bogenschützen', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'medival-arc-'),
        );
        try {
            let manager = new WorldManager(dir);
            const id = manager.createWorld('Alt', QUIET_SETTINGS).id;
            manager.shutdown();

            const meta = new Database(path.join(dir, 'worlds.sqlite'));
            const row = meta
                .prepare(
                    'SELECT settings_json AS s FROM worlds WHERE id = ?',
                )
                .get(id) as { s: string };
            const old = JSON.parse(row.s) as Record<string, unknown>;
            delete old.archers;
            meta.prepare(
                'UPDATE worlds SET settings_json = ? WHERE id = ?',
            ).run(JSON.stringify(old), id);
            meta.close();

            manager = new WorldManager(dir);
            expect(manager.getWorld(id)?.settings.archers).toBe(true);
            manager.shutdown();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

/**
 * Drei Spielwochen mit vier `turtle`-Bots; Bogenschützen zu Hause und in
 * Auftrag. Drei, weil Bogenschützen seit 19-13 Schmiede 5 verlangen: Nach
 * zwei Wochen hatte noch kein Bot eine Schmiede, nach drei alle Stufe 5
 * (gemessen).
 */
async function turtleWeek(archers: boolean): Promise<number> {
    tw = createTestWorld(
        {
            speed: 200,
            unitSpeed: 200,
            mapSize: 30,
            botCount: 4,
            barbarianCount: 0,
            seed: 12,
            archers,
        },
        archers ? 'Mit Bogen' : 'Ohne Bogen',
    );
    const { world } = tw;
    world.sqlite
        .prepare(
            "UPDATE players SET personality = 'turtle' WHERE is_bot = 1",
        )
        .run();
    await advanceYielding(world, gameWeeks(world, 3));
    const n = (type: string) =>
        (
            world.sqlite
                .prepare(
                    `SELECT
                       (SELECT COALESCE(SUM(count_home), 0) FROM units WHERE unit_type = ?) +
                       (SELECT COALESCE(SUM(count), 0) FROM recruit_queue WHERE unit_type = ?) AS n`,
                )
                .get(type, type) as { n: number }
        ).n;
    return n('archer') + n('mounted_archer');
}

describe('Bots und Bogenschützen', () => {
    it('turtle-Bots heben Bogenschützen aus, wenn es sie gibt', async () => {
        // Gemessen (19-13): 69 Bogenschützen neben 230 Speeren und 104
        // Schwertern, dazu 3 in Ausbildung.
        expect(await turtleWeek(true)).toBeGreaterThan(0);
    }, 90_000);

    it('ohne die Option hebt kein Bot welche aus', async () => {
        expect(await turtleWeek(false)).toBe(0);
    }, 90_000);
});
