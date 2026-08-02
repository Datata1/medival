import type { DiplomacyView } from '@medival/shared';
import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client.js';
import { apiErrorMessage } from '../lib/errors.js';
import { AsyncValue } from './AsyncValue.js';

/**
 * Stämme, Haltungen und Einladungen (siehe plans/17-staemme-und-krieg.md).
 *
 * Der Store besitzt die Daten, React zeigt sie nur an (Plan 09).
 */
export class TribeStore {
    readonly diplomacy = new AsyncValue<DiplomacyView>();
    worldId: number | null = null;
    isSubmitting = false;
    submitError: string | null = null;

    constructor() {
        makeAutoObservable(this);
    }

    get view(): DiplomacyView | null {
        return this.diplomacy.value;
    }

    async load(worldId: number): Promise<void> {
        this.worldId = worldId;
        await this.diplomacy.load(() => api.getDiplomacy(worldId));
    }

    async reload(): Promise<void> {
        if (this.worldId !== null) await this.load(this.worldId);
    }

    /**
     * Ein Kommando ausführen und danach neu laden. Alle vier Aktionen laufen
     * gleich ab — deshalb eine Stelle statt viermal derselbe try/catch.
     */
    private async run(
        action: (worldId: number) => Promise<unknown>,
    ): Promise<boolean> {
        const worldId = this.worldId;
        if (worldId === null) return false;
        runInAction(() => {
            this.isSubmitting = true;
            this.submitError = null;
        });
        try {
            await action(worldId);
            await this.load(worldId);
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

    foundTribe(name: string, tag: string): Promise<boolean> {
        return this.run((id) => api.foundTribe(id, name, tag));
    }

    invite(playerId: number): Promise<boolean> {
        return this.run((id) => api.invitePlayer(id, playerId));
    }

    accept(tribeId: number): Promise<boolean> {
        return this.run((id) => api.acceptInvitation(id, tribeId));
    }

    leave(): Promise<boolean> {
        return this.run((id) => api.leaveTribe(id));
    }

    clear(): void {
        this.diplomacy.clear();
        this.worldId = null;
        this.submitError = null;
    }
}
