import {
    RANKING_PAGE_SIZE,
    type RankedPlayer,
    type RankedTribe,
    type RankingResponse,
} from '@medival/shared';
import { makeAutoObservable } from 'mobx';
import { api } from '../api/client.js';
import { AsyncValue } from './AsyncValue.js';

/**
 * Rangliste der geöffneten Welt (plans/18-ux/18-5).
 *
 * Kopfzeile und Ranglistenseite lesen denselben Stand. Die eigene Zeile
 * kommt mit jeder Seite mit, deshalb kennt die Kopfzeile den Rang, auch wenn
 * man selbst auf Seite sieben steht.
 */
export class RankingStore {
    readonly page = new AsyncValue<RankingResponse>();
    worldId: number | null = null;
    /** Erste Zeile des geladenen Ausschnitts, von null gezählt. */
    offset = 0;

    constructor() {
        makeAutoObservable(this);
    }

    get players(): RankedPlayer[] {
        return this.page.value?.players ?? [];
    }

    get tribes(): RankedTribe[] {
        return this.page.value?.tribes ?? [];
    }

    get own(): RankedPlayer | null {
        return this.page.value?.own ?? null;
    }

    get totalPlayers(): number {
        return this.page.value?.totalPlayers ?? 0;
    }

    get pageCount(): number {
        return Math.max(
            1,
            Math.ceil(this.totalPlayers / RANKING_PAGE_SIZE),
        );
    }

    /** Lädt die Seite `page` (ab 1 gezählt, wie sie in der Adresse steht). */
    async load(worldId: number, page = 1): Promise<void> {
        this.worldId = worldId;
        this.offset = (Math.max(1, page) - 1) * RANKING_PAGE_SIZE;
        const offset = this.offset;
        await this.page.load(() => api.getRanking(worldId, offset));
    }

    /** Derselbe Ausschnitt noch einmal, etwa nach einer Eroberung. */
    async reload(): Promise<void> {
        const id = this.worldId;
        if (id === null) return;
        const offset = this.offset;
        await this.page.load(() => api.getRanking(id, offset));
    }

    clear(): void {
        this.worldId = null;
        this.offset = 0;
        this.page.clear();
    }
}
