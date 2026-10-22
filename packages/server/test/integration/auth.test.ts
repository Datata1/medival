import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { Accounts } from '../../src/auth/accounts.js';
import { verifyPassword } from '../../src/auth/passwords.js';
import { WorldManager } from '../../src/engine/worldManager.js';
import {
    createTestApp,
    loginAs,
    type TestApp,
} from '../harness/app.js';
import { QUIET_SETTINGS } from '../harness/world.js';

/**
 * Accounts & Session (plans/19-prototyp/19-8-accounts-und-session.md).
 */

let api: TestApp | null = null;
afterEach(async () => {
    await api?.dispose();
    api = null;
});

const me = async (cookie?: string) =>
    (
        await api!.app.inject({
            url: '/api/me',
            headers: cookie ? { cookie } : {},
        })
    ).json() as { account: { name: string; role: string } | null };

describe('Registrieren, Anmelden, Abmelden', () => {
    it('kennt den Account über das Session-Cookie — und nach dem Abmelden nicht mehr', async () => {
        api = await createTestApp();
        const { cookie } = await loginAs(api, 'Ragna');
        expect((await me(cookie)).account?.name).toBe('Ragna');
        expect((await me()).account).toBeNull();

        await api.app.inject({
            method: 'POST',
            url: '/api/auth/logout',
            headers: { cookie },
        });
        expect((await me(cookie)).account).toBeNull();
    });

    it('meldet mit Name und Passwort an', async () => {
        api = await createTestApp();
        await loginAs(api, 'Ragna', 'richtig-geheim');
        const ok = await api.app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { name: 'ragna', password: 'richtig-geheim' },
        });
        expect(ok.statusCode).toBe(200);
        expect(
            ok.cookies.some((c) => c.name === 'medival_session'),
        ).toBe(true);
        for (const payload of [
            { name: 'Ragna', password: 'falsch-falsch' },
            { name: 'Niemand', password: 'richtig-geheim' },
        ]) {
            const bad = await api.app.inject({
                method: 'POST',
                url: '/api/auth/login',
                payload,
            });
            // Kein Unterschied zwischen falschem Passwort und unbekanntem Namen.
            expect(bad.statusCode).toBe(401);
            expect(bad.json()).toEqual({
                error: 'invalid_credentials',
            });
        }
    });

    it('vergibt einen Namen nur einmal, auch in anderer Schreibweise', async () => {
        api = await createTestApp();
        await loginAs(api, 'Ragna');
        const again = await api.app.inject({
            method: 'POST',
            url: '/api/auth/register',
            payload: { name: 'RAGNA', password: 'anderes-passwort' },
        });
        expect(again.statusCode).toBe(409);
        expect(again.json()).toEqual({ error: 'name_taken' });
    });

    it('lehnt zu kurze Passwörter und ungültige Namen ab', async () => {
        api = await createTestApp();
        for (const payload of [
            { name: 'Ragna', password: 'kurz' },
            { name: 'ab', password: 'lang-genug-1' },
            { name: '<script>', password: 'lang-genug-1' },
        ]) {
            const res = await api.app.inject({
                method: 'POST',
                url: '/api/auth/register',
                payload,
            });
            expect(res.statusCode, JSON.stringify(payload)).toBe(400);
        }
    });

    it('speichert nie das Passwort selbst', async () => {
        api = await createTestApp();
        await loginAs(api, 'Ragna', 'mein-klartext');
        const meta = new Database(path.join(api.dir, 'worlds.sqlite'), {
            readonly: true,
        });
        const row = meta
            .prepare('SELECT password_hash AS h FROM accounts')
            .get() as { h: string };
        meta.close();
        expect(row.h).not.toContain('mein-klartext');
        expect(row.h.startsWith('scrypt$')).toBe(true);
        expect(await verifyPassword('mein-klartext', row.h)).toBe(true);
        expect(await verifyPassword('anderes', row.h)).toBe(false);
    });
});

