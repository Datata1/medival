import type { Units } from '@medival/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { World } from '../../src/engine/world.js';
import {
    createTestApp,
    loginAs,
    type TestApp,
} from '../harness/app.js';
import { reportsOf } from '../harness/query.js';
import { advance } from '../harness/world.js';

/**
 * Welt beitreten & Mehrspieler-Rechte (plans/19-prototyp/19-9).
 *
 * Alles über die echte HTTP-App mit echten Sessions: Drei Accounts treten
 * derselben Welt bei und dürfen nur ihr Eigenes sehen und steuern.
 */

let api: TestApp | null = null;
afterEach(async () => {
    await api?.dispose();
    api = null;
});

interface Summary {
    id: number;
    playerId: number | null;
    playerVillages: { id: number; x: number; y: number }[];
}

/** Eine Welt ohne Gründer und drei Accounts, die ihr beitreten. */
async function threePlayers() {
    api = await createTestApp();
    const world = api.manager.createWorld(
        'Mehrspieler',
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
        expect(res.statusCode, `${name} tritt bei`).toBe(200);
        const summary = res.json() as Summary;
        const village = summary.playerVillages[0];
        if (!village || summary.playerId === null)
            throw new Error(`${name}: kein Dorf`);
        return {
            cookie,
            playerId: summary.playerId,
            village: village.id,
        };
    };
    return {
        world,
        a: await join('Adalbert'),
        b: await join('Brunhild'),
        c: await join('Clothilde'),
    };
}

const give = (world: World, villageId: number, units: Units) => {
    world.addUnits(villageId, units);
    world.sqlite
        .prepare(
            "UPDATE buildings SET level = 5 WHERE village_id = ? AND type IN ('barracks', 'farm', 'warehouse')",
        )
        .run(villageId);
};

describe('Beitreten', () => {
    it('gibt jedem Account einen Spieler und ein Dorf — einmal je Welt', async () => {
        const { world, a, b, c } = await threePlayers();
        expect(new Set([a.playerId, b.playerId, c.playerId]).size).toBe(
            3,
        );
        expect(new Set([a.village, b.village, c.village]).size).toBe(3);

        const again = await api!.app.inject({
            method: 'POST',
            url: `/api/worlds/${world.id}/join`,
            headers: { cookie: a.cookie },
        });
        expect(again.statusCode).toBe(409);
        expect(again.json()).toEqual({ error: 'already_joined' });

        const list = await api!.app.inject({
            url: '/api/worlds',
            headers: { cookie: a.cookie },
        });
        expect(list.json()).toEqual([
            expect.objectContaining({ id: world.id, joined: true }),
        ]);
    });

    it('wer nicht beigetreten ist, sieht die Welt, spielt aber nicht mit', async () => {
        const { world } = await threePlayers();
        const { cookie } = await loginAs(api!, 'Zaungast');
        const summary = await api!.app.inject({
            url: `/api/worlds/${world.id}`,
            headers: { cookie },
        });
        expect((summary.json() as Summary).playerId).toBeNull();
        const movements = await api!.app.inject({
            url: `/api/worlds/${world.id}/movements`,
            headers: { cookie },
        });
        expect(movements.statusCode).toBe(403);
        expect(movements.json()).toEqual({ error: 'not_joined' });
    });
});

describe('Nur das Eigene steuern', () => {
    it('A kann B’s Dorf weder ansehen noch ausbauen', async () => {
        const { world, a, b } = await threePlayers();
        const before = world.getBuildingLevels(b.village);
        for (const [method, path, payload] of [
            ['GET', '', undefined],
            ['POST', '/build', { building: 'headquarters' }],
            ['POST', '/recruit', { unit: 'spear', count: 1 }],
            [
                'POST',
                '/send',
                {
                    target: a.village,
                    kind: 'attack',
                    units: { spear: 1 },
                },
            ],
            [
                'POST',
                '/ship',
                {
                    target: a.village,
                    resources: { wood: 1, clay: 0, iron: 0 },
                },
            ],
        ] as const) {
            const res = await api!.app.inject({
                method,
                url: `/api/worlds/${world.id}/villages/${b.village}${path}`,
                headers: { cookie: a.cookie },
                payload,
            });
            expect(res.statusCode, `${method} ${path}`).toBe(403);
            expect(res.json()).toEqual({ error: 'village_not_owned' });
        }
        expect(world.getBuildingLevels(b.village)).toEqual(before);

        // Das eigene Dorf geht.
        const own = await api!.app.inject({
            url: `/api/worlds/${world.id}/villages/${a.village}`,
            headers: { cookie: a.cookie },
        });
        expect(own.statusCode).toBe(200);
    });
});

