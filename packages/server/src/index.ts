import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { WorldManager } from './engine/worldManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR =
    process.env.MEDIVAL_DATA_DIR ??
    path.resolve(__dirname, '../../../data');
const PORT = Number(process.env.PORT ?? 3080);
const HOST = process.env.HOST ?? '0.0.0.0';

const manager = new WorldManager(DATA_DIR);
const app = await buildApp(manager);

const shutdown = () => {
    manager.shutdown();
    void app.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: PORT, host: HOST });
