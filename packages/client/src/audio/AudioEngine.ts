import { keysOf } from '@medival/shared';
import { SOUND_GAIN, SOUNDS, type SoundId } from './sounds.js';

/**
 * Was der Store zum Abspielen braucht — als Schnittstelle, damit er ohne
 * Browser testbar bleibt (dasselbe Muster wie `WorldSocket` in Plan 09).
 */
export interface AudioOutput {
    /** Muss aus einer Nutzerinteraktion heraus aufgerufen werden. */
    unlock(): void;
    play(sound: SoundId, volume: number): void;
    /** Nur für Tests und Diagnose. */
    readonly isReady: boolean;
}

/**
 * Web-Audio-Umsetzung. Bewusst nicht `new Audio()`: Der AudioContext hat
 * geringere Latenz, erlaubt saubere Lautstärkeregelung und dekodiert jede Datei
 * nur einmal.
 */
export class WebAudioOutput implements AudioOutput {
    private context: AudioContext | null = null;
    private buffers = new Map<SoundId, AudioBuffer>();
    private loading = new Set<SoundId>();

    get isReady(): boolean {
        return this.context?.state === 'running';
    }

    /**
     * Browser verweigern Ton, bis der Nutzer die Seite angefasst hat — ein beim
     * Laden erzeugter Kontext bleibt stumm, ohne Fehlermeldung. Deshalb wird er
     * erst hier erzeugt und fortgesetzt.
     */
    unlock(): void {
        this.context ??= new AudioContext();
        if (this.context.state === 'suspended')
            void this.context.resume();
        // Sofort alles dekodieren: Sonst bliebe ausgerechnet der erste Alarm
        // stumm, weil `play` beim ersten Mal nur das Laden anstößt.
        this.preload();
    }

    play(sound: SoundId, volume: number): void {
        const context = this.context;
        if (context?.state !== 'running' || volume <= 0) return;

        const buffer = this.buffers.get(sound);
        if (!buffer) {
            void this.load(sound);
            return; // beim ersten Mal noch stumm; danach liegt er bereit
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        const gain = context.createGain();
        gain.gain.value = volume * SOUND_GAIN[sound];
        source.connect(gain).connect(context.destination);
        source.start();
    }

    /** Lädt und dekodiert einen Klang — einmalig, danach aus dem Speicher. */
    private async load(sound: SoundId): Promise<void> {
        const context = this.context;
        if (
            !context ||
            this.buffers.has(sound) ||
            this.loading.has(sound)
        )
            return;
        this.loading.add(sound);
        try {
            const response = await fetch(SOUNDS[sound]);
            const decoded = await context.decodeAudioData(
                await response.arrayBuffer(),
            );
            this.buffers.set(sound, decoded);
        } catch (cause) {
            console.warn(
                `Klang ${sound} konnte nicht geladen werden:`,
                cause,
            );
        } finally {
            this.loading.delete(sound);
        }
    }

    /** Lädt alle Klänge vorab, damit der erste Alarm nicht verschluckt wird. */
    preload(): void {
        if (!this.context) return;
        for (const sound of keysOf(SOUNDS)) void this.load(sound);
    }
}
