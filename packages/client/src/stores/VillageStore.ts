import type {
    BuildingType,
    UnitType,
    VillageView,
} from '@medival/shared';
import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client.js';
import { apiErrorMessage } from '../lib/errors.js';
import { AsyncValue } from './AsyncValue.js';

/** Das gerade betrachtete Dorf samt Bau- und Rekrutierungsbefehlen. */
export class VillageStore {
    readonly village = new AsyncValue<VillageView>();
    worldId: number | null = null;
    villageId: number | null = null;
    buildError: string | null = null;
    recruitError: string | null = null;
    researchError: string | null = null;
    isBuilding = false;
    isRecruiting = false;
    isResearching = false;

    constructor() {
        makeAutoObservable(this);
    }

    get view(): VillageView | null {
        return this.village.value;
    }

    async select(worldId: number, villageId: number): Promise<void> {
        const changed =
            this.worldId !== worldId || this.villageId !== villageId;
        runInAction(() => {
            this.worldId = worldId;
            this.villageId = villageId;
            if (changed) {
                this.village.clear();
                this.buildError = null;
                this.recruitError = null;
                this.researchError = null;
            }
        });
        await this.reload();
    }

    clear(): void {
        runInAction(() => {
            this.worldId = null;
            this.villageId = null;
            this.buildError = null;
            this.recruitError = null;
            this.village.clear();
        });
    }

    async reload(): Promise<void> {
        const { worldId, villageId } = this;
        if (worldId === null || villageId === null) return;
        await this.village.load(() =>
            api.getVillage(worldId, villageId),
        );
    }

    /** Meldet fehlgeschlagene Aktionen — der RootStore spielt dazu den Fehlerlaut. */
    onActionFailed: (() => void) | null = null;

    async build(building: BuildingType): Promise<void> {
        const { worldId, villageId } = this;
        if (worldId === null || villageId === null) return;
        runInAction(() => {
            this.isBuilding = true;
            this.buildError = null;
        });
        try {
            // Die Antwort ist der neue Dorfzustand — kein zweiter Abruf nötig.
            const updated = await api.build(
                worldId,
                villageId,
                building,
            );
            runInAction(() => this.village.set(updated));
        } catch (cause) {
            runInAction(() => {
                this.buildError = apiErrorMessage(cause);
            });
            this.onActionFailed?.();
        } finally {
            runInAction(() => {
                this.isBuilding = false;
            });
        }
    }

    async recruit(unit: UnitType, count: number): Promise<void> {
        const { worldId, villageId } = this;
        if (worldId === null || villageId === null) return;
        runInAction(() => {
            this.isRecruiting = true;
            this.recruitError = null;
        });
        try {
            const updated = await api.recruit(
                worldId,
                villageId,
                unit,
                count,
            );
            runInAction(() => this.village.set(updated));
        } catch (cause) {
            runInAction(() => {
                this.recruitError = apiErrorMessage(cause);
            });
            this.onActionFailed?.();
        } finally {
            runInAction(() => {
                this.isRecruiting = false;
            });
        }
    }

    /** Eine Einheit in der Schmiede erforschen (19-13). */
    async research(unit: UnitType): Promise<void> {
        const { worldId, villageId } = this;
        if (worldId === null || villageId === null) return;
        runInAction(() => {
            this.isResearching = true;
            this.researchError = null;
        });
        try {
            const updated = await api.research(
                worldId,
                villageId,
                unit,
            );
            runInAction(() => this.village.set(updated));
        } catch (cause) {
            runInAction(() => {
                this.researchError = apiErrorMessage(cause);
            });
            this.onActionFailed?.();
        } finally {
            runInAction(() => {
                this.isResearching = false;
            });
        }
    }
}
