import { randomBytes } from 'node:crypto';
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
import { z } from 'zod';
import { startBarbarianTicks } from '../ai/barbarian.js';
import { startBotTicks } from '../ai/bot.js';
import { Accounts } from '../auth/accounts.js';
import { META_DDL, WORLD_DDL } from '../db/ddl.js';
import { parseJsonColumn, parseRow } from '../db/parse.js';
import {
    TableColumnSchema,
    WorldMetaRowSchema,
} from '../db/rowSchemas.js';
import { EngineHealth } from './health.js';
import { type Founder, generateMap } from './mapgen.js';
import { type MetaPatch, World, type WorldMeta } from './world.js';

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
    // Plan 17: Stämme.
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS tribes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          tag TEXT NOT NULL,
          founder_id INTEGER NOT NULL,
          created_game_time INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS tribe_invitations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tribe_id INTEGER NOT NULL,
          player_id INTEGER NOT NULL,
          created_game_time INTEGER NOT NULL,
          expires_game_time INTEGER NOT NULL,
          UNIQUE(tribe_id, player_id)
        );
        CREATE INDEX IF NOT EXISTS idx_invitations_player ON tribe_invitations(player_id);
    `);
    const playerCols = sqlite
        .prepare(`PRAGMA table_info(players)`)
        .all()
        .map((row) =>
            parseRow(TableColumnSchema, row, 'PRAGMA table_info'),
        );
    if (!playerCols.some((c) => c.name === 'tribe_id')) {
        sqlite.exec('ALTER TABLE players ADD COLUMN tribe_id INTEGER');
    }

    // Plan 19-9: Spieler gehören zu Accounts; ein Account je Welt höchstens
    // einmal (mehrere NULL — Bots — erlaubt SQLite im UNIQUE-Index).
    if (!columnsOf(sqlite, 'players').includes('account_id')) {
        sqlite.exec(
            'ALTER TABLE players ADD COLUMN account_id INTEGER',
        );
    }
    sqlite.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_players_account ON players(account_id)',
    );

    // Plan 19-2: feste Reihenfolge bei Gleichstand, ganze Millisekunden.
    if (!columnsOf(sqlite, 'events').includes('priority')) {
        sqlite.exec(
            'ALTER TABLE events ADD COLUMN priority INTEGER NOT NULL DEFAULT 50',
        );
    }
    sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_events_order ON events(due_game_time, priority, id);
        UPDATE events SET due_game_time = CAST(ROUND(due_game_time) AS INTEGER)
          WHERE due_game_time != CAST(ROUND(due_game_time) AS INTEGER);
    `);

    // Plan 19-2: Rekrutierung faul abgerechnet. Aus „nächste Einheit fertig
    // um" wird „Produktion der offenen Einheiten begann um"; ein Auftrag,
    // dessen nächste Einheit um t fertig wird, begann also um t − perUnitMs.
    if (!columnsOf(sqlite, 'recruit_queue').includes('started_at')) {
        sqlite.exec(`
            ALTER TABLE recruit_queue ADD COLUMN started_at INTEGER;
            UPDATE recruit_queue SET
              per_unit_ms = MAX(1, CAST(ROUND(per_unit_ms) AS INTEGER)),
              started_at = CASE WHEN next_unit_done_at > 0
                THEN MAX(0, CAST(ROUND(next_unit_done_at - per_unit_ms) AS INTEGER))
                ELSE NULL END;
            ALTER TABLE recruit_queue DROP COLUMN next_unit_done_at;
        `);
    }
}

function loadSecret(dataDir: string): string {
    const file = path.join(dataDir, 'secret');
    if (fs.existsSync(file))
        return fs.readFileSync(file, 'utf8').trim();
    const secret = randomBytes(32).toString('base64url');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
}

const MembershipRowSchema = z.object({
    world_id: z.number().int(),
    player_id: z.number().int(),
});

function villageCount(sqlite: Database.Database): number {
    return sqlite.prepare('SELECT id FROM villages').all().length;
}

function columnsOf(sqlite: Database.Database, table: string): string[] {
    return sqlite
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map(
            (row) =>
                parseRow(TableColumnSchema, row, 'PRAGMA table_info')
                    .name,
        );
}

export class WorldManager {
    private readonly meta: Database.Database;
    /** Accounts und Sessions, weltübergreifend in der Meta-DB (19-8). */
    readonly accounts: Accounts;
    /**
     * Geheimnis zum Signieren der Session-Cookies: `MEDIVAL_SECRET`, sonst
     * einmalig erzeugt und in `<data>/secret` abgelegt — damit Sessions einen
     * Neustart überstehen.
     */
    readonly secret: string;
    private readonly worlds = new Map<number, World>();
    private readonly persistTimer: NodeJS.Timeout;
    readonly health = new EngineHealth();

