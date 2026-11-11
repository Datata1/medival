import {
    Duration,
    REPORTS_PAGE_SIZE,
    type Report,
    type ReportDetail,
    type ReportFilter,
    type ReportList,
} from '@medival/shared';
import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client.js';
import { apiErrorMessage } from '../lib/errors.js';
import { AsyncValue } from './AsyncValue.js';

const POLL_INTERVAL = Duration.seconds(10);

/**
 * Berichte: eine geblätterte, gefilterte Liste und der einzeln geöffnete
 * Bericht (plans/18-ux/18-4-berichte.md).
 *
 * Filter und Seite kommen aus der Adresse und werden hier nur gehalten,
 * damit das Polling denselben Ausschnitt nachlädt. Der Ungelesen-Zähler
 * kommt vom Server: Seit geblättert wird, kennt der Client nicht mehr alle
 * Berichte und kann sie nicht selbst zählen.
 */
export class ReportsStore {
    readonly reports = new AsyncValue<ReportList>();
    /** Der Bericht der Detailseite, unabhängig von der Liste geladen. */
    readonly detail = new AsyncValue<ReportDetail>();
    worldId: number | null = null;
    filter: ReportFilter = 'all';
    /** Erste Zeile des Ausschnitts, von null gezählt. */
    offset = 0;
    /** Angekreuzte Berichte für „Ausgewählte löschen". */
    readonly selected = new Set<number>();
    actionError: string | null = null;

    private timer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        makeAutoObservable<this, 'timer'>(this, { timer: false });
    }

    get list(): Report[] {
        return this.reports.value?.reports ?? [];
    }

    get unreadCount(): number {
        return this.reports.value?.unread ?? 0;
    }

    /** Treffer des Filters über alle Seiten. */
    get total(): number {
        return this.reports.value?.total ?? 0;
    }

    get pageCount(): number {
        return Math.max(1, Math.ceil(this.total / REPORTS_PAGE_SIZE));
    }

    /** Neuester Bericht überhaupt; der RootStore erkennt daran Neuzugänge. */
    get newestId(): number | null {
        return this.reports.value?.newestId ?? null;
    }

    get allSelected(): boolean {
        return (
            this.list.length > 0 &&
            this.list.every((r) => this.selected.has(r.id))
        );
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
        this.filter = 'all';
        this.offset = 0;
        this.selected.clear();
        this.actionError = null;
        this.reports.clear();
        this.detail.clear();
    }

    async reload(): Promise<void> {
        const id = this.worldId;
        if (id === null) return;
        const query = { offset: this.offset, filter: this.filter };
        await this.reports.load(() => api.getReports(id, query));
    }

    /**
     * Zeigt Filter und Seite aus der Adresse (Seite ab 1 gezählt). Die
     * Auswahl verfällt: Ein Haken auf einer Seite, die man nicht mehr sieht,
     * löschte sonst Berichte, an die niemand mehr denkt.
     */
    async show(
        worldId: number,
        filter: ReportFilter,
        page: number,
    ): Promise<void> {
        this.worldId = worldId;
        this.filter = filter;
        this.offset = (Math.max(1, page) - 1) * REPORTS_PAGE_SIZE;
        this.selected.clear();
        await this.reload();
    }

    /**
     * Öffnet einen Bericht und markiert genau ihn als gelesen. Vorher galt
     * „du hast die Liste gesehen": Wer sie nur streifte, verlor alle Marken.
     */
    async open(worldId: number, reportId: number): Promise<void> {
        this.worldId = worldId;
        await this.detail.load(() => api.getReport(worldId, reportId));
        const opened = this.detail.value;
        if (!opened || opened.report.id !== reportId) return;
        if (opened.report.read) return;
        try {
            await api.markReportRead(worldId, reportId);
        } catch {
            // Bleibt ungelesen; der Bericht selbst ist trotzdem zu sehen.
            return;
        }
        runInAction(() => {
            this.detail.set({
                ...opened,
                report: { ...opened.report, read: true },
            });
        });
        await this.reload();
    }

    toggleSelected(reportId: number): void {
        if (!this.selected.delete(reportId))
            this.selected.add(reportId);
    }

    /** Alle der Seite ankreuzen, oder alle Haken entfernen. */
    toggleAll(): void {
        if (this.allSelected) {
            this.selected.clear();
            return;
        }
        for (const report of this.list) this.selected.add(report.id);
    }

    /** Löscht Berichte; liefert true bei Erfolg. */
    async remove(ids: readonly number[]): Promise<boolean> {
        const id = this.worldId;
        if (id === null || ids.length === 0) return false;
        try {
            const [only] = ids;
            if (ids.length === 1 && only !== undefined)
                await api.deleteReport(id, only);
            else await api.deleteReports(id, ids);
        } catch (cause) {
            runInAction(() => {
                this.actionError = apiErrorMessage(cause);
            });
            return false;
        }
        runInAction(() => {
            this.actionError = null;
            for (const removed of ids) this.selected.delete(removed);
        });
        await this.reload();
        // Die letzte Seite kann leer geworden sein: eine zurück.
        if (this.list.length === 0 && this.offset > 0) {
            runInAction(() => {
                this.offset = Math.max(
                    0,
                    this.offset - REPORTS_PAGE_SIZE,
                );
            });
            await this.reload();
        }
        return true;
    }

    async removeSelected(): Promise<boolean> {
        return this.remove([...this.selected]);
    }

    /** Eine bewusste Handlung, keine Nebenwirkung des Öffnens mehr. */
    async markAllRead(): Promise<void> {
        const id = this.worldId;
        if (id === null || this.unreadCount === 0) return;
        await api.markReportsRead(id);
        await this.reload();
    }
}
