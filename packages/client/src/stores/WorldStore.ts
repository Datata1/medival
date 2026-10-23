import {
    BUILDING_ORDER,
    type BuildingType,
    buildingsEnabled,
    Duration,
    GameTime,
    type GameTimeLike,
    UNIT_ORDER,
    type UnitType,
    unitsEnabled,
    type WorldSummary,
} from '@medival/shared';
import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client.js';
import { apiErrorMessage } from '../lib/errors.js';
import { AsyncValue } from './AsyncValue.js';

/** Wie oft die angezeigte Spielzeit weitergestellt wird. */
const TICK_INTERVAL = Duration.ms(500);

/**
 * Die geöffnete Welt: Zustand, Pause-Steuerung (nur Entwicklermodus) und die
 * laufende Spielzeit.
 *
 * Die Uhr gehört hierher und nicht in eine Komponente: Sie beschreibt die Welt,
 * nicht eine Ansicht. Sie rechnet einen Server-Zeitstempel mit der seither
 * verstrichenen Wandzeit hoch — dieselbe Idee wie der `useSyncExternalStore`-
 * Umbau aus Plan 06, nur ist der Store jetzt die Quelle.
 */
export class WorldStore {
    readonly world = new AsyncValue<WorldSummary>();
    worldId: number | null = null;
    actionError: string | null = null;

    /** Anker: Server-Spielzeit und die Wandzeit ihres Eintreffens. */
    private anchorGameTime = GameTime.zero;
    private anchorWallTime = Date.now();
    private tickedAt = Date.now();
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        makeAutoObservable<
            this,
            'anchorGameTime' | 'anchorWallTime' | 'timer'
        >(this, {
            anchorGameTime: false,
            anchorWallTime: false,
            timer: false,
        });
    }

    get summary(): WorldSummary | null {
        return this.world.value;
    }

    get isRunning(): boolean {
        return this.summary?.status === 'running';
    }

    /** Mein Spieler in dieser Welt; `null`, solange nicht beigetreten (19-9). */
    get playerId(): number | null {
        return this.summary?.playerId ?? null;
    }

    /** Wanduhrzeit des Servers, zu der die Spielzeit 0 war (19-3). */
    get epochZeroMs(): number {
        return this.summary?.epochZeroMs ?? 0;
    }

    /** Läuft der Server im Entwicklermodus (Pause, Vorspulen)? */
    /**
     * Die Einheiten dieser Welt (19-12). Alle Listen im Client gehen
     * hierüber, damit keine eine Einheit zeigt, die es nicht gibt.
     */
    get enabledUnits(): UnitType[] {
        const settings = this.summary?.settings;
        return settings ? unitsEnabled(settings) : [...UNIT_ORDER];
    }

    /** Die Gebäude dieser Welt (19-14), wie `enabledUnits`. */
    get enabledBuildings(): BuildingType[] {
        const settings = this.summary?.settings;
        return settings
            ? buildingsEnabled(settings)
            : [...BUILDING_ORDER];
    }

    get devMode(): boolean {
        return this.summary?.devMode ?? false;
    }

    /** Uhrzeit (Epoch-ms) eines Spielzeitpunkts — in Serverzeit. */
    clockOf(t: GameTimeLike): number {
        return this.epochZeroMs + t;
    }

    get playerVillages(): WorldSummary['playerVillages'] {
        return this.summary?.playerVillages ?? [];
    }

    /** Aktuelle Spielzeit; läuft zwischen den Server-Antworten weiter. */
    get gameTime(): GameTime {
        if (!this.isRunning) return this.anchorGameTime;
        // `tickedAt` ist observable und treibt die Neuberechnung an.
        const elapsed = Math.max(
            0,
            this.tickedAt - this.anchorWallTime,
        );
        return GameTime.add(this.anchorGameTime, elapsed);
    }

    async open(worldId: number): Promise<void> {
        runInAction(() => {
            this.worldId = worldId;
        });
        await this.reload();
        this.startTicking();
    }

    close(): void {
        this.stopTicking();
        runInAction(() => {
            this.worldId = null;
            this.actionError = null;
            this.world.clear();
            this.anchorGameTime = GameTime.zero;
        });
    }

    async reload(): Promise<void> {
        const id = this.worldId;
        if (id === null) return;
        await this.world.load(() => api.getWorld(id));
        const summary = this.world.value;
        if (summary) this.anchor(summary.gameTime);
    }

    async togglePause(): Promise<void> {
        const id = this.worldId;
        if (id === null) return;
        try {
            const summary = this.isRunning
                ? await api.pauseWorld(id)
                : await api.resumeWorld(id);
            runInAction(() => {
                this.world.set(summary);
                this.actionError = null;
            });
            this.anchor(summary.gameTime);
        } catch (cause) {
            runInAction(() => {
                this.actionError = apiErrorMessage(cause);
            });
        }
    }

    /** Verankert eine frisch vom Server gelesene Spielzeit. */
    private anchor(gameTime: GameTime): void {
        this.anchorGameTime = gameTime;
        this.anchorWallTime = Date.now();
        runInAction(() => {
            this.tickedAt = Date.now();
        });
    }

    private startTicking(): void {
        if (this.timer !== null) return;
        this.timer = setInterval(() => {
            runInAction(() => {
                this.tickedAt = Date.now();
            });
        }, TICK_INTERVAL);
    }

    private stopTicking(): void {
        if (this.timer === null) return;
        clearInterval(this.timer);
        this.timer = null;
    }
}
