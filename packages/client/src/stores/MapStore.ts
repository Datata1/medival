import type { MapVillage, Units } from '@medival/shared';
import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client.js';
import { apiErrorMessage } from '../lib/errors.js';
import { AsyncValue } from './AsyncValue.js';

/** Kartendörfer, die aktuelle Auswahl und das Versenden von Truppen. */
export class MapStore {
    readonly villages = new AsyncValue<MapVillage[]>();
    worldId: number | null = null;
    selectedVillageId: number | null = null;
    sendError: string | null = null;
    isSending = false;

    constructor() {
        makeAutoObservable(this);
    }

    get list(): MapVillage[] {
        return this.villages.value ?? [];
    }

    get selected(): MapVillage | null {
        const id = this.selectedVillageId;
        return id === null
            ? null
            : (this.list.find((v) => v.id === id) ?? null);
    }

    villageById(id: number): MapVillage | undefined {
        return this.list.find((v) => v.id === id);
    }

    async load(worldId: number): Promise<void> {
        this.worldId = worldId;
        await this.villages.load(() => api.getMap(worldId));
    }

    clear(): void {
        runInAction(() => {
            this.worldId = null;
            this.selectedVillageId = null;
            this.sendError = null;
            this.villages.clear();
        });
    }

    select(village: MapVillage | null): void {
        this.selectedVillageId = village?.id ?? null;
        this.sendError = null;
    }

    /**
     * Meldet den Ausgang einer Aktion — der RootStore hängt hier den Klang ein.
     * Der Store selbst kennt keine Audioausgabe (plans/13-sounds.md).
     */
    onActionResult: ((ok: boolean) => void) | null = null;

    /** Schickt Truppen; liefert true bei Erfolg, damit das Formular sich leeren kann. */
    async sendUnits(
        originVillageId: number,
        target: number,
        kind: 'attack' | 'support',
        units: Units,
    ): Promise<boolean> {
        const worldId = this.worldId;
        if (worldId === null) return false;
        runInAction(() => {
            this.isSending = true;
            this.sendError = null;
        });
        try {
            await api.send(
                worldId,
                originVillageId,
                target,
                kind,
                units,
            );
            this.onActionResult?.(true);
            return true;
        } catch (cause) {
            runInAction(() => {
                this.sendError = apiErrorMessage(cause);
            });
            this.onActionResult?.(false);
            return false;
        } finally {
            runInAction(() => {
                this.isSending = false;
            });
        }
    }
}
