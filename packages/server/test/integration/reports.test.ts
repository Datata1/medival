import type { ReportDetail, ReportList } from '@medival/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { reports } from '../../src/db/schema.js';
import type { World } from '../../src/engine/world.js';
import {
    createTestApp,
    loginAs,
    type TestApp,
} from '../harness/app.js';

/**
 * Berichte als eigene Seiten (plans/18-ux/18-4-berichte.md).
 *
 * Über die echte HTTP-App mit zwei Accounts. Die Berichte werden gesetzt,
 * nicht erkämpft: Geprüft wird hier das Blättern, Lesen und Löschen, der
 * Inhalt eines Kampfberichts hat eigene Tests (military, scouting).
 */

let api: TestApp | null = null;
afterEach(async () => {
    await api?.dispose();
    api = null;
});

interface Summary {
    playerId: number | null;
}

const place = (id: number) => ({
    id,
    name: `Dorf ${id}`,
    x: id,
    y: id,
});

function battle(world: World, playerId: number, type: string): number {
    const row = world.db
        .insert(reports)
        .values({
            playerId,
            createdGameTime: world.now(),
            type,
            payload: JSON.stringify({
                attackerVillage: place(1),
                defenderVillage: place(2),
                attackerWon: true,
                attacker: { spear: 10 },
                attackerLosses: { spear: 2 },
                defender: {},
                defenderLosses: {},
                wallBefore: 0,
                wallAfter: 0,
                loyaltyBefore: 100,
                loyaltyAfter: 100,
                luck: 5,
                loot: { wood: 1, clay: 2, iron: 3 },
                conquered: false,
            }),
        })
        .returning({ id: reports.id })
        .all()[0];
    if (!row) throw new Error('kein Bericht angelegt');
    return row.id;
}

function scout(world: World, playerId: number): number {
    const row = world.db
        .insert(reports)
        .values({
            playerId,
            createdGameTime: world.now(),
            type: 'scout',
            payload: JSON.stringify({
                attackerVillage: place(1),
                defenderVillage: place(2),
                sent: 3,
                lost: 0,
                tier: 1,
                defenderSpies: null,
                resources: { wood: 1, clay: 2, iron: 3 },
                units: null,
                buildings: null,
                unitsAway: null,
            }),
        })
        .returning({ id: reports.id })
        .all()[0];
    if (!row) throw new Error('kein Bericht angelegt');
    return row.id;
}

async function scenario() {
    api = await createTestApp();
    const app = api;
    const world = app.manager.createWorld(
        'Berichte',
        {
            speed: 100,
            mapSize: 100,
            botCount: 0,
            barbarianCount: 0,
            barbariansPerSettler: 0,
            barbarianAttemptsPerHour: 0,
            seed: 12,
        },
        { paused: true },
    );
    const join = async (name: string) => {
        const { cookie } = await loginAs(app, name);
        const res = await app.app.inject({
            method: 'POST',
            url: `/api/worlds/${world.id}/join`,
            headers: { cookie },
        });
        const summary = res.json() as Summary;
        if (summary.playerId === null) throw new Error('kein Spieler');
        return { cookie, playerId: summary.playerId };
    };
    const a = await join('Adalbert');
    const b = await join('Brunhild');

    const call = (
        cookie: string,
        method: 'GET' | 'POST' | 'DELETE',
        path: string,
        payload?: object,
    ) =>
        app.app.inject({
            method,
            url: `/api/worlds/${world.id}/reports${path}`,
            headers: { cookie },
            payload,
        });
    const list = async (cookie: string, query = '') => {
        const res = await call(cookie, 'GET', query);
        expect(res.statusCode, query).toBe(200);
        return res.json() as ReportList;
    };
    return { world, a, b, call, list };
}

describe('Berichtsliste', () => {
    it('blättert überlappungsfrei über mehr als eine Seite', async () => {
        const { world, a, list } = await scenario();
        const ids: number[] = [];
        for (let i = 0; i < 120; i++)
            ids.push(battle(world, a.playerId, 'attack'));

        const pages = [
            await list(a.cookie),
            await list(a.cookie, '?offset=50'),
            await list(a.cookie, '?offset=100'),
        ];

        // Vorher endete die Liste hart nach 50: Der 51. war fort.
        expect(pages.map((p) => p.reports.length)).toEqual([
            50, 50, 20,
        ]);
        expect(pages[0]?.total).toBe(120);
        expect(
            pages.flatMap((p) => p.reports.map((r) => r.id)),
        ).toEqual([...ids].reverse());
        expect(pages[2]?.newestId).toBe(ids.at(-1));
    });

    it('filtert nach Art und nach ungelesen', async () => {
        const { world, a, call, list } = await scenario();
        const attack = battle(world, a.playerId, 'attack');
        const defense = battle(world, a.playerId, 'defense');
        const spy = scout(world, a.playerId);
        await call(a.cookie, 'POST', `/${attack}/read`);

        const idsOf = async (filter: string) =>
            (await list(a.cookie, `?filter=${filter}`)).reports.map(
                (r) => r.id,
            );
        expect(await idsOf('attack')).toEqual([attack]);
        expect(await idsOf('defense')).toEqual([defense]);
        expect(await idsOf('scout')).toEqual([spy]);
        expect(await idsOf('unread')).toEqual([spy, defense]);

        // `unread` zählt über alle Berichte, nicht nur über den Filter.
        const filtered = await list(a.cookie, '?filter=attack');
        expect(filtered.total).toBe(1);
        expect(filtered.unread).toBe(2);
    });

    it('lehnt einen unbekannten Filter ab', async () => {
        const { a, call } = await scenario();
        const res = await call(a.cookie, 'GET', '?filter=quatsch');
        expect(res.statusCode).toBe(400);
    });
});

