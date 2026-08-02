import { makeAutoObservable } from 'mobx';
import { z } from 'zod';
import type { AudioOutput } from '../audio/AudioEngine.js';
import type { SoundId } from '../audio/sounds.js';

const STORAGE_KEY = 'medival.sound';
const DEFAULT_VOLUME = 0.6;

/**
 * `localStorage` ist eine Vertrauensgrenze wie jede andere: Der Inhalt stammt
 * aus einer früheren Version, einer anderen Zunge oder der Entwicklerkonsole.
 * Deshalb geparst statt gecastet (Plan 08). Beide Felder sind optional, damit
 * ein halb geschriebener Eintrag den Rest nicht verwirft.
 */
const StoredSettingsSchema = z.object({
    volume: z.number().min(0).max(1).optional(),
    muted: z.boolean().optional(),
});

type StoredSettings = z.infer<typeof StoredSettingsSchema>;

/**
 * Klangeinstellungen und das Auslösen von Klängen (siehe plans/13-sounds.md).
 *
 * Lautstärke und Stummschaltung sind Zustand, kein Komponenten-Detail — deshalb
 * ein Store (Plan 09). Die Ausgabe wird injiziert, damit sich alles ohne
 * Browser testen lässt.
 */
export class SoundStore {
    volume = DEFAULT_VOLUME;
    muted = false;
    /** Erst nach einer Nutzerinteraktion darf überhaupt Ton kommen. */
    unlocked = false;

    constructor(
        private readonly output: AudioOutput,
        private readonly storage: Storage | null = globalThis.localStorage ??
            null,
    ) {
        this.restore();
        makeAutoObservable<this, 'output' | 'storage'>(this, {
            output: false,
            storage: false,
        });
    }

    get effectiveVolume(): number {
        return this.muted ? 0 : this.volume;
    }

    /**
     * Aus einer Nutzerinteraktion heraus aufzurufen. Vorher lehnt der Browser
     * jede Wiedergabe ab — stillschweigend.
     */
    unlock(): void {
        if (this.unlocked) return;
        this.output.unlock();
        this.unlocked = true;
    }

    play(sound: SoundId): void {
        if (!this.unlocked || this.effectiveVolume <= 0) return;
        this.output.play(sound, this.effectiveVolume);
    }

    setVolume(volume: number): void {
        this.volume = Math.max(0, Math.min(1, volume));
        // Am Regler zu ziehen ist eine Interaktion — also darf ab jetzt Ton kommen.
        this.unlock();
        this.persist();
    }

    toggleMuted(): void {
        this.muted = !this.muted;
        this.unlock();
        this.persist();
        if (!this.muted) this.play('click');
    }

    private restore(): void {
        const raw = this.storage?.getItem(STORAGE_KEY);
        if (!raw) return;

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return; // kein gültiges JSON: Standardwerte behalten
        }

        const settings = StoredSettingsSchema.safeParse(parsed);
        // Kaputter Eintrag hält die Anwendung nicht auf — Ton ist kein Grund,
        // den Start zu verweigern.
        if (!settings.success) return;
        if (settings.data.volume !== undefined)
            this.volume = settings.data.volume;
        if (settings.data.muted !== undefined)
            this.muted = settings.data.muted;
    }

    private persist(): void {
        this.storage?.setItem(
            STORAGE_KEY,
            JSON.stringify({
                volume: this.volume,
                muted: this.muted,
            } satisfies StoredSettings),
        );
    }
}

/**
 * Meldet Klänge für *neu hinzugekommene* Dinge — nicht für das, was beim Öffnen
 * einer Welt ohnehin schon da war.
 *
 * Ohne diese Unterscheidung gäbe es beim Betreten einer Welt eine Salve: Der
 * Berichte-Store lädt die vollständige Liste, das Polling liefert sie
 * regelmäßig erneut. Die erste Antwort setzt deshalb nur den Ausgangsstand.
 */
export class ArrivalWatcher {
    private known: Set<number> | null = null;

    /** Gibt zurück, wie viele Einträge wirklich neu sind. */
    countNew(ids: readonly number[]): number {
        if (this.known === null) {
            this.known = new Set(ids);
            return 0; // erste Ladung: nur merken, nicht melden
        }
        let added = 0;
        for (const id of ids) {
            if (!this.known.has(id)) {
                this.known.add(id);
                added++;
            }
        }
        // Verschwundene Einträge vergessen, damit die Menge nicht unbegrenzt wächst.
        const current = new Set(ids);
        for (const id of this.known)
            if (!current.has(id)) this.known.delete(id);
        return added;
    }

    reset(): void {
        this.known = null;
    }
}
