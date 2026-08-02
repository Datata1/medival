import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { registerRoutes } from './api/routes.js';
import { WorldManager } from './engine/worldManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR =
    process.env.MEDIVAL_DATA_DIR ??
    path.resolve(__dirname, '../../../data');
const PORT = Number(process.env.PORT ?? 3080);
const HOST = process.env.HOST ?? '0.0.0.0';

const manager = new WorldManager(DATA_DIR);
const app = Fastify({ logger: { level: 'info' } });

await app.register(cors, { origin: true });
await app.register(websocket);

// Serve the built client if present (production / Docker image).
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
    await app.register(fastifyStatic, { root: clientDist });
    app.setNotFoundHandler((req, reply) => {
        if (req.raw.url?.startsWith('/api'))
            return reply.status(404).send({ error: 'Nicht gefunden' });
        return reply.sendFile('index.html');
    });
}

registerRoutes(app, manager);

const shutdown = () => {
    manager.shutdown();
    void app.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: PORT, host: HOST });