describe('Berichte und Bewegungen je Spieler', () => {
    it('A greift B an: A und B haben je einen Bericht, C keinen', async () => {
        const { world, a, b, c } = await threePlayers();
        give(world, a.village, { axe: 50 });
        const sent = await api!.app.inject({
            method: 'POST',
            url: `/api/worlds/${world.id}/villages/${a.village}/send`,
            headers: { cookie: a.cookie },
            payload: {
                target: b.village,
                kind: 'attack',
                units: { axe: 50 },
            },
        });
        expect(sent.statusCode).toBe(200);

        // B sieht den Angriff kommen — ohne Truppenliste.
        const incoming = (
            await api!.app.inject({
                url: `/api/worlds/${world.id}/movements`,
                headers: { cookie: b.cookie },
            })
        ).json() as { incoming: { units: unknown }[] };
        expect(incoming.incoming).toHaveLength(1);
        expect(incoming.incoming[0]?.units).toBeNull();
        const cMoves = (
            await api!.app.inject({
                url: `/api/worlds/${world.id}/movements`,
                headers: { cookie: c.cookie },
            })
        ).json() as { incoming: unknown[]; outgoing: unknown[] };
        expect(cMoves.incoming).toHaveLength(0);
        expect(cMoves.outgoing).toHaveLength(0);

        advance(world, 3_600_000);
        expect(reportsOf(world, a.playerId)).toHaveLength(1);
        expect(reportsOf(world, b.playerId)).toHaveLength(1);
        const cReports = await api!.app.inject({
            url: `/api/worlds/${world.id}/reports`,
            headers: { cookie: c.cookie },
        });
        expect(cReports.json()).toEqual([]);
        const aReports = await api!.app.inject({
            url: `/api/worlds/${world.id}/reports`,
            headers: { cookie: a.cookie },
        });
        expect(aReports.json()).toHaveLength(1);
    });
});

describe('Live-Nachrichten nur an die Betroffenen', () => {
    it('A baut: nur A erfährt es; A greift B an: B erfährt es, C nicht', async () => {
        const { world, a, b, c } = await threePlayers();
        world.resume();
        await api!.app.ready();
        const listen = async (cookie: string) => {
            const ws = await api!.app.injectWS(
                `/api/worlds/${world.id}/ws`,
                {
                    headers: { cookie },
                },
            );
            const got: { type: string }[] = [];
            ws.on('message', (data: Buffer) =>
                got.push(JSON.parse(data.toString())),
            );
            return { ws, got };
        };
        const la = await listen(a.cookie);
        const lb = await listen(b.cookie);
        const lc = await listen(c.cookie);
        const settle = () => new Promise((r) => setTimeout(r, 50));

        world.sqlite
            .prepare(
                'UPDATE villages SET wood = 900, clay = 900, iron = 900 WHERE id = ?',
            )
            .run(a.village);
        await api!.app.inject({
            method: 'POST',
            url: `/api/worlds/${world.id}/villages/${a.village}/build`,
            headers: { cookie: a.cookie },
            payload: { building: 'timber_camp' },
        });
        await settle();
        expect(la.got.map((m) => m.type)).toContain('village_updated');
        expect(lb.got).toEqual([]);
        expect(lc.got).toEqual([]);

        give(world, a.village, { axe: 10 });
        await api!.app.inject({
            method: 'POST',
            url: `/api/worlds/${world.id}/villages/${a.village}/send`,
            headers: { cookie: a.cookie },
            payload: {
                target: b.village,
                kind: 'attack',
                units: { axe: 10 },
            },
        });
        await settle();
        expect(lb.got.map((m) => m.type)).toContain('movement');
        expect(lc.got).toEqual([]);

        for (const l of [la, lb, lc]) l.ws.terminate();
        world.pause();
    });
});
