import { randomBytes } from 'node:crypto';
import type { Account } from '@medival/shared';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { parseRow } from '../db/parse.js';
import { GameError } from '../engine/errors.js';
import { hashPassword, verifyPassword } from './passwords.js';

/**
 * Accounts und Sessions (plans/19-prototyp/19-8-accounts-und-session.md).
 *
 * Beides liegt in der Meta-DB (`worlds.sqlite`), weil es für alle Welten gilt.
 * Eine Session ist eine Zeile mit zufälliger ID; im Browser liegt nur diese
 * ID, signiert, in einem `httpOnly`-Cookie. Anders als ein JWT lässt sich eine
 * solche Session widerrufen (Abmelden, Sperre), ohne eine Sperrliste zu
 * führen.
 */

export const ACCOUNTS_DDL = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('player', 'admin')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
`;

/** Sessions gelten 30 Tage und verlängern sich bei Benutzung. */
const SESSION_TTL_MS = 30 * 24 * 3_600_000;
/** Verlängert wird höchstens einmal am Tag — nicht bei jeder Anfrage. */
const RENEW_AFTER_MS = 24 * 3_600_000;

const AccountRowSchema = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    password_hash: z.string(),
    role: z.enum(['player', 'admin']),
});

const SessionRowSchema = AccountRowSchema.extend({
    expires_at: z.number().int(),
});

export class Accounts {
    constructor(
        private readonly db: Database.Database,
        /** Namen, die bei der Registrierung Admin werden (`MEDIVAL_ADMINS`). */
        private readonly adminNames: readonly string[] = [],
        private readonly now: () => number = Date.now,
    ) {
        db.exec(ACCOUNTS_DDL);
    }

    /**
     * Legt einen Account an. Admin wird der erste Account überhaupt und jeder
     * Name aus `MEDIVAL_ADMINS` — damit eine frische Installation ohne
     * Datenbankeingriff verwaltbar ist.
     */
    async register(name: string, password: string): Promise<Account> {
        const exists = this.db
            .prepare('SELECT id FROM accounts WHERE name = ?')
            .get(name);
        if (exists !== undefined) throw new GameError('name_taken');
        const first = this.db
            .prepare('SELECT id FROM accounts LIMIT 1')
            .get();
        const admin =
            first === undefined ||
            this.adminNames.some(
                (n) => n.toLowerCase() === name.toLowerCase(),
            );
        const hash = await hashPassword(password);
        try {
            const info = this.db
                .prepare(
                    'INSERT INTO accounts (name, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
                )
                .run(
                    name,
                    hash,
                    admin ? 'admin' : 'player',
                    this.now(),
                );
            return {
                id: Number(info.lastInsertRowid),
                name,
                role: admin ? 'admin' : 'player',
            };
        } catch {
            // Gleichzeitige Registrierung desselben Namens: UNIQUE greift.
            throw new GameError('name_taken');
        }
    }

    /** Prüft Name und Passwort; `null` bei falschen Angaben. */
    async verify(
        name: string,
        password: string,
    ): Promise<Account | null> {
        const raw = this.db
            .prepare(
                'SELECT id, name, password_hash, role FROM accounts WHERE name = ?',
            )
            .get(name);
        if (raw === undefined) {
            // Gleich lange rechnen wie bei einem echten Account — sonst
            // verrät die Antwortzeit, welche Namen es gibt.
            await verifyPassword(password, DUMMY_HASH);
            return null;
        }
        const row = parseRow(AccountRowSchema, raw, 'accounts row');
        return (await verifyPassword(password, row.password_hash))
            ? { id: row.id, name: row.name, role: row.role }
            : null;
    }

    createSession(accountId: number): string {
        const id = randomBytes(32).toString('base64url');
        this.db
            .prepare(
                'INSERT INTO sessions (id, account_id, expires_at) VALUES (?, ?, ?)',
            )
            .run(id, accountId, this.now() + SESSION_TTL_MS);
        return id;
    }

    /** Der Account einer gültigen Session — und die Session gleitet weiter. */
    resolveSession(id: string): Account | null {
        const raw = this.db
            .prepare(
                `SELECT a.id, a.name, a.password_hash, a.role, s.expires_at
                 FROM sessions s JOIN accounts a ON a.id = s.account_id
                 WHERE s.id = ?`,
            )
            .get(id);
        if (raw === undefined) return null;
        const row = parseRow(SessionRowSchema, raw, 'session row');
        const now = this.now();
        if (row.expires_at <= now) {
            this.revokeSession(id);
            return null;
        }
        if (row.expires_at - now < SESSION_TTL_MS - RENEW_AFTER_MS) {
            this.db
                .prepare(
                    'UPDATE sessions SET expires_at = ? WHERE id = ?',
                )
                .run(now + SESSION_TTL_MS, id);
        }
        return { id: row.id, name: row.name, role: row.role };
    }

    revokeSession(id: string): void {
        this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    }
}

/** Ein gültiger Hash ohne passendes Passwort — für gleichlange Fehlversuche. */
const DUMMY_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;
