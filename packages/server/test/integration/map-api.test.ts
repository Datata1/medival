import { afterEach, describe, expect, it } from 'vitest';
import {
    createTestApp,
    loginAs,
    type TestApp,
} from '../harness/app.js';
import {
    givenPlayer,
    givenTribe,
    givenVillage,
} from '../harness/given.js';

/**
 * Karten-API in Kacheln (plans/19-prototyp/19-7-karten-api-ausschnitt.md).
 */

let api: TestApp | null = null;
/** Session eines angemeldeten Accounts — die Karte ist nur angemeldet lesbar (19-9). */
let cookie = '';
afterEach(async () => {
    await api?.dispose();
    api = null;
});

interface TileResponse {
    tiles: {
        tx: number;
        ty: number;
        villages: {
            id: number;
            x: number;
            y: number;
            tribeTag?: string | null;
        }[];
    }[];
}

/** Eine Welt mit `count` Dörfern auf einem Raster um die Mitte. */
async function crowded(count: number) {
    api = await createTestApp();
    cookie = (await loginAs(api, 'Kartografin')).cookie;
    const world = api.manager.createWorld('Karte', {
        mapSize: 1000,
        botCount: 0,
        barbarianCount: 0,
        barbarianAttemptsPerHour: 0,
        seed: 1,
    });
    world.pause();
    world.sqlite.transaction(() => {
        let placed = 0;
        for (let x = 400; placed < count; x += 2)
            for (let y = 400; y < 600 && placed < count; y += 2) {
                if (x === 500 && y === 500) continue; // Heimatdorf
                givenVillage(world, null, { x, y });
                placed++;
            }
    })();
    return world;
}

describe('GET /map/tiles', () => {
    it('liefert genau die Dörfer der angefragten Kacheln', async () => {
        const world = await crowded(5_000);
        const res = await api!.app.inject({
            headers: { cookie },
            url: `/api/worlds/${world.id}/map/tiles?tx0=22&ty0=22&tx1=25&ty1=25`,
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as TileResponse;
        expect(body.tiles).toHaveLength(16);
        const expected = world.sqlite
            .prepare(
                'SELECT COUNT(*) AS n FROM villages WHERE x BETWEEN 440 AND 519 AND y BETWEEN 440 AND 519',
            )
            .get() as { n: number };
        const got = body.tiles.flatMap((t) => t.villages);
        expect(got).toHaveLength(expected.n);
        for (const tile of body.tiles)
            for (const v of tile.villages) {
                expect(Math.floor(v.x / 20)).toBe(tile.tx);
                expect(Math.floor(v.y / 20)).toBe(tile.ty);
            }
    });

    it('beantwortet den Übersichtsausschnitt (6×6) schnell', async () => {
        const world = await crowded(5_000);
        const url = `/api/worlds/${world.id}/map/tiles?tx0=22&ty0=22&tx1=27&ty1=27`;
        await api!.app.inject({ url, headers: { cookie } }); // Aufwärmen
        const times: number[] = [];
        for (let i = 0; i < 20; i++) {
            const t0 = performance.now();
            await api!.app.inject({ url, headers: { cookie } });
            times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        // Gemessen (Laptop, 2026-10-22): p50 3,1 ms, p95 3,7 ms für 1 801
        // Dörfer (sehr dichter Ausschnitt), 170 KB. Großzügig für den CI-Runner.
        expect(times[10]).toBeLessThan(50);
    }, 60_000);

    it('lehnt zu große Ausschnitte ab und liefert jenseits der Karte leere Kacheln', async () => {
        const world = await crowded(10);
        const tooBig = await api!.app.inject({
            headers: { cookie },
            url: `/api/worlds/${world.id}/map/tiles?tx0=0&ty0=0&tx1=6&ty1=6`,
        });
        expect(tooBig.statusCode).toBe(400);
        const outside = await api!.app.inject({
            headers: { cookie },
            url: `/api/worlds/${world.id}/map/tiles?tx0=60&ty0=60&tx1=61&ty1=61`,
        });
        expect(outside.statusCode).toBe(200);
        expect(
            (outside.json() as TileResponse).tiles.every(
                (t) => t.villages.length === 0,
            ),
        ).toBe(true);
    });

    it('trägt das Stammeskürzel des Besitzers', async () => {
        api = await createTestApp();
        cookie = (await loginAs(api, 'Kartografin')).cookie;
        const world = api.manager.createWorld('Stamm', {
            mapSize: 100,
            botCount: 0,
            barbarianCount: 0,
            seed: 2,
        });
        const a = givenPlayer(world, { name: 'A' });
        givenVillage(world, a, { x: 10, y: 10 });
        givenTribe(world, a, [], 'Die Roten', 'ROT');
        const res = await api.app.inject({
            headers: { cookie },
            url: `/api/worlds/${world.id}/map/tiles?tx0=0&ty0=0&tx1=0&ty1=0`,
        });
        const [tile] = (res.json() as TileResponse).tiles;
        expect(tile?.villages.find((v) => v.x === 10)?.tribeTag).toBe(
            'ROT',
        );
    });
});

describe('GET /map/at', () => {
    it('findet das Dorf auf einem Feld — oder keines', async () => {
        const world = await crowded(10);
        const hit = await api!.app.inject({
            headers: { cookie },
            url: `/api/worlds/${world.id}/map/at?x=400&y=402`,
        });
        expect(
            (hit.json() as { village: { x: number } | null }).village
                ?.x,
        ).toBe(400);
        const miss = await api!.app.inject({
            headers: { cookie },
            url: `/api/worlds/${world.id}/map/at?x=401&y=401`,
        });
        expect(
            (miss.json() as { village: unknown }).village,
        ).toBeNull();
    });
});

describe('Alte Route', () => {
    it('/map mit allen Dörfern gibt es nicht mehr', async () => {
        const world = await crowded(1);
        const res = await api!.app.inject({
            headers: { cookie },
            url: `/api/worlds/${world.id}/map`,
        });
        expect(res.statusCode).toBe(404);
    });
});
