import type { MapVillage, Resources, Units } from '@medival/shared';
import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client.js';
import { apiErrorMessage } from '../lib/errors.js';
import { AsyncValue } from './AsyncValue.js';

export interface FrameSize {
    width: number;
    height: number;
}

/** Kartendörfer, die aktuelle Auswahl und das Versenden von Truppen. */
export class MapStore {
    readonly villages = new AsyncValue<MapVillage[]>();
    worldId: number | null = null;
    selectedVillageId: number | null = null;
    sendError: string | null = null;
    isSending = false;

    /*
     * Die Größe der beiden Kartenrahmen. Sie steht hier und nicht in der
     * Komponente, weil sie sonst bei jedem Blick auf ein Dorf verlorenginge:
     * Die Karte ist eine Route, und wer sie einmal auf seinen Bildschirm
     * eingestellt hat, will das nicht nach jedem Seitenwechsel wiederholen
     * (plans/18-ux/18-3-karte.md).
     */
    frameSize: FrameSize = { width: 820, height: 560 };
    miniSize: FrameSize = { width: 300, height: 300 };

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

    /**
     * Nachladen ohne Weltwechsel.
     *
     * Vorher lief `load()` genau einmal beim Öffnen der Welt: Eroberte ein Bot
     * ein Dorf, blieb es in der Anzeige beim alten Besitzer, bis man die Welt
     * neu öffnete. Der `RootStore` hängt das an `movement` und
     * `village_updated` — die Liste ist klein und die Nachrichten sind selten.
     */
    async reload(): Promise<void> {
        const id = this.worldId;
        if (id === null) return;
        await this.villages.load(() => api.getMap(id));
    }

    setFrameSize(size: FrameSize): void {
        this.frameSize = size;
    }

    setMiniSize(size: FrameSize): void {
        this.miniSize = size;
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

    /** Schickt Rohstoffe; liefert true bei Erfolg (plans/16-ansehen-und-handel.md). */
    async sendResources(
        originVillageId: number,
        target: number,
        resources: Resources,
    ): Promise<boolean> {
        const worldId = this.worldId;
        if (worldId === null) return false;
        runInAction(() => {
            this.isSending = true;
            this.sendError = null;
        });
        try {
            await api.ship(worldId, originVillageId, target, resources);
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