describe('Einzelner Bericht', () => {
    it('liefert den Bericht mit seinen Nachbarn', async () => {
        const { world, a, b, call } = await scenario();
        const first = battle(world, a.playerId, 'attack');
        battle(world, b.playerId, 'attack'); // fremd, kein Nachbar
        const second = battle(world, a.playerId, 'defense');
        const third = scout(world, a.playerId);

        const res = await call(a.cookie, 'GET', `/${second}`);
        expect(res.statusCode).toBe(200);
        const detail = res.json() as ReportDetail;
        expect(detail.report.id).toBe(second);
        expect(detail.report.type).toBe('defense');
        expect(detail.newerId).toBe(third);
        expect(detail.olderId).toBe(first);

        const newest = (
            await call(a.cookie, 'GET', `/${third}`)
        ).json() as ReportDetail;
        expect(newest.newerId).toBeNull();
    });

    it('weist einen fremden Bericht ab, ohne ihn zu verraten', async () => {
        const { world, a, b, call } = await scenario();
        const foreign = battle(world, b.playerId, 'attack');

        for (const [method, path] of [
            ['GET', `/${foreign}`],
            ['POST', `/${foreign}/read`],
        ] as const) {
            const res = await call(a.cookie, method, path);
            // Dieselbe Antwort wie bei einer ID, die es nicht gibt.
            expect(res.statusCode, `${method} ${path}`).toBe(404);
            expect(res.json()).toEqual({ error: 'report_not_found' });
        }
        const missing = await call(a.cookie, 'GET', '/999999');
        expect(missing.statusCode).toBe(404);
    });

    it('markiert nur den einen Bericht als gelesen', async () => {
        const { world, a, b, call, list } = await scenario();
        const one = battle(world, a.playerId, 'attack');
        const two = battle(world, a.playerId, 'attack');
        battle(world, b.playerId, 'attack');

        const res = await call(a.cookie, 'POST', `/${one}/read`);
        expect(res.statusCode).toBe(200);

        const mine = await list(a.cookie);
        expect(mine.reports.map((r) => [r.id, r.read])).toEqual([
            [two, false],
            [one, true],
        ]);
        expect(mine.unread).toBe(1);
        expect((await list(b.cookie)).unread).toBe(1);
    });
});

describe('Berichte löschen', () => {
    it('löscht idempotent', async () => {
        const { world, a, call, list } = await scenario();
        const id = battle(world, a.playerId, 'attack');

        const first = await call(a.cookie, 'DELETE', `/${id}`);
        const second = await call(a.cookie, 'DELETE', `/${id}`);

        expect(first.json()).toEqual({ deleted: true });
        expect(second.statusCode).toBe(200);
        expect(second.json()).toEqual({ deleted: false });
        expect((await list(a.cookie)).total).toBe(0);
    });

    it('löscht mehrere auf einmal, aber nur eigene', async () => {
        const { world, a, b, call, list } = await scenario();
        const mine = [
            battle(world, a.playerId, 'attack'),
            battle(world, a.playerId, 'attack'),
            battle(world, a.playerId, 'attack'),
        ];
        const foreign = battle(world, b.playerId, 'attack');

        const res = await call(a.cookie, 'POST', '/delete', {
            ids: [mine[0], mine[1], foreign],
        });

        expect(res.json()).toEqual({ deleted: 2 });
        expect((await list(a.cookie)).reports.map((r) => r.id)).toEqual(
            [mine[2]],
        );
        // Brunhilds Bericht steht noch.
        expect((await list(b.cookie)).total).toBe(1);
        const direct = await call(a.cookie, 'DELETE', `/${foreign}`);
        expect(direct.json()).toEqual({ deleted: false });
        expect((await list(b.cookie)).total).toBe(1);
    });
});
