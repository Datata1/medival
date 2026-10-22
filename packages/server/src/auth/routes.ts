import {
    LoginRequestSchema,
    type MeResponse,
    RegisterRequestSchema,
} from '@medival/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { parseInput } from '../db/parse.js';
import { GameError } from '../engine/errors.js';
import type { Accounts } from './accounts.js';
import { SESSION_COOKIE } from './plugin.js';

/** Fehlversuche je Name und Adresse, bevor gesperrt wird. */
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60_000;
const SESSION_MAX_AGE_S = 30 * 24 * 3_600;

/**
 * Minimaler Schutz gegen Durchprobieren (plans/19-prototyp/19-8): zehn
 * Fehlversuche je Name und Adresse in 15 Minuten, im Speicher gezählt. Für
 * den Prototyp genug; ein Neustart setzt die Zähler zurück.
 */
export class LoginThrottle {
    private readonly failures = new Map<
        string,
        { count: number; since: number }
    >();

    constructor(private readonly now: () => number = Date.now) {}

    check(key: string): void {
        const entry = this.failures.get(key);
        if (!entry) return;
        if (this.now() - entry.since > FAILURE_WINDOW_MS) {
            this.failures.delete(key);
            return;
        }
        if (entry.count >= MAX_FAILURES)
            throw new GameError('too_many_attempts');
    }

    fail(key: string): void {
        const entry = this.failures.get(key);
        if (!entry || this.now() - entry.since > FAILURE_WINDOW_MS)
            this.failures.set(key, { count: 1, since: this.now() });
        else entry.count++;
    }

    succeed(key: string): void {
        this.failures.delete(key);
    }
}

export interface AuthRouteOptions {
    devMode: boolean;
    /** Cookie nur über HTTPS senden (`MEDIVAL_SECURE_COOKIES=1`). */
    secureCookies: boolean;
}

export function registerAuthRoutes(
    app: FastifyInstance,
    accounts: Accounts,
    options: AuthRouteOptions,
    throttle = new LoginThrottle(),
): void {
    const startSession = (reply: FastifyReply, accountId: number) => {
        reply.setCookie(
            SESSION_COOKIE,
            accounts.createSession(accountId),
            {
                signed: true,
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: options.secureCookies,
                maxAge: SESSION_MAX_AGE_S,
            },
        );
    };

    app.post('/api/auth/register', async (req, reply) => {
        const body = parseInput(RegisterRequestSchema, req.body);
        const account = await accounts.register(
            body.name,
            body.password,
        );
        startSession(reply, account.id);
        return { account };
    });

    app.post('/api/auth/login', async (req, reply) => {
        const body = parseInput(LoginRequestSchema, req.body);
        const key = `${body.name.toLowerCase()}|${req.ip}`;
        throttle.check(key);
        const account = await accounts.verify(body.name, body.password);
        if (!account) {
            throttle.fail(key);
            throw new GameError('invalid_credentials');
        }
        throttle.succeed(key);
        startSession(reply, account.id);
        return { account };
    });

    app.post('/api/auth/logout', async (req, reply) => {
        const raw = req.cookies[SESSION_COOKIE];
        const unsigned = raw ? req.unsignCookie(raw) : null;
        if (unsigned?.valid && unsigned.value)
            accounts.revokeSession(unsigned.value);
        reply.clearCookie(SESSION_COOKIE, { path: '/' });
        return { ok: true };
    });

    app.get(
        '/api/me',
        (req): MeResponse => ({
            account: req.account,
            devMode: options.devMode,
        }),
    );
}
