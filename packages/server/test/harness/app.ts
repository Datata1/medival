import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { WorldManager } from '../../src/engine/worldManager.js';

/**
 * Die echte HTTP-App ohne Port (plans/19-prototyp/19-1). Anfragen gehen
 * über `app.inject(...)`; ab 19-8 kommt `loginAs` für Session-Cookies dazu.
 */
export interface TestApp {
    app: FastifyInstance;
    manager: WorldManager;
    dir: string;
    dispose(): Promise<void>;
}

export async function createTestApp(
    options: { devMode?: boolean } = {},
): Promise<TestApp> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-api-'));
    const manager = new WorldManager(dir);
    const app = await buildApp(manager, {
        logger: false,
        serveClient: false,
        devMode: options.devMode ?? false,
    });
    let disposed = false;
    return {
        app,
        manager,
        dir,
        async dispose() {
            if (disposed) return;
            disposed = true;
            await app.close();
            manager.shutdown();
            fs.rmSync(dir, { recursive: true, force: true });
        },
    };
}

/**
 * Registriert einen Account und liefert das Session-Cookie für `inject`
 * (plans/19-prototyp/19-8). Der erste Account einer App wird Admin.
 */
export async function loginAs(
    api: TestApp,
    name: string,
    password = 'geheim-genug',
): Promise<{ cookie: string; account: { id: number; role: string } }> {
    const res = await api.app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { name, password },
    });
    if (res.statusCode !== 200)
        throw new Error(
            `loginAs(${name}): ${res.statusCode} ${res.body}`,
        );
    const cookie = res.cookies.find(
        (c) => c.name === 'medival_session',
    );
    if (!cookie)
        throw new Error(`loginAs(${name}): kein Session-Cookie`);
    const { account } = res.json() as {
        account: { id: number; role: string };
    };
    return { cookie: `${cookie.name}=${cookie.value}`, account };
}
