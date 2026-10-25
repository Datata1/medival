import {
    type BuildingType,
    MAX_TILES_PER_SIDE,
    type MapVillage,
    type Resources,
    type ScoutIntel,
    type TileRange,
    tileKey,
    tileOf,
    tilesCovering,
    type Units,
} from '@medival/shared';
import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client.js';
import { apiErrorMessage } from '../lib/errors.js';
import { AsyncValue } from './AsyncValue.js';

export interface FrameSize {
    width: number;
    height: number;
}

/** Höchstzahl gehaltener Kacheln; die am längsten ungenutzten fallen raus. */
const MAX_TILES = 400;

/**
 * Frühestens so oft wird der sichtbare Bereich nach Socket-Nachrichten neu
 * geladen. Bei hunderten aktiven Bots kommen `village_updated` und
 * `movement` im Sekundentakt; jede einzeln zu beantworten wäre ein Strom von
 * Anfragen ohne sichtbaren Unterschied.
 */
const RELOAD_INTERVAL_MS = 1_000;

/**
 * Kartendörfer, die aktuelle Auswahl und das Versenden von Truppen.
 *
 * Seit 19-7 hält der Store die Karte **in Kacheln** zu 20×20 Feldern statt
 * aller Dörfer der Welt (plans/19-prototyp/19-7-karten-api-ausschnitt.md).
 * Die Kartenansicht meldet über `showArea`, welchen Bereich sie zeigt; was
 * davon fehlt, wird in einer Anfrage nachgeladen. Bereits geladene Kacheln
 * bleiben im Cache, bis mehr als `MAX_TILES` gehalten werden.
 */
export class MapStore {
    /** Kachelschlüssel → Dörfer der Kachel (auch leere Kacheln). */
    readonly tiles = new Map<string, MapVillage[]>();
    worldId: number | null = null;
    selectedVillageId: number | null = null;
    /**
     * Was ich zuletzt über das ausgewählte Dorf erkundet habe (20-5);
     * `null`, wenn nichts. Geladen bei der Auswahl.
     */
    readonly intel = new AsyncValue<ScoutIntel | null>();
    sendError: string | null = null;
    loadError: string | null = null;
    isSending = false;

