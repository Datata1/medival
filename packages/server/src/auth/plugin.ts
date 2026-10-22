import cookie from '@fastify/cookie';
import type { Account } from '@medival/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { GameError } from '../engine/errors.js';
import type { Accounts } from './accounts.js';

/** Name des Session-Cookies (signiert, `httpOnly`). */
export const SESSION_COOKIE = 'medival_session';

declare module 'fastify' {
    interface FastifyRequest {
        /** Der angemeldete Account, aufgelöst aus dem Session-Cookie. */
        account: Account | null;
    }
}

/**
 * Cookie-Unterstützung und `req.account` für jede Anfrage
 * (plans/19-prototyp/19-8). Auch der WebSocket-Aufbau ist eine Anfrage und
 * bekommt den Account so mit.
 */
export async function registerAuth(
    app: FastifyInstance,
    accounts: Accounts,
    secret: string,
): Promise<void> {
    await app.register(cookie, { secret });
    app.decorateRequest('account', null);
    app.addHook('onRequest', async (req) => {
        const raw = req.cookies[SESSION_COOKIE];
        if (!raw) return;
        const unsigned = req.unsignCookie(raw);
        if (!unsigned.valid || !unsigned.value) return;
        req.account = accounts.resolveSession(unsigned.value);
    });
}

/** Der angemeldete Account — sonst `not_authenticated` (401). */
export function requireAccount(req: FastifyRequest): Account {
    if (!req.account) throw new GameError('not_authenticated');
    return req.account;
}

/** Nur Admins — sonst `forbidden` (403). */
export function requireAdmin(req: FastifyRequest): Account {
    const account = requireAccount(req);
    if (account.role !== 'admin') throw new GameError('forbidden');
    return account;
}
