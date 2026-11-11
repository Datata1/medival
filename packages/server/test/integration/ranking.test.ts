import type { PlayerProfile, RankingResponse } from '@medival/shared';
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
 * Rangliste (plans/18-ux/18-5-rangliste-profil-einstellungen.md).
 *
 * Über die echte HTTP-App: Drei Accounts treten bei, dazu ein Bot ohne Dorf
 * und ein Barbarendorf, die beide nicht in die Liste gehören.
 */

let api: TestApp | null = null;
afterEach(async () => {
    await api?.dispose();
    api = null;
});

interface Summary {
    playerId: number | null;
    playerVillages: { id: number }[];
}

async function scenario() {
    api = await createTestApp();
    const app = api;
    const world = app.manager.createWorld(
        'Rangliste',
        {
            speed: 100,
            mapSize: 100,
            botCount: 0,
            barbarianCount: 0,
            barbariansPerSettler: 0,
            barbarianAttemptsPerHour: 0,
            seed: 11,
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
        expect(res.statusCode, `${name} tritt bei`).toBe(200);
        const summary = res.json() as Summary;
        if (summary.playerId === null) throw new Error('kein Spieler');
        return { cookie, playerId: summary.playerId };
    };
    const a = await join('Adalbert');
    const b = await join('Brunhild');
    const c = await join('Clothilde');

    // Adalbert führt mit einem zweiten Dorf; Brunhild und Clothilde haben
    // je ihr Startdorf und damit gleich viele Punkte.
    givenVillage(world, a.playerId, {
        x: 10,
        y: 10,
        levels: { headquarters: 10 },
        units: { spear: 7, sword: 3 },
    });
    // Gehören beide nicht in die Liste:
    givenVillage(world, null, { x: 12, y: 12, levels: { wall: 5 } });
    const idle = givenPlayer(world, { bot: true, name: 'Ohne Dorf' });

    const get = async <T>(cookie: string, path: string) => {
        const res = await app.app.inject({
            method: 'GET',
            url: `/api/worlds/${world.id}${path}`,
            headers: { cookie },
        });
        expect(res.statusCode, path).toBe(200);
        return res.json() as T;
    };
    return { world, a, b, c, idle, get };
}

describe('Rangliste', () => {
    it('lässt Barbaren und Spieler ohne Dorf weg', async () => {
        const { a, b, c, idle, get } = await scenario();
        const list = await get<RankingResponse>(a.cookie, '/ranking');

        expect(list.players.map((p) => p.id).sort()).toEqual(
            [a.playerId, b.playerId, c.playerId].sort(),
        );
        expect(list.totalPlayers).toBe(3);
        expect(list.players.some((p) => p.id === idle)).toBe(false);
    });

    it('gibt Gleichstand denselben Rang in stabiler Reihenfolge', async () => {
        const { a, b, c, get } = await scenario();
        const first = await get<RankingResponse>(a.cookie, '/ranking');
        const second = await get<RankingResponse>(a.cookie, '/ranking');

        // 1, 2, 2 — nach dem Gleichstand bliebe Platz 3 frei.
        expect(first.players.map((p) => [p.id, p.rank])).toEqual([
            [a.playerId, 1],
            [b.playerId, 2],
            [c.playerId, 2],
        ]);
        expect(first.players[1]?.points).toBe(first.players[2]?.points);
        expect(second.players).toEqual(first.players);
    });

    it('nennt denselben Rang wie das Profil', async () => {
        const { a, b, c, get } = await scenario();
        const list = await get<RankingResponse>(a.cookie, '/ranking');

        for (const who of [a, b, c]) {
            const profile = await get<PlayerProfile>(
                a.cookie,
                `/players/${who.playerId}`,
            );
            const row = list.players.find((p) => p.id === who.playerId);
            expect(profile.rank, profile.name).toBe(row?.rank);
            expect(profile.totalPoints).toBe(row?.points);
            expect(profile.villageCount).toBe(row?.villageCount);
        }
    });

    it('liefert die eigene Zeile auch außerhalb des Ausschnitts', async () => {
        const { c, get } = await scenario();
        const page = await get<RankingResponse>(
            c.cookie,
            '/ranking?offset=0&limit=1',
        );

        expect(page.players).toHaveLength(1);
        expect(page.own?.id).toBe(c.playerId);
        expect(page.own?.rank).toBe(2);
    });

    it('blättert überlappungsfrei', async () => {
        const { a, get } = await scenario();
        const all = await get<RankingResponse>(a.cookie, '/ranking');
        const pages = [
            await get<RankingResponse>(
                a.cookie,
                '/ranking?offset=0&limit=2',
            ),
            await get<RankingResponse>(
                a.cookie,
                '/ranking?offset=2&limit=2',
            ),
        ];

        expect(pages.flatMap((p) => p.players)).toEqual(all.players);
        expect(pages[1]?.totalPlayers).toBe(3);
    });

    it('summiert Stammespunkte aus den Mitgliedern', async () => {
        const { world, a, b, c, get } = await scenario();
        givenTribe(
            world,
            b.playerId,
            [c.playerId],
            'Die Zweiten',
            'ZWO',
        );
        givenTribe(world, a.playerId, [], 'Der Erste', 'EINS');
        const list = await get<RankingResponse>(a.cookie, '/ranking');

        const points = new Map(
            list.players.map((p) => [p.id, p.points]),
        );
        const zwo = list.tribes.find((t) => t.tag === 'ZWO');
        expect(zwo?.members).toBe(2);
        expect(zwo?.points).toBe(
            (points.get(b.playerId) ?? 0) +
                (points.get(c.playerId) ?? 0),
        );
        expect(zwo?.pointsPerMember).toBe(
            Math.round((zwo?.points ?? 0) / 2),
        );
        // Absteigend nach Punkten, Ränge ohne Lücke am Anfang.
        expect(list.tribes.map((t) => t.points)).toEqual(
            [...list.tribes.map((t) => t.points)].sort((x, y) => y - x),
        );
        expect(list.tribes[0]?.rank).toBe(1);
        expect(
            list.players.find((p) => p.id === c.playerId)?.tribeTag,
        ).toBe('ZWO');
    });
});

describe('Profil', () => {
    it('zeigt Truppen und Bauernhof nur im eigenen Profil', async () => {
        const { a, b, get } = await scenario();

        const own = await get<PlayerProfile>(
            a.cookie,
            `/players/${a.playerId}`,
        );
        const second = own.villages.find((v) => v.x === 10);
        expect(second?.troops).toBe(10);
        expect(second?.popMax).toBeGreaterThan(0);
        expect(second?.popUsed).toBeGreaterThan(0);
        expect(own.standing).toBeNull();

        const foreign = await get<PlayerProfile>(
            b.cookie,
            `/players/${a.playerId}`,
        );
        expect(foreign.villages).toHaveLength(2);
        for (const village of foreign.villages) {
            expect(village.troops).toBeNull();
            expect(village.popUsed).toBeNull();
            expect(village.popMax).toBeNull();
        }
    });
});