    /** Der zuletzt gemeldete sichtbare Bereich, in Kacheln. */
    private area: TileRange | null = null;
    /** Wann eine Kachel zuletzt gebraucht wurde — für das Verdrängen. */
    private readonly lastUsed = new Map<string, number>();
    private useCounter = 0;
    /** Kacheln, deren Anfrage gerade läuft — nicht doppelt anfragen. */
    private readonly pending = new Set<string>();
    private reloadTimer: ReturnType<typeof setTimeout> | null = null;
    private lastReloadAt = 0;

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
        makeAutoObservable<
            this,
            | 'area'
            | 'lastUsed'
            | 'useCounter'
            | 'pending'
            | 'reloadTimer'
            | 'lastReloadAt'
        >(this, {
            area: false,
            lastUsed: false,
            useCounter: false,
            pending: false,
            reloadTimer: false,
            lastReloadAt: false,
        });
    }

    /** Alle geladenen Dörfer. */
    get list(): MapVillage[] {
        return [...this.tiles.values()].flat();
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

    /** Das Dorf auf einem Feld, soweit seine Kachel geladen ist. */
    villageAt(x: number, y: number): MapVillage | null {
        const { tx, ty } = tileOf(x, y);
        return (
            this.tiles
                .get(tileKey(tx, ty))
                ?.find((v) => v.x === x && v.y === y) ?? null
        );
    }

    /** Ist die Kachel dieses Feldes geladen (auch wenn dort nichts steht)? */
    isLoadedAt(x: number, y: number): boolean {
        const { tx, ty } = tileOf(x, y);
        return this.tiles.has(tileKey(tx, ty));
    }

    /** Beim Öffnen einer Welt: Cache leeren, geladen wird über `showArea`. */
    async load(worldId: number): Promise<void> {
        runInAction(() => {
            this.worldId = worldId;
            this.tiles.clear();
            this.loadError = null;
        });
        this.lastUsed.clear();
        this.area = null;
    }

    /**
     * Die Kartenansicht zeigt dieses Feldrechteck (Ränder eingeschlossen).
     * Fehlende Kacheln werden nachgeladen; schon geladene nicht noch einmal.
     */
    async showArea(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
    ): Promise<void> {
        const range = tilesCovering(x0, y0, x1, y1);
        this.area = range;
        await this.fetchTiles(range, false);
    }

    /** Sorgt dafür, dass die Kachel eines Feldes geladen ist (Zielauswahl). */
    async ensurePoint(x: number, y: number): Promise<void> {
        if (this.isLoadedAt(x, y)) return;
        const { tx, ty } = tileOf(x, y);
        await this.fetchTiles(
            { tx0: tx, ty0: ty, tx1: tx, ty1: ty },
            false,
        );
    }

    /**
     * Den sichtbaren Bereich frisch laden — nach Nachrichten, die Besitzer
     * oder Punkte auf der Karte ändern können (Eroberung, Bau).
     *
     * Gedrosselt auf einmal je `RELOAD_INTERVAL_MS`: Ein Schwall von
     * Nachrichten erzeugt eine Anfrage sofort und höchstens eine danach.
     */
    reload(): void {
        if (this.reloadTimer !== null) return;
        const wait =
            this.lastReloadAt + RELOAD_INTERVAL_MS - Date.now();
        const run = () => {
            this.reloadTimer = null;
            this.lastReloadAt = Date.now();
            const area = this.area;
            if (area) void this.fetchTiles(area, true);
        };
        if (wait <= 0) run();
        else this.reloadTimer = setTimeout(run, wait);
    }

    /** Lädt fehlende (oder mit `force` alle) Kacheln, in Stücken ≤ 6×6. */
    private async fetchTiles(
        range: TileRange,
        force: boolean,
    ): Promise<void> {
        const worldId = this.worldId;
        if (worldId === null) return;
        for (const tx of Array.from(
            { length: range.tx1 - range.tx0 + 1 },
            (_, i) => range.tx0 + i,
        ))
            for (const ty of Array.from(
                { length: range.ty1 - range.ty0 + 1 },
                (_, i) => range.ty0 + i,
            ))
                this.lastUsed.set(tileKey(tx, ty), ++this.useCounter);

        const chunks: TileRange[] = [];
        for (
            let tx = range.tx0;
            tx <= range.tx1;
            tx += MAX_TILES_PER_SIDE
        )
            for (
                let ty = range.ty0;
                ty <= range.ty1;
                ty += MAX_TILES_PER_SIDE
            ) {
                const chunk = {
                    tx0: tx,
                    ty0: ty,
                    tx1: Math.min(
                        range.tx1,
                        tx + MAX_TILES_PER_SIDE - 1,
                    ),
                    ty1: Math.min(
                        range.ty1,
                        ty + MAX_TILES_PER_SIDE - 1,
                    ),
                };
                if (force || !this.hasAll(chunk)) chunks.push(chunk);
            }
        if (chunks.length === 0) return;
        const keys = chunks.flatMap((c) => this.keysOf(c));
        // Läuft für alle diese Kacheln schon eine Anfrage, reicht die.
        if (!force && keys.every((k) => this.pending.has(k))) return;
        for (const k of keys) this.pending.add(k);

        try {
            const responses = await Promise.all(
                chunks.map((chunk) => api.getMapTiles(worldId, chunk)),
            );
            if (this.worldId !== worldId) return; // Welt inzwischen gewechselt
            runInAction(() => {
                for (const { tiles } of responses)
                    for (const tile of tiles)
                        this.tiles.set(
                            tileKey(tile.tx, tile.ty),
                            tile.villages,
                        );
                this.loadError = null;
                this.evict();
            });
        } catch (cause) {
            runInAction(() => {
                this.loadError = apiErrorMessage(cause);
            });
        } finally {
            for (const k of keys) this.pending.delete(k);
        }
    }

    private keysOf(range: TileRange): string[] {
        const keys: string[] = [];
        for (let tx = range.tx0; tx <= range.tx1; tx++)
            for (let ty = range.ty0; ty <= range.ty1; ty++)
                keys.push(tileKey(tx, ty));
        return keys;
    }

    private hasAll(range: TileRange): boolean {
        for (let tx = range.tx0; tx <= range.tx1; tx++)
            for (let ty = range.ty0; ty <= range.ty1; ty++)
                if (!this.tiles.has(tileKey(tx, ty))) return false;
        return true;
    }

    private evict(): void {
        if (this.tiles.size <= MAX_TILES) return;
        const byAge = [...this.tiles.keys()].sort(
            (a, b) =>
                (this.lastUsed.get(a) ?? 0) -
                (this.lastUsed.get(b) ?? 0),
        );
        for (const key of byAge.slice(0, this.tiles.size - MAX_TILES)) {
            this.tiles.delete(key);
            this.lastUsed.delete(key);
        }
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
            this.loadError = null;
            this.tiles.clear();
        });
        this.lastUsed.clear();
        this.pending.clear();
        this.area = null;
        if (this.reloadTimer !== null) clearTimeout(this.reloadTimer);
        this.reloadTimer = null;
    }

    select(village: MapVillage | null): void {
        this.selectedVillageId = village?.id ?? null;
        this.sendError = null;
        this.intel.clear();
        const worldId = this.worldId;
        if (village && worldId !== null)
            void this.intel.load(() =>
                api.getIntel(worldId, village.id),
            );
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
        catapultTarget?: BuildingType,
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
                catapultTarget,
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
