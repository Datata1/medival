import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from './api/routes.js';
import type { WorldManager } from './engine/worldManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AppOptions {
    /** Fastify-Logger; in Tests aus. */
    logger?: boolean;
    /** Gebautes Frontend ausliefern, falls vorhanden (Produktion/Docker). */
    serveClient?: boolean;
}

/**
 * Die HTTP-/WebSocket-App ohne Port (plans/19-prototyp/19-1).
 *
 * Getrennt von `index.ts`, damit Integrationstests dieselbe App über
 * `app.inject()` ansprechen können — ohne `listen()`, ohne freien Port und
 * ohne zweite, nachgebaute Routenliste.
 */
export async function buildApp(
    manager: WorldManager,
    options: AppOptions = {},
): Promise<FastifyInstance> {
    const app = Fastify({
        logger: options.logger === false ? false : { level: 'info' },
    });

    await app.register(cors, { origin: true });
    await app.register(websocket);

    const clientDist = path.resolve(__dirname, '../../client/dist');
    if (options.serveClient !== false && fs.existsSync(clientDist)) {
        await app.register(fastifyStatic, { root: clientDist });
        app.setNotFoundHandler((req, reply) => {
            if (req.raw.url?.startsWith('/api'))
                return reply
                    .status(404)
                    .send({ error: 'Nicht gefunden' });
            return reply.sendFile('index.html');
        });
    }

    registerRoutes(app, manager);
    return app;
}
