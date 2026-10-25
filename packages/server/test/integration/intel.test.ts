import { afterEach, describe, expect, it } from 'vitest';
import {
    createTestApp,
    loginAs,
    type TestApp,
} from '../harness/app.js';
import { advance } from '../harness/world.js';

/**
 * „Zuletzt erkundet" im Kartenpanel (plans/20-nacharbeiten/20-5).
 */

let api: TestApp | null = null;
afterEach(async () => {
    await api?.dispose();
    api = null;
});

async function threePlayers() {
    api = await createTestApp();
    const world = api.manager.createWorld(
        'Spähwelt',
        {
            speed: 100,
            unitSpeed: 100,
            mapSize: 100,
            botCount: 0,
            barbarianCount: 0,
            barbariansPerSettler: 0,
            barbarianAttemptsPerHour: 0,
            seed: 9,
        },
        { paused: true },
    );
    const join = async (name: string) => {
        const { cookie } = await loginAs(api!, name);
        const res = await api!.app.inject({
            method: 'POST',
            url: `/api/worlds/${world.id}/join`,
            headers: { cookie },
        });
        const summary = res.json() as {
            playerVillages: { id: number }[];
        };
        const village = summary.playerVillages[0]?.id;
        if (village === undefined)
            throw new Error(`${name}: kein Dorf`);
        return { cookie, village };
    };
    return {
        world,
        a: await join('Adalbert'),
        b: await join('Brunhild'),
        c: await join('Clothilde'),
    };
}

describe('GET /villages/:vid/intel', () => {
    it('liefert nur das eigene Spähwissen', async () => {
        const { world, a, b, c } = await threePlayers();
        const intel = (cookie: string) =>
            api!.app.inject({
                url: `/api/worlds/${world.id}/villages/${b.village}/intel`,
                headers: { cookie },
            });
        expect((await intel(a.cookie)).json()).toBeNull();

        world.addUnits(a.village, { spy: 5 });
        world.addUnits(b.village, { spear: 12 });
        const sent = await api!.app.inject({
            method: 'POST',
            url: `/api/worlds/${world.id}/villages/${a.village}/send`,
            headers: { cookie: a.cookie },
            payload: {
                target: b.village,
                kind: 'attack',
                units: { spy: 5 },
            },
        });
        expect(sent.statusCode).toBe(200);
        advance(world, 3_600_000);

        const mine = await intel(a.cookie);
        expect(mine.statusCode).toBe(200);
        expect(mine.json()).toMatchObject({
            units: { spear: 12 },
            wall: 0,
            gameTime: expect.any(Number),
        });
        // C hat nicht gespäht und sieht nichts, auch nicht A's Wissen.
        expect((await intel(c.cookie)).json()).toBeNull();
    });

    it('verlangt einen Spieler in der Welt', async () => {
        const { world, b } = await threePlayers();
        const { cookie } = await loginAs(api!, 'Zaungast');
        const res = await api!.app.inject({
            url: `/api/worlds/${world.id}/villages/${b.village}/intel`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(403);
    });
});
