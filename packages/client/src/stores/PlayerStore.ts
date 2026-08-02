import type { PlayerProfile } from '@medival/shared';
import { makeAutoObservable } from 'mobx';
import { api } from '../api/client.js';
import { AsyncValue } from './AsyncValue.js';

/** Das gerade betrachtete Spielerprofil. */
export class PlayerStore {
    readonly profile = new AsyncValue<PlayerProfile>();

    constructor() {
        makeAutoObservable(this);
    }

    get view(): PlayerProfile | null {
        return this.profile.value;
    }

    async load(worldId: number, playerId: number): Promise<void> {
        await this.profile.load(() =>
            api.getPlayerProfile(worldId, playerId),
        );
    }

    clear(): void {
        this.profile.clear();
    }
}
