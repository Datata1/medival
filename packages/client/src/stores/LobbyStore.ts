import type { WorldListEntry, WorldSettings } from '@medival/shared';
import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client.js';
import { apiErrorMessage } from '../lib/errors.js';
import { AsyncValue } from './AsyncValue.js';

/** Weltenliste und das Anlegen bzw. Löschen von Spielständen. */
export class LobbyStore {
    readonly worlds = new AsyncValue<WorldListEntry[]>();
    isSubmitting = false;
    submitError: string | null = null;

    constructor() {
        makeAutoObservable(this);
    }

    get list(): WorldListEntry[] {
        return this.worlds.value ?? [];
    }

    async load(): Promise<void> {
        await this.worlds.load(() => api.listWorlds());
    }

    /**
     * Einer Welt beitreten (19-9); liefert true bei Erfolg. Danach gilt die
     * Welt in der Liste als `joined`.
     */
    async join(worldId: number): Promise<boolean> {
        runInAction(() => {
            this.isSubmitting = true;
            this.submitError = null;
        });
        try {
            await api.joinWorld(worldId);
            await this.load();
            return true;
        } catch (cause) {
            runInAction(() => {
                this.submitError = apiErrorMessage(cause);
            });
            return false;
        } finally {
            runInAction(() => {
                this.isSubmitting = false;
            });
        }
    }

    /** Legt eine Welt an und liefert ihre ID, oder null bei einem Fehler. */
    async createWorld(
        name: string,
        settings: Partial<WorldSettings>,
    ): Promise<number | null> {
        runInAction(() => {
            this.isSubmitting = true;
            this.submitError = null;
        });
        try {
            const world = await api.createWorld(name, settings);
            await this.load();
            return world.id;
        } catch (cause) {
            runInAction(() => {
                this.submitError = apiErrorMessage(cause);
            });
            return null;
        } finally {
            runInAction(() => {
                this.isSubmitting = false;
            });
        }
    }

    async deleteWorld(id: number): Promise<void> {
        try {
            await api.deleteWorld(id);
        } catch (cause) {
            runInAction(() => {
                this.submitError = apiErrorMessage(cause);
            });
        }
        await this.load();
    }
}
