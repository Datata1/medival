import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Duration, GameTime } from '@medival/shared';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameClock, wallClock } from '../../src/engine/clock.js';
import { WorldManager } from '../../src/engine/worldManager.js';
import { act } from '../harness/act.js';
import {
    createTestApp,
    loginAs,
    type TestApp,
} from '../harness/app.js';
import { givenPlayer, givenVillage } from '../harness/given.js';
import { reportsOf } from '../harness/query.js';
import { QUIET_SETTINGS } from '../harness/world.js';

/**
 * Wanduhr & Welt-Lebenszyklus (plans/19-prototyp/19-3).
 */

const realNow = wallClock.now;
let dir: string | null = null;
let api: TestApp | null = null;

afterEach(async () => {
    // Erst schließen, dann die echte Uhr zurück: Beim Schließen rechnet die
    // Welt noch mit der Uhr, an der sie lief.
    await api?.dispose();
    api = null;
    wallClock.now = realNow;
    vi.restoreAllMocks();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
});

/** Eine Wanduhr, die nur vorrückt, wenn der Test es sagt. */
function fakeWallClock(start = 1_800_000_000_000) {
    let now = start;
    wallClock.now = () => now;
    return {
        advance(d: number) {
            now += d;
        },
    };
}

describe('Spielzeit läuft an der Wanduhr', () => {
    it('ein Serverausfall verschiebt keine Ankunft', () => {
        const wall = fakeWallClock();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-clock-'));
        let manager = new WorldManager(dir);
        const world = manager.createWorld('Ausfall', QUIET_SETTINGS);
        const a = givenPlayer(world, { name: 'A' });
        const home = givenVillage(world, a, {
            x: 10,
            y: 10,
            units: { axe: 100 },
        });
        const barb = givenVillage(world, null, {
            x: 13,
            y: 10,
            units: { spear: 1 },
        });
        const { arrivalGameTime } = act.attack(world, home, barb, {
            axe: 100,
        });
        expect(arrivalGameTime).toBeLessThan(Duration.minutes(5));
        const id = world.id;
        manager.shutdown();

        // Fünf Minuten Ausfall. Vorher wäre die Welt eingefroren und der
        // Angriff fünf Minuten später angekommen.
        wall.advance(Duration.minutes(5));
        manager = new WorldManager(dir);
        const reloaded = manager.getWorld(id);
        if (!reloaded) throw new Error('Welt fehlt');
        try {
            expect(reloaded.now()).toBe(Duration.minutes(5));
            const reports = reportsOf(reloaded, a);
            expect(reports).toHaveLength(1);
            // Abgerechnet zur ursprünglichen Ankunftszeit, nicht beim Neustart.
            expect(reports[0]?.createdGameTime).toBe(arrivalGameTime);
        } finally {
            manager.shutdown();
        }
    });

    it('eine verstellte Systemuhr verschiebt die Spielzeit nicht', () => {
        const clock = new GameClock(0, true);
        const before = clock.now();
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 3_600_000);
        // Monoton über performance.now(), nicht über Date.now().
        expect(clock.now()).toBeGreaterThanOrEqual(before);
        expect(clock.now() - before).toBeLessThan(1_000);
    });

    it('Spielstände von vor 19-3 laufen ab ihrem gespeicherten Stand weiter', () => {
        fakeWallClock();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-clock-'));
        let manager = new WorldManager(dir);
        const { id } = manager.createWorld('Alt', QUIET_SETTINGS);
        manager.shutdown();
        // So sah eine Metazeile vor 19-3 aus: kein Nullpunkt, nur der Stand.
        const meta = new Database(path.join(dir, 'worlds.sqlite'));
        meta.prepare(
            'UPDATE worlds SET epoch_zero_ms = NULL, game_time_ms = ? WHERE id = ?',
        ).run(Duration.hours(42), id);
        meta.close();

        manager = new WorldManager(dir);
        try {
            const world = manager.getWorld(id);
            expect(world?.now()).toBe(GameTime.of(Duration.hours(42)));
        } finally {
            manager.shutdown();
        }
    });

    it('liest den alten Status „won" als „ended" und startet nicht neu', () => {
        fakeWallClock();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-clock-'));
        let manager = new WorldManager(dir);
        const { id } = manager.createWorld('Sieg', QUIET_SETTINGS);
        manager.shutdown();
        const meta = new Database(path.join(dir, 'worlds.sqlite'));
        meta.prepare(
            "UPDATE worlds SET status = 'won' WHERE id = ?",
        ).run(id);
        meta.close();

        manager = new WorldManager(dir);
        try {
            const world = manager.getWorld(id);
            expect(world?.status).toBe('ended');
            world?.resume();
            expect(world?.status).toBe('ended');
        } finally {
            manager.shutdown();
        }
    });
});

describe('Pause und Vorspulen nur im Entwicklermodus', () => {
    it('ohne Entwicklermodus gibt es die Routen nicht', async () => {
        api = await createTestApp({ devMode: false });
        const world = api.manager.createWorld('Prod', QUIET_SETTINGS);
        for (const url of ['pause', 'resume', 'dev/skip']) {
            const res = await api.app.inject({
                method: 'POST',
                url: `/api/worlds/${world.id}/${url}`,
                payload: { ms: 1000 },
            });
            expect(res.statusCode).toBe(404);
        }
        const summary = await api.app.inject({
            url: `/api/worlds/${world.id}`,
        });
        expect(summary.json()).toMatchObject({ devMode: false });
    });

    it('im Entwicklermodus: pausieren, vorspulen, fortsetzen', async () => {
        const wall = fakeWallClock();
        api = await createTestApp({ devMode: true });
        const { cookie } = await loginAs(api, 'Verwalter');
        const headers = { cookie };
        const world = api.manager.createWorld('Dev', QUIET_SETTINGS);

        const paused = await api.app.inject({
            method: 'POST',
            headers,
            url: `/api/worlds/${world.id}/pause`,
        });
        expect(paused.json()).toMatchObject({
            status: 'paused',
            devMode: true,
        });
        // Pausiert: Die Wanduhr läuft, die Spielzeit nicht.
        wall.advance(Duration.minutes(10));
        expect(world.now()).toBe(0);

        const skipped = await api.app.inject({
            method: 'POST',
            headers,
            url: `/api/worlds/${world.id}/dev/skip`,
            payload: { ms: Duration.hours(1) },
        });
        expect(skipped.json()).toMatchObject({
            gameTime: Duration.hours(1),
        });

        await api.app.inject({
            method: 'POST',
            headers,
            url: `/api/worlds/${world.id}/resume`,
        });
        wall.advance(Duration.seconds(30));
        expect(world.now()).toBe(
            Duration.hours(1) + Duration.seconds(30),
        );
    });

    it('die Uhrzeit einer Spielzeit ist Nullpunkt plus Spielzeit', async () => {
        const wall = fakeWallClock(1_800_000_000_000);
        api = await createTestApp();
        const world = api.manager.createWorld('Uhr', QUIET_SETTINGS);
        wall.advance(Duration.minutes(7));
        const res = await api.app.inject({
            url: `/api/worlds/${world.id}`,
        });
        const { epochZeroMs, gameTime } = res.json() as {
            epochZeroMs: number;
            gameTime: number;
        };
        expect(epochZeroMs).toBe(1_800_000_000_000);
        expect(epochZeroMs + gameTime).toBe(wallClock.now());
    });
});
