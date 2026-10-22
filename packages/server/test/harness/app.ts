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

export async function createTestApp(): Promise<TestApp> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-api-'));
    const manager = new WorldManager(dir);
    const app = await buildApp(manager, {
        logger: false,
        serveClient: false,
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
