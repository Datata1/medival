import fs from 'node:fs';
import path from 'node:path';
import {
    createRng,
    DEFAULT_WORLD_SETTINGS,
    WorldSettingsPatchSchema,
    WorldSettingsSchema,
} from '@medival/shared';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { startBarbarianTicks } from '../ai/barbarian.js';
import { startBotTicks } from '../ai/bot.js';
import { META_DDL, WORLD_DDL } from '../db/ddl.js';
import { parseJsonColumn, parseRow } from '../db/parse.js';
import {
    TableColumnSchema,
    WorldMetaRowSchema,
} from '../db/rowSchemas.js';
import { EngineHealth } from './health.js';
import { generateMap } from './mapgen.js';
import { World, type WorldMeta } from './world.js';

/** Additive migrations for world DBs created by older versions. */
function migrateWorldDb(sqlite: Database.Database): void {
    const cols = sqlite
        .prepare(`PRAGMA table_info(villages)`)
        .all()
        .map((row) =>
            parseRow(TableColumnSchema, row, 'PRAGMA table_info'),
        );
    if (!cols.some((c) => c.name === 'loyalty_updated_at')) {
        sqlite.exec(
            'ALTER TABLE villages ADD COLUMN loyalty_updated_at INTEGER NOT NULL DEFAULT 0',
        );
    }
    // Plan 16: Ansehen. `IF NOT EXISTS` macht den Aufruf idempotent, und ein
    // leerer Bestand bedeutet schlicht „alle neutral" — der richtige
    // Ausgangspunkt für eine Welt, die bisher keine Beziehungen kannte.
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS relations (
          player_id INTEGER NOT NULL,
          other_player_id INTEGER NOT NULL,
          standing REAL NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL DEFAULT 0,
          UNIQUE(player_id, other_player_id)
        );
        CREATE INDEX IF NOT EXISTS idx_relations_player ON relations(player_id);
    `);
}

export class WorldManager {
    private readonly meta: Database.Database;
    private readonly worlds = new Map<number, World>();
    private readonly persistTimer: NodeJS.Timeout;
    readonly health = new EngineHealth();

    constructor(private readonly dataDir: string) {
        fs.mkdirSync(dataDir, { recursive: true });
        this.meta = new Database(path.join(dataDir, 'worlds.sqlite'));
        this.meta.pragma('journal_mode = WAL');
        this.meta.exec(META_DDL);
        this.persistTimer = setInterval(() => {
            for (const w of this.worlds.values())
                if (w.clock.running) w.persist();
            this.health.check(this.worlds.values());
        }, 15_000);
        this.persistTimer.unref();
    }

    loadedWorlds(): Iterable<World> {
        return this.worlds.values();
    }

    listWorlds(): Array<
        Omit<WorldMeta, 'rngState'> & { createdAt: number }
    > {
        const rows = this.meta
            .prepare('SELECT * FROM worlds ORDER BY id DESC')
            .all()
            .map((row) =>
                parseRow(WorldMetaRowSchema, row, 'worlds row'),
            );
        return rows.map((r) => {
            const loaded = this.worlds.get(r.id);
            return {
                id: r.id,
                name: r.name,
                seed: r.seed,
                settings: parseJsonColumn(
                    WorldSettingsSchema,
                    r.settings_json,
                    'world.settings',
                ),
                status: loaded ? loaded.status : r.status,
                gameTimeMs: loaded ? loaded.now() : r.game_time_ms,
                createdAt: r.created_at,
            };
        });
    }

    createWorld(name: string, settingsPartial: unknown): World {
        // Die Grenze liegt hier, nicht erst in der HTTP-Route: Der Manager ist
        // die öffentliche Schnittstelle zum Anlegen einer Welt und prüft die
        // gemergten Einstellungen als Ganzes — Feldgrenzen und Invarianten
        // (plans/08-no-typecasting.md).
        const patch = WorldSettingsPatchSchema.parse(
            settingsPartial ?? {},
        );
        const seed =
            patch.seed && patch.seed !== 0
                ? patch.seed
                : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
        const settings = WorldSettingsSchema.parse({
            ...DEFAULT_WORLD_SETTINGS,
            ...patch,
            seed,
        });

        const info = this.meta
            .prepare(
                'INSERT INTO worlds (name, seed, settings_json, status, game_time_ms, rng_state, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
            )
            .run(
                name,
                seed,
                JSON.stringify(settings),
                'running',
                seed,
                Date.now(),
            );
        const id = Number(info.lastInsertRowid);

        const sqlite = new Database(this.worldPath(id));
        sqlite.pragma('journal_mode = WAL');
        sqlite.exec(WORLD_DDL);
        const db = drizzle(sqlite);
        generateMap(db, settings, createRng(seed));

        const world = new World(
            {
                id,
                name,
                seed,
                settings,
                status: 'running',
                gameTimeMs: 0,
                rngState: seed,
            },
            sqlite,
            db,
            (patch) => this.persistMeta(id, patch),
        );
        startBarbarianTicks(world);
        startBotTicks(world);
        this.worlds.set(id, world);
        return world;
    }

    getWorld(id: number): World | undefined {
        const loaded = this.worlds.get(id);
        if (loaded) return loaded;
        const rawRow = this.meta
            .prepare('SELECT * FROM worlds WHERE id = ?')
            .get(id);
        if (rawRow === undefined || !fs.existsSync(this.worldPath(id)))
            return undefined;
        const row = parseRow(WorldMetaRowSchema, rawRow, 'worlds row');

        const sqlite = new Database(this.worldPath(id));
        sqlite.pragma('journal_mode = WAL');
        migrateWorldDb(sqlite);
        const db = drizzle(sqlite);
        const world = new World(
            {
                id: row.id,
                name: row.name,
                seed: row.seed,
                settings: parseJsonColumn(
                    WorldSettingsSchema,
                    row.settings_json,
                    'world.settings',
                ),
                status: row.status,
                gameTimeMs: row.game_time_ms,
                rngState: row.rng_state,
            },
            sqlite,
            db,
            (patch) => this.persistMeta(id, patch),
        );
        // Idempotent: rüstet Welten nach, die vor Plan 14 entstanden sind, und
        // tut bei laufenden Ketten nichts.
        startBarbarianTicks(world);
        startBotTicks(world);
        this.worlds.set(id, world);
        return world;
    }

    deleteWorld(id: number): boolean {
        const loaded = this.worlds.get(id);
        if (loaded) {
            loaded.close();
            this.worlds.delete(id);
        }
        const res = this.meta
            .prepare('DELETE FROM worlds WHERE id = ?')
            .run(id);
        for (const suffix of ['', '-wal', '-shm']) {
            fs.rmSync(this.worldPath(id) + suffix, { force: true });
        }
        return res.changes > 0;
    }

    shutdown(): void {
        clearInterval(this.persistTimer);
        for (const w of this.worlds.values()) w.close();
        this.worlds.clear();
        this.meta.close();
    }

    private worldPath(id: number): string {
        return path.join(this.dataDir, `world_${id}.sqlite`);
    }

    private persistMeta(
        id: number,
        patch: Partial<
            Pick<WorldMeta, 'status' | 'gameTimeMs' | 'rngState'>
        >,
    ): void {
        const sets: string[] = [];
        const args: unknown[] = [];
        if (patch.status !== undefined) {
            sets.push('status = ?');
            args.push(patch.status);
        }
        if (patch.gameTimeMs !== undefined) {
            sets.push('game_time_ms = ?');
            args.push(patch.gameTimeMs);
        }
        if (patch.rngState !== undefined) {
            sets.push('rng_state = ?');
            args.push(patch.rngState);
        }
        if (sets.length === 0) return;
        this.meta
            .prepare(
                `UPDATE worlds SET ${sets.join(', ')} WHERE id = ?`,
            )
            .run(...args, id);
    }
}