    constructor(private readonly dataDir: string) {
        fs.mkdirSync(dataDir, { recursive: true });
        this.meta = new Database(path.join(dataDir, 'worlds.sqlite'));
        this.meta.pragma('journal_mode = WAL');
        this.meta.exec(META_DDL);
        this.accounts = new Accounts(
            this.meta,
            (process.env.MEDIVAL_ADMINS ?? '')
                .split(',')
                .map((n) => n.trim())
                .filter(Boolean),
        );
        this.secret = process.env.MEDIVAL_SECRET ?? loadSecret(dataDir);
        // Plan 19-3: Spielzeit an der Wanduhr.
        if (!columnsOf(this.meta, 'worlds').includes('epoch_zero_ms'))
            this.meta.exec(
                'ALTER TABLE worlds ADD COLUMN epoch_zero_ms INTEGER',
            );
        // Plan 19-6: Zähler der Ansiedlungen.
        if (!columnsOf(this.meta, 'worlds').includes('settled_count'))
            this.meta.exec(
                'ALTER TABLE worlds ADD COLUMN settled_count INTEGER',
            );
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
        Omit<WorldMeta, 'rngState' | 'epochZeroMs' | 'settledCount'> & {
            createdAt: number;
        }
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

    createWorld(
        name: string,
        settingsPartial: unknown,
        /**
         * Pausiert anlegen: Die Uhr läuft keine einzige Millisekunde. Für
         * Testwelten, die exakt bei Spielzeit 0 beginnen müssen — sonst
         * hängt ihr Startzustand davon ab, wie schnell die Maschine ist
         * (plans/19-prototyp/19-2).
         */
        options: { paused?: boolean; founder?: Founder } = {},
    ): World {
        const status = options.paused ? 'paused' : 'running';
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
                status,
                seed,
                Date.now(),
            );
        const id = Number(info.lastInsertRowid);

        const sqlite = new Database(this.worldPath(id));
        sqlite.pragma('journal_mode = WAL');
        sqlite.exec(WORLD_DDL);
        const db = drizzle(sqlite);
        const settledCount = generateMap(
            db,
            settings,
            createRng(seed),
            options.founder ?? null,
        );

        const world = new World(
            {
                id,
                name,
                seed,
                settings,
                status,
                gameTimeMs: 0,
                rngState: seed,
                epochZeroMs: null,
                settledCount,
            },
            sqlite,
            db,
            (patch) => this.persistMeta(id, patch),
        );
        startBarbarianTicks(world);
        startBotTicks(world);
        // Den Nullpunkt sofort festhalten — nicht erst im 15-s-Intervall.
        world.persist();
        // Ein Gründer mit Account spielt von Anfang an mit (Spieler 1).
        if (options.founder?.accountId != null)
            this.recordMembership(id, options.founder.accountId, 1);
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
                epochZeroMs: row.epoch_zero_ms ?? null,
                // Vor 19-6 gab es keinen Zähler: Die Dorfzahl ist dann die
                // beste Schätzung, wie weit der Kreis schon reicht.
                settledCount: row.settled_count ?? villageCount(sqlite),
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

    /**
     * In welchen Welten ein Account mitspielt: Welt-ID → Spieler-ID (19-9).
     * Steht in der Meta-DB, damit die Lobby nicht jede Welt laden muss, nur
     * um das zu wissen. Maßgeblich bleibt `players.account_id` in der Welt.
     */
    membershipsOf(accountId: number): Map<number, number> {
        return new Map(
            this.meta
                .prepare(
                    'SELECT world_id, player_id FROM memberships WHERE account_id = ?',
                )
                .all(accountId)
                .map((row) => {
                    const r = parseRow(
                        MembershipRowSchema,
                        row,
                        'membership',
                    );
                    return [r.world_id, r.player_id] as const;
                }),
        );
    }

    recordMembership(
        worldId: number,
        accountId: number,
        playerId: number,
    ): void {
        this.meta
            .prepare(
                'INSERT OR REPLACE INTO memberships (world_id, account_id, player_id) VALUES (?, ?, ?)',
            )
            .run(worldId, accountId, playerId);
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
        this.meta
            .prepare('DELETE FROM memberships WHERE world_id = ?')
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

    private persistMeta(id: number, patch: MetaPatch): void {
        const sets: string[] = [];
        const args: unknown[] = [];
        if (patch.settledCount !== undefined) {
            sets.push('settled_count = ?');
            args.push(patch.settledCount);
        }
        if (patch.epochZeroMs != null) {
            sets.push('epoch_zero_ms = ?');
            args.push(Math.round(patch.epochZeroMs));
        }
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
