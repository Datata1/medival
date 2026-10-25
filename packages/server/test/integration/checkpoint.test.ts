import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { CheckpointThread } from '../../src/engine/checkpointThread.js';
import { WorldManager } from '../../src/engine/worldManager.js';
import { QUIET_SETTINGS } from '../harness/world.js';

/**
 * WAL-Checkpoint im eigenen Thread (plans/20-nacharbeiten/20-1).
 */

let dir = '';
let thread: CheckpointThread | null = null;
afterEach(() => {
    thread?.dispose();
    thread = null;
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
});

const size = (file: string) =>
    fs.existsSync(file) ? fs.statSync(file).size : 0;

describe('Checkpoint im Worker-Thread', () => {
    it('schreibt das WAL zurück, das WAL schrumpft, die Daten bleiben', async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-ckpt-'));
        let manager = new WorldManager(dir);
        const world = manager.createWorld('Ckpt', QUIET_SETTINGS, {
            founder: { name: 'Spieler' },
        });
        const file = world.sqlite.name;
        // Gut 20 MB ins WAL schreiben — mehr als `journal_size_limit`.
        world.sqlite.exec('CREATE TABLE ballast (b BLOB)');
        const insert = world.sqlite.prepare(
            'INSERT INTO ballast (b) VALUES (?)',
        );
        const blob = Buffer.alloc(4096, 7);
        for (let i = 0; i < 5_000; i++) insert.run(blob);
        expect(size(`${file}-wal`)).toBeGreaterThan(16 * 1024 * 1024);

        thread = new CheckpointThread();
        const reply = await thread.checkpoint(file);
        expect(reply?.ok).toBe(true);
        expect(reply?.result?.checkpointed).toBe(reply?.result?.log);
        // Der nächste Schreiber beginnt das WAL von vorn und kürzt es.
        world.sqlite
            .prepare('DELETE FROM ballast WHERE rowid = 1')
            .run();
        expect(size(`${file}-wal`)).toBeLessThanOrEqual(
            16 * 1024 * 1024,
        );
        await thread.close(file);

        const id = world.id;
        manager.shutdown();
        manager = new WorldManager(dir);
        const reopened = manager.getWorld(id);
        const rows = reopened?.sqlite
            .prepare('SELECT COUNT(*) AS n FROM ballast')
            .get() as { n: number } | undefined;
        expect(rows?.n).toBe(4_999);
        manager.shutdown();
    }, 60_000);

    it('legt eine gelöschte Welt nicht als leere Datei wieder an', async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-ckpt-'));
        const file = path.join(dir, 'weg.sqlite');
        new Database(file).close();
        fs.rmSync(file);

        thread = new CheckpointThread();
        const reply = await thread.checkpoint(file);
        expect(reply?.ok).toBe(false);
        expect(fs.existsSync(file)).toBe(false);
        expect(thread.available).toBe(true);
    });

    it('stößt für dieselbe Datei keinen zweiten Checkpoint an, solange einer läuft', async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-ckpt-'));
        const file = path.join(dir, 'w.sqlite');
        const db = new Database(file);
        db.pragma('journal_mode = WAL');
        db.exec('CREATE TABLE t (x)');
        thread = new CheckpointThread();
        const first = thread.checkpoint(file);
        expect(first).not.toBeNull();
        expect(thread.checkpoint(file)).toBeNull();
        expect((await first)?.ok).toBe(true);
        expect(thread.checkpoint(file)).not.toBeNull();
        db.close();
    });

    it('eine Welt lässt sich löschen, während der Thread sie offen hat', async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-ckpt-'));
        const manager = new WorldManager(dir);
        const world = manager.createWorld('Weg', QUIET_SETTINGS);
        const file = world.sqlite.name;
        thread = new CheckpointThread();
        await thread.checkpoint(file);
        expect(() => manager.deleteWorld(world.id)).not.toThrow();
        expect(fs.existsSync(file)).toBe(false);
        manager.shutdown();
    });
});

describe('Unter Dauerlast', () => {
    it('beginnt das WAL nach Worker und Rest im Haupt-Thread von vorn', async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-ckpt-'));
        const file = path.join(dir, 'last.sqlite');
        const db = new Database(file);
        db.pragma('journal_mode = WAL');
        db.pragma('wal_autocheckpoint = 0');
        db.pragma(`journal_size_limit = ${4 * 1024 * 1024}`);
        db.exec('CREATE TABLE t (b BLOB)');
        const insert = db.prepare('INSERT INTO t (b) VALUES (?)');
        const blob = Buffer.alloc(4096, 1);
        // Der Haupt-Thread schreibt weiter, während der Worker arbeitet.
        // Begrenzt (20 Seiten je 5 ms): Bei 200 Seiten je 1 ms holte der
        // Worker auf dem CI-Runner nie auf, und der Test lief in den Timeout.
        for (let i = 0; i < 2_000; i++) insert.run(blob);
        const writer = setInterval(() => {
            for (let i = 0; i < 20; i++) insert.run(blob);
        }, 5);
        thread = new CheckpointThread();
        let lastWorker:
            | { log: number; checkpointed: number }
            | undefined;
        for (let round = 0; round < 3; round++) {
            lastWorker = (await thread.checkpoint(file))?.result;
        }
        clearInterval(writer);
        expect(lastWorker).toBeDefined();
        // Den Rest, der während der Worker-Läufe dazukam, schreibt der
        // Haupt-Thread zurück — danach beginnt das WAL von vorn.
        const [tail] = db.pragma('wal_checkpoint(PASSIVE)') as {
            log: number;
            checkpointed: number;
        }[];
        expect(tail?.checkpointed).toBe(tail?.log);
        insert.run(blob);
        expect(size(`${file}-wal`)).toBeLessThanOrEqual(
            4 * 1024 * 1024,
        );
        db.close();
    }, 60_000);
});
