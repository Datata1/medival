import { Duration, type Report } from '@medival/shared';
import { makeAutoObservable } from 'mobx';
import { api } from '../api/client.js';
import { AsyncValue } from './AsyncValue.js';

const POLL_INTERVAL = Duration.seconds(10);

/** Kampfberichte samt Ungelesen-Zähler. */
export class ReportsStore {
    readonly reports = new AsyncValue<Report[]>();
    worldId: number | null = null;
    openReportId: number | null = null;

    private timer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        makeAutoObservable<this, 'timer'>(this, { timer: false });
    }

    get list(): Report[] {
        return this.reports.value ?? [];
    }

    get unreadCount(): number {
        return this.list.filter((r) => !r.read).length;
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
        this.openReportId = null;
        this.reports.clear();
    }

    async reload(): Promise<void> {
        const id = this.worldId;
        if (id === null) return;
        await this.reports.load(() => api.getReports(id));
    }

    toggleOpen(reportId: number): void {
        this.openReportId =
            this.openReportId === reportId ? null : reportId;
    }

    /**
     * Wird aufgerufen, wenn der Nutzer die Berichte öffnet — eine Handlung,
     * kein Nebeneffekt des Renderns (siehe plans/06-useeffect-audit.md).
     */
    async markAllRead(): Promise<void> {
        const id = this.worldId;
        if (id === null || this.unreadCount === 0) return;
        await api.markReportsRead(id);
        await this.reload();
    }
}
