import { Duration, type MovementsResponse } from '@medival/shared';
import { makeAutoObservable } from 'mobx';
import { api } from '../api/client.js';
import { AsyncValue } from './AsyncValue.js';

const POLL_INTERVAL = Duration.seconds(5);

/**
 * Truppenbewegungen der geöffneten Welt.
 *
 * Das Polling hängt am Lebenszyklus der Welt, nicht am Rendern einer
 * Komponente: Vorher lief es nur, solange das Bewegungspanel sichtbar war,
 * sodass Ankunftszeiten veralteten, sobald man auf einen anderen Tab wechselte
 * (siehe plans/09-mobx-state-management.md).
 */
export class MovementsStore {
    readonly movements = new AsyncValue<MovementsResponse>();
    worldId: number | null = null;

    private timer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        makeAutoObservable<this, 'timer'>(this, { timer: false });
    }

    get incoming(): MovementsResponse['incoming'] {
        return this.movements.value?.incoming ?? [];
    }

    get outgoing(): MovementsResponse['outgoing'] {
        return this.movements.value?.outgoing ?? [];
    }

    get isEmpty(): boolean {
        return this.incoming.length === 0 && this.outgoing.length === 0;
    }

    /** Wird nach jedem Polling aufgerufen — der RootStore hängt sich hier ein. */
    onReloaded: (() => void) | null = null;

    async start(worldId: number): Promise<void> {
        this.worldId = worldId;
        await this.reload();
        if (this.timer === null) {
            this.timer = setInterval(() => {
                void this.reload().then(() => this.onReloaded?.());
            }, POLL_INTERVAL);
        }
    }

    stop(): void {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.worldId = null;
        this.movements.clear();
    }

    async reload(): Promise<void> {
        const id = this.worldId;
        if (id === null) return;
        await this.movements.load(() => api.getMovements(id));
    }
}
