#!/usr/bin/env node
/**
 * Erzeugt die Platzhalter-Klänge (siehe plans/13-sounds.md).
 *
 * Alles synthetisiert, ohne Fremdbibliothek — genau wie die Sprites in Plan 12.
 * Eigene Aufnahmen ersetzen einen Platzhalter, indem sie unter demselben
 * Dateinamen abgelegt werden.
 *
 * Aufruf: `pnpm sounds:generate`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    encodeWav,
    envelope,
    noise,
    SAMPLE_RATE,
    saw,
    silence,
    tone,
} from './lib/wav.mjs';

const SOUNDS_DIR = new URL(
    '../packages/client/src/assets/sounds/',
    import.meta.url,
).pathname;

/**
 * Alarmhorn: zwei aufsteigende Stöße auf einer tiefen Sägezahnstimme.
 * Der auffälligste Klang im Spiel — er meldet das Einzige, dessen Übersehen
 * etwas kostet.
 */
function horn() {
    const buffer = silence(1.4);
    const blast = (start, freq) => {
        const length = Math.round(0.55 * SAMPLE_RATE);
        const env = envelope(length, {
            attack: 0.04,
            decay: 0.15,
            sustain: 0.75,
        });
        saw(buffer, {
            freq,
            start,
            duration: 0.55,
            gain: 0.24,
            env,
            harmonics: 8,
        });
        saw(buffer, {
            freq: freq * 1.5,
            start,
            duration: 0.55,
            gain: 0.1,
            env,
            harmonics: 5,
        });
    };
    blast(0, 196); // g
    blast(0.62, 262); // c
    return buffer;
}

/** Amboss: kurzer metallischer Schlag mit Nachklang — Bau abgeschlossen. */
function anvil() {
    const buffer = silence(0.7);
    const hit = envelope(Math.round(0.08 * SAMPLE_RATE), {
        attack: 0.001,
        decay: 0.07,
        sustain: 0,
    });
    noise(buffer, { duration: 0.08, gain: 0.3, env: hit, seed: 7 });
    const ring = envelope(Math.round(0.6 * SAMPLE_RATE), {
        attack: 0.002,
        decay: 0.55,
        sustain: 0.05,
    });
    tone(buffer, { freq: 1180, duration: 0.6, gain: 0.16, env: ring });
    tone(buffer, { freq: 1790, duration: 0.45, gain: 0.09, env: ring });
    return buffer;
}

/** Papierrascheln: gefiltertes Rauschen in zwei Wellen — neuer Bericht. */
function parchment() {
    const buffer = silence(0.6);
    for (const [start, seed] of [
        [0, 11],
        [0.22, 23],
    ]) {
        const length = Math.round(0.3 * SAMPLE_RATE);
        const env = envelope(length, {
            attack: 0.03,
            decay: 0.12,
            sustain: 0.3,
        });
        noise(buffer, { start, duration: 0.3, gain: 0.11, env, seed });
    }
    // Einfacher Hochpass: die tiefen Anteile herausrechnen, sonst rauscht es dumpf.
    let previous = 0;
    for (let i = 0; i < buffer.length; i++) {
        const current = buffer[i];
        buffer[i] = current - previous * 0.92;
        previous = current;
    }
    return buffer;
}

/** Marschtritt: drei gedämpfte Schläge — Truppen abgeschickt. */
function march() {
    const buffer = silence(0.75);
    for (const [index, start] of [0, 0.2, 0.4].entries()) {
        const length = Math.round(0.14 * SAMPLE_RATE);
        const env = envelope(length, {
            attack: 0.004,
            decay: 0.12,
            sustain: 0,
        });
        noise(buffer, {
            start,
            duration: 0.14,
            gain: 0.16,
            env,
            seed: 31 + index,
        });
        tone(buffer, {
            freq: 92,
            start,
            duration: 0.14,
            gain: 0.18,
            env,
        });
    }
    return buffer;
}

/** Klick: sehr kurz und leise — darf beim hundertsten Mal nicht nerven. */
function click() {
    const buffer = silence(0.06);
    const env = envelope(Math.round(0.04 * SAMPLE_RATE), {
        attack: 0.001,
        decay: 0.035,
        sustain: 0,
    });
    tone(buffer, { freq: 620, duration: 0.04, gain: 0.09, env });
    noise(buffer, { duration: 0.02, gain: 0.04, env, seed: 5 });
    return buffer;
}

/** Fehlerlaut: zwei absteigende Töne, unaufdringlich aber eindeutig. */
function denied() {
    const buffer = silence(0.4);
    const env = envelope(Math.round(0.16 * SAMPLE_RATE), {
        attack: 0.005,
        decay: 0.14,
        sustain: 0,
    });
    tone(buffer, { freq: 330, duration: 0.16, gain: 0.16, env });
    tone(buffer, {
        freq: 247,
        start: 0.15,
        duration: 0.16,
        gain: 0.16,
        env,
    });
    return buffer;
}

const SOUNDS = {
    'attack-incoming': horn,
    'build-complete': anvil,
    'report-arrived': parchment,
    'troops-sent': march,
    click,
    denied,
};

mkdirSync(SOUNDS_DIR, { recursive: true });

let totalBytes = 0;
for (const [name, generate] of Object.entries(SOUNDS)) {
    const wav = encodeWav(generate());
    writeFileSync(join(SOUNDS_DIR, `${name}.wav`), wav);
    totalBytes += wav.length;
    console.log(
        `    ${name}.wav — ${(wav.length / 1024).toFixed(1)} kB`,
    );
}

console.log(
    `✓ ${Object.keys(SOUNDS).length} Platzhalter-Klänge erzeugt (${(totalBytes / 1024).toFixed(1)} kB gesamt)`,
);
