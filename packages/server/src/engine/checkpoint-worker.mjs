/**
 * WAL-Checkpoints im eigenen Thread (plans/20-nacharbeiten/20-1).
 *
 * Eine eigene `better-sqlite3`-Verbindung je Welt-Datei. Im WAL-Modus darf
 * eine andere Verbindung als der Schreiber das WAL zurückschreiben, und
 * `PASSIVE` blockiert dabei weder Leser noch Schreiber — der Haupt-Thread
 * merkt davon nichts.
 *
 * Bewusst JavaScript statt TypeScript: Der Worker läuft auch dort, wo kein
 * TypeScript-Loader aktiv ist (Vitest, gebauter Server).
 */
import { createRequire } from 'node:module';
import { parentPort } from 'node:worker_threads';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

/** @type {Map<string, import('better-sqlite3').Database>} */
const connections = new Map();

function connection(file) {
    let db = connections.get(file);
    if (!db) {
        // `fileMustExist`: Eine inzwischen gelöschte Welt darf nicht als
        // leere Datei wiederauferstehen.
        db = new Database(file, { fileMustExist: true });
        connections.set(file, db);
    }
    return db;
}

function close(file) {
    connections.get(file)?.close();
    connections.delete(file);
}

parentPort?.on('message', (msg) => {
    const started = performance.now();
    try {
        if (msg.op === 'checkpoint') {
            const [result] = connection(msg.file).pragma(
                'wal_checkpoint(PASSIVE)',
            );
            parentPort?.postMessage({
                id: msg.id,
                ok: true,
                ms: performance.now() - started,
                result,
            });
        } else if (msg.op === 'close') {
            close(msg.file);
            parentPort?.postMessage({ id: msg.id, ok: true, ms: 0 });
        } else if (msg.op === 'closeAll') {
            for (const file of [...connections.keys()]) close(file);
            parentPort?.postMessage({ id: msg.id, ok: true, ms: 0 });
        }
    } catch (error) {
        close(msg.file);
        parentPort?.postMessage({
            id: msg.id,
            ok: false,
            ms: performance.now() - started,
            error: String(error),
        });
    }
});
