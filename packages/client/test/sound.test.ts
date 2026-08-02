import { describe, expect, it } from 'vitest';
import type { AudioOutput } from '../src/audio/AudioEngine.js';
import type { SoundId } from '../src/audio/sounds.js';
import {
    ArrivalWatcher,
    SoundStore,
} from '../src/stores/SoundStore.js';

/**
 * Ausgabe zum Mitschreiben. Genau dafür ist `AudioOutput` eine Schnittstelle:
 * Die Klanglogik lässt sich ohne Browser prüfen (Muster aus Plan 09).
 */
class RecordingOutput implements AudioOutput {
    readonly played: { sound: SoundId; volume: number }[] = [];
    unlocks = 0;
    isReady = false;

    unlock(): void {
        this.unlocks++;
        this.isReady = true;
    }

    play(sound: SoundId, volume: number): void {
        this.played.push({ sound, volume });
    }

    get sounds(): SoundId[] {
        return this.played.map((entry) => entry.sound);
    }
}

/** Speicher im Arbeitsspeicher — `localStorage` gibt es unter Node nicht. */
class MemoryStorage implements Storage {
    private data = new Map<string, string>();

    get length(): number {
        return this.data.size;
    }
    clear(): void {
        this.data.clear();
    }
    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }
    key(index: number): string | null {
        return [...this.data.keys()][index] ?? null;
    }
    removeItem(key: string): void {
        this.data.delete(key);
    }
    setItem(key: string, value: string): void {
        this.data.set(key, value);
    }
}

describe('SoundStore', () => {
    it('bleibt vor der ersten Nutzerinteraktion stumm', () => {
        const output = new RecordingOutput();
        const store = new SoundStore(output, new MemoryStorage());

        store.play('attack.incoming');

        // Ohne Entsperrung darf kein Ton kommen — Browser verweigern ihn ohnehin.
        expect(output.played).toEqual([]);
    });

    it('spielt nach dem Entsperren mit der eingestellten Lautstärke', () => {
        const output = new RecordingOutput();
        const store = new SoundStore(output, new MemoryStorage());

        store.unlock();
        store.setVolume(0.4);
        store.play('attack.incoming');

        expect(output.played).toEqual([
            { sound: 'attack.incoming', volume: 0.4 },
        ]);
    });

    it('entsperrt nur einmal, auch bei wiederholter Bedienung', () => {
        const output = new RecordingOutput();
        const store = new SoundStore(output, new MemoryStorage());

        store.unlock();
        store.setVolume(0.5);
        store.unlock();

        expect(output.unlocks).toBe(1);
    });

    it('unterdrückt jeden Ton bei Stummschaltung', () => {
        const output = new RecordingOutput();
        const store = new SoundStore(output, new MemoryStorage());
        store.unlock();

        store.toggleMuted();
        store.play('attack.incoming');
        store.play('build.complete');

        expect(output.played).toEqual([]);
        expect(store.effectiveVolume).toBe(0);
    });

    it('bestätigt das Aufheben der Stummschaltung hörbar', () => {
        const output = new RecordingOutput();
        const store = new SoundStore(output, new MemoryStorage());
        store.unlock();

        store.toggleMuted(); // stumm — kein Ton möglich
        expect(output.played).toEqual([]);

        store.toggleMuted(); // wieder an — sonst wüsste man es nicht
        expect(output.sounds).toEqual(['click']);
    });

    it('überlebt einen Neustart', () => {
        const storage = new MemoryStorage();
        const first = new SoundStore(new RecordingOutput(), storage);
        first.setVolume(0.25);
        first.toggleMuted();

        const second = new SoundStore(new RecordingOutput(), storage);

        expect(second.volume).toBe(0.25);
        expect(second.muted).toBe(true);
    });

    it('begrenzt die Lautstärke auf 0 bis 1', () => {
        const store = new SoundStore(
            new RecordingOutput(),
            new MemoryStorage(),
        );

        store.setVolume(4);
        expect(store.volume).toBe(1);
        store.setVolume(-2);
        expect(store.volume).toBe(0);
    });

    it.each([
        ['kein json', 'gar kein JSON'],
        ['{"volume":"laut"}', 'falscher Typ'],
        ['{"volume":99}', 'außerhalb des gültigen Bereichs'],
        ['null', 'JSON-null'],
        ['[]', 'ein Array statt eines Objekts'],
    ])('fällt bei %s auf die Standardwerte zurück (%s)', (broken) => {
        const storage = new MemoryStorage();
        storage.setItem('medival.sound', broken);

        const store = new SoundStore(new RecordingOutput(), storage);

        expect(store.volume).toBe(0.6);
        expect(store.muted).toBe(false);
    });

    it('übernimmt ein halb geschriebenes Objekt, soweit es gültig ist', () => {
        const storage = new MemoryStorage();
        storage.setItem('medival.sound', '{"muted":true}');

        const store = new SoundStore(new RecordingOutput(), storage);

        expect(store.muted).toBe(true);
        expect(store.volume).toBe(0.6);
    });

    it('kommt ohne Speicher aus (privater Modus, Tests)', () => {
        const store = new SoundStore(new RecordingOutput(), null);
        store.setVolume(0.3);
        expect(store.volume).toBe(0.3);
    });
});

describe('ArrivalWatcher', () => {
    it('schweigt bei der ersten Ladung', () => {
        const watcher = new ArrivalWatcher();

        // Beim Öffnen einer Welt kommen alle bestehenden Berichte auf einmal —
        // ohne diese Regel gäbe es eine Salve von Benachrichtigungen.
        expect(watcher.countNew([1, 2, 3])).toBe(0);
    });

    it('meldet nur wirklichen Zuwachs', () => {
        const watcher = new ArrivalWatcher();
        watcher.countNew([1, 2]);

        expect(watcher.countNew([1, 2, 3])).toBe(1);
        expect(watcher.countNew([1, 2, 3])).toBe(0);
        expect(watcher.countNew([1, 2, 3, 4, 5])).toBe(2);
    });

    it('meldet beim Polling derselben Liste nicht erneut', () => {
        const watcher = new ArrivalWatcher();
        watcher.countNew([7]);

        // 20 Polling-Runden mit unverändertem Ergebnis: kein Dauerfeuer.
        const results = Array.from({ length: 20 }, () =>
            watcher.countNew([7]),
        );

        expect(results.every((count) => count === 0)).toBe(true);
    });

    it('vergisst verschwundene Einträge, meldet sie danach aber wieder', () => {
        const watcher = new ArrivalWatcher();
        watcher.countNew([1, 2]);

        expect(watcher.countNew([1])).toBe(0); // ein Wegfall ist kein Zuwachs
        // Ein eingetroffener Angriff verschwindet aus der Liste. Träfe später
        // dieselbe ID wieder ein, wäre das ein neues Ereignis.
        expect(watcher.countNew([1, 2])).toBe(1);
    });

    it('fängt nach einem Reset wieder bei null an', () => {
        const watcher = new ArrivalWatcher();
        watcher.countNew([1, 2]);
        watcher.reset();

        // Nach dem Weltwechsel ist der Bestand der neuen Welt nicht „neu".
        expect(watcher.countNew([8, 9])).toBe(0);
        expect(watcher.countNew([8, 9, 10])).toBe(1);
    });
});
