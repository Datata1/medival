import { makeAutoObservable, runInAction } from 'mobx';
import { apiErrorMessage } from '../lib/errors.js';

/**
 * Ein Wert, der von der API geladen wird — mit Lade- und Fehlerzustand
 * (siehe plans/09-mobx-state-management.md).
 *
 * Ohne diesen Baustein würde jeder Store dasselbe Dreigespann aus `value`,
 * `isLoading` und `error` von Hand pflegen. Er kümmert sich außerdem um zwei
 * Dinge, die man leicht vergisst: parallele Ladevorgänge (der letzte gewinnt,
 * ältere Antworten werden verworfen) und Fehler, die als Zustand landen statt
 * den Aufrufer zu sprengen.
 */
export class AsyncValue<T> {
    value: T | null = null;
    error: string | null = null;
    isLoading = false;

    /** Zählt Ladevorgänge, damit veraltete Antworten erkannt werden. */
    private requestId = 0;

    constructor(initial: T | null = null) {
        this.value = initial;
        makeAutoObservable<this, 'requestId'>(this, {
            requestId: false,
        });
    }

    get hasValue(): boolean {
        return this.value !== null;
    }

    /**
     * Lädt neu. Ein Fehler wird in `error` festgehalten und nicht geworfen —
     * die Oberfläche soll ihn anzeigen, nicht daran zerbrechen.
     */
    async load(fetcher: () => Promise<T>): Promise<void> {
        const id = ++this.requestId;
        runInAction(() => {
            this.isLoading = true;
            this.error = null;
        });
        try {
            const result = await fetcher();
            if (id !== this.requestId) return; // überholt von einem neueren Aufruf
            runInAction(() => {
                this.value = result;
                this.isLoading = false;
            });
        } catch (cause) {
            if (id !== this.requestId) return;
            runInAction(() => {
                this.error = apiErrorMessage(cause);
                this.isLoading = false;
            });
        }
    }

    /** Setzt einen Wert direkt, z. B. die Antwort einer Mutation. */
    set(value: T): void {
        this.requestId++; // laufende Ladevorgänge dürfen das nicht überschreiben
        this.value = value;
        this.error = null;
        this.isLoading = false;
    }

    clear(): void {
        this.requestId++;
        this.value = null;
        this.error = null;
        this.isLoading = false;
    }
}
