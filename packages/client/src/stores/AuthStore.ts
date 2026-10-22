import type { Account } from '@medival/shared';
import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client.js';
import { apiErrorMessage } from '../lib/errors.js';

/**
 * Wer angemeldet ist (plans/19-prototyp/19-8-accounts-und-session.md).
 *
 * Die Session selbst liegt als `httpOnly`-Cookie im Browser und ist für
 * JavaScript unsichtbar — der Store kennt nur, was `GET /api/me` darüber
 * sagt. `loaded` unterscheidet „noch nicht gefragt" von „niemand angemeldet".
 */
export class AuthStore {
    account: Account | null = null;
    devMode = false;
    loaded = false;
    isSubmitting = false;
    error: string | null = null;

    private loading: Promise<void> | null = null;

    constructor() {
        makeAutoObservable<this, 'loading'>(this, { loading: false });
    }

    get isAdmin(): boolean {
        return this.account?.role === 'admin';
    }

    /** Einmal fragen, wer angemeldet ist; parallele Aufrufe teilen sich das. */
    ensureLoaded(): Promise<void> {
        if (this.loaded) return Promise.resolve();
        this.loading ??= this.refresh().finally(() => {
            this.loading = null;
        });
        return this.loading;
    }

    async refresh(): Promise<void> {
        try {
            const me = await api.me();
            runInAction(() => {
                this.account = me.account;
                this.devMode = me.devMode;
                this.loaded = true;
            });
        } catch {
            // Server nicht erreichbar: niemand angemeldet, aber geladen —
            // sonst hängt die Anmeldeseite in einer Ladeschleife.
            runInAction(() => {
                this.account = null;
                this.loaded = true;
            });
        }
    }

    /** Meldet an; liefert true bei Erfolg, sonst steht der Grund in `error`. */
    login(name: string, password: string): Promise<boolean> {
        return this.submit(() => api.login(name, password));
    }

    register(name: string, password: string): Promise<boolean> {
        return this.submit(() => api.register(name, password));
    }

    async logout(): Promise<void> {
        try {
            await api.logout();
        } finally {
            runInAction(() => {
                this.account = null;
            });
        }
    }

    clearError(): void {
        this.error = null;
    }

    private async submit(
        call: () => Promise<{ account: Account }>,
    ): Promise<boolean> {
        runInAction(() => {
            this.isSubmitting = true;
            this.error = null;
        });
        try {
            const { account } = await call();
            runInAction(() => {
                this.account = account;
                this.loaded = true;
            });
            return true;
        } catch (cause) {
            runInAction(() => {
                this.error = apiErrorMessage(cause);
            });
            return false;
        } finally {
            runInAction(() => {
                this.isSubmitting = false;
            });
        }
    }
}