describe('Rollen', () => {
    it('der erste Account ist Admin, alle weiteren Spieler', async () => {
        api = await createTestApp();
        const first = await loginAs(api, 'Erste');
        const second = await loginAs(api, 'Zweite');
        expect(first.account.role).toBe('admin');
        expect(second.account.role).toBe('player');

        const world = api.manager.createWorld(
            'Verwaltet',
            QUIET_SETTINGS,
        );
        const create = (cookie?: string) =>
            api!.app.inject({
                method: 'POST',
                url: '/api/worlds',
                headers: cookie ? { cookie } : {},
                payload: { settings: QUIET_SETTINGS },
            });
        expect((await create()).statusCode).toBe(401);
        expect((await create(second.cookie)).statusCode).toBe(403);
        expect((await create(first.cookie)).statusCode).toBe(200);

        const remove = (cookie: string) =>
            api!.app.inject({
                method: 'DELETE',
                url: `/api/worlds/${world.id}`,
                headers: { cookie },
            });
        expect((await remove(second.cookie)).statusCode).toBe(403);
        expect((await remove(first.cookie)).statusCode).toBe(200);
    });

    it('macht Namen aus MEDIVAL_ADMINS zu Admins', async () => {
        const db = new Database(':memory:');
        const accounts = new Accounts(db, ['Wächterin']);
        await accounts.register('Erste', 'lang-genug-1');
        const named = await accounts.register(
            'wächterin',
            'lang-genug-1',
        );
        const other = await accounts.register('Dritte', 'lang-genug-1');
        expect(named.role).toBe('admin');
        expect(other.role).toBe('player');
        db.close();
    });
});

describe('Sessions', () => {
    it('laufen nach 30 Tagen ohne Benutzung ab und gleiten bei Benutzung weiter', async () => {
        let now = 1_800_000_000_000;
        const day = 24 * 3_600_000;
        const db = new Database(':memory:');
        const accounts = new Accounts(db, [], () => now);
        const { id } = await accounts.register('Ragna', 'lang-genug-1');
        const session = accounts.createSession(id);

        now += 20 * day;
        expect(accounts.resolveSession(session)?.name).toBe('Ragna');
        // Durch die Benutzung verlängert: 20 weitere Tage sind kein Problem.
        now += 20 * day;
        expect(accounts.resolveSession(session)?.name).toBe('Ragna');
        // 31 Tage ohne Benutzung: abgelaufen.
        now += 31 * day;
        expect(accounts.resolveSession(session)).toBeNull();
        db.close();
    });

    it('überstehen einen Neustart (Geheimnis bleibt in data/secret)', async () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'medival-auth-'),
        );
        try {
            let manager = new WorldManager(dir);
            let app = await buildApp(manager, {
                logger: false,
                serveClient: false,
            });
            const res = await app.inject({
                method: 'POST',
                url: '/api/auth/register',
                payload: { name: 'Ragna', password: 'lang-genug-1' },
            });
            const cookie = res.cookies.find(
                (c) => c.name === 'medival_session',
            );
            await app.close();
            manager.shutdown();

            manager = new WorldManager(dir);
            app = await buildApp(manager, {
                logger: false,
                serveClient: false,
            });
            const after = await app.inject({
                url: '/api/me',
                headers: { cookie: `${cookie?.name}=${cookie?.value}` },
            });
            expect(
                (after.json() as { account: { name: string } | null })
                    .account?.name,
            ).toBe('Ragna');
            await app.close();
            manager.shutdown();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('verwirft ein verfälschtes Cookie', async () => {
        api = await createTestApp();
        const { cookie } = await loginAs(api, 'Ragna');
        const forged = `${cookie.slice(0, -3)}abc`;
        expect((await me(forged)).account).toBeNull();
    });
});

describe('Drosselung', () => {
    it('sperrt nach zehn Fehlversuchen in 15 Minuten', async () => {
        api = await createTestApp();
        await loginAs(api, 'Ragna', 'richtig-geheim');
        const attempt = () =>
            api!.app.inject({
                method: 'POST',
                url: '/api/auth/login',
                payload: { name: 'Ragna', password: 'falsch-geraten' },
            });
        for (let i = 0; i < 10; i++)
            expect((await attempt()).statusCode).toBe(401);
        const blocked = await attempt();
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json()).toEqual({ error: 'too_many_attempts' });
    });
});

describe('WebSocket', () => {
    it('schließt eine Verbindung ohne Session mit 4401', async () => {
        api = await createTestApp();
        const world = api.manager.createWorld('Live', QUIET_SETTINGS);
        await api.app.ready();
        const ws = await api.app.injectWS(`/api/worlds/${world.id}/ws`);
        const code = await new Promise<number>((resolve) =>
            ws.on('close', (c: number) => resolve(c)),
        );
        expect(code).toBe(4401);
    });

    it('nimmt eine Verbindung mit Session an', async () => {
        api = await createTestApp();
        const { cookie } = await loginAs(api, 'Ragna');
        const world = api.manager.createWorld('Live', QUIET_SETTINGS);
        await api.app.ready();
        const ws = await api.app.injectWS(
            `/api/worlds/${world.id}/ws`,
            {
                headers: { cookie },
            },
        );
        expect(ws.readyState).toBe(ws.OPEN);
        ws.terminate();
    });
});
