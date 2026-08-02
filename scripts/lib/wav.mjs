/**
 * Minimaler WAV-Schreiber und ein paar Synthesebausteine — ohne Fremdbibliothek
 * (siehe plans/13-sounds.md).
 *
 * WAV ist unkomprimiertes PCM mit einem kurzen Kopf: RIFF-Container, ein
 * `fmt `-Block mit den Eckdaten und ein `data`-Block mit den Abtastwerten.
 * Das lässt sich in wenigen Zeilen schreiben und reicht für kurze Platzhalter.
 */

/*
 * 22 050 Hz statt der üblichen 44 100: Für kurze Effekte ist der Unterschied
 * kaum hörbar, die Dateien werden aber halb so groß. WAV ist unkomprimiert,
 * deshalb zählt hier jedes Kilobyte (siehe plans/13-sounds.md).
 */
export const SAMPLE_RATE = 22050;

/** Schreibt 16-Bit-Mono-PCM als WAV. */
export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
    const data = Buffer.alloc(samples.length * 2);
    for (const [i, value] of samples.entries()) {
        // Begrenzen, sonst entstehen beim Überlauf hörbare Knackser.
        const clamped = Math.max(-1, Math.min(1, value));
        data.writeInt16LE(Math.round(clamped * 32767), i * 2);
    }

    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16); // Länge des fmt-Blocks
    header.writeUInt16LE(1, 20); // 1 = PCM, unkomprimiert
    header.writeUInt16LE(1, 22); // Mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28); // Bytes pro Sekunde
    header.writeUInt16LE(2, 32); // Bytes pro Abtastwert
    header.writeUInt16LE(16, 34); // Bittiefe
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(data.length, 40);

    return Buffer.concat([header, data]);
}

/** Leerer Puffer der gewünschten Länge. */
export function silence(seconds) {
    return new Float32Array(Math.round(seconds * SAMPLE_RATE));
}

/**
 * Hüllkurve: Anstieg, Halten, Abfall — ohne sie klingt jeder Ton nach einem
 * abgeschnittenen Piepsen.
 */
export function envelope(
    length,
    { attack = 0.01, decay = 0.3, sustain = 0.5 } = {},
) {
    const attackSamples = Math.round(attack * SAMPLE_RATE);
    const decaySamples = Math.round(decay * SAMPLE_RATE);
    return (i) => {
        if (i < attackSamples) return i / attackSamples;
        const afterAttack = i - attackSamples;
        if (afterAttack < decaySamples) {
            return 1 - (1 - sustain) * (afterAttack / decaySamples);
        }
        const remaining = length - attackSamples - decaySamples;
        const position =
            (afterAttack - decaySamples) / Math.max(1, remaining);
        return Math.max(0, sustain * (1 - position));
    };
}

/** Sinuston. */
export function tone(
    buffer,
    { freq, start = 0, duration, gain = 0.3, env },
) {
    const from = Math.round(start * SAMPLE_RATE);
    const length = Math.round(duration * SAMPLE_RATE);
    const shape = env ?? envelope(length);
    for (let i = 0; i < length && from + i < buffer.length; i++) {
        buffer[from + i] +=
            Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) *
            gain *
            shape(i);
    }
    return buffer;
}

/** Sägezahn — kerniger als ein Sinus, gut für Hörner und Blechiges. */
export function saw(
    buffer,
    { freq, start = 0, duration, gain = 0.2, env, harmonics = 6 },
) {
    const from = Math.round(start * SAMPLE_RATE);
    const length = Math.round(duration * SAMPLE_RATE);
    const shape = env ?? envelope(length);
    for (let i = 0; i < length && from + i < buffer.length; i++) {
        let value = 0;
        for (let h = 1; h <= harmonics; h++) {
            value +=
                Math.sin((2 * Math.PI * freq * h * i) / SAMPLE_RATE) /
                h;
        }
        buffer[from + i] += value * gain * shape(i);
    }
    return buffer;
}

/** Rauschen — Grundlage für Schläge, Rascheln und Metallisches. */
export function noise(
    buffer,
    { start = 0, duration, gain = 0.2, env, seed = 1 },
) {
    const from = Math.round(start * SAMPLE_RATE);
    const length = Math.round(duration * SAMPLE_RATE);
    const shape = env ?? envelope(length);
    // Eigener Zufallsgenerator, damit dieselben Dateien reproduzierbar entstehen.
    let state = seed >>> 0;
    for (let i = 0; i < length && from + i < buffer.length; i++) {
        state = (state * 1664525 + 1013904223) >>> 0;
        const random = (state / 0xffffffff) * 2 - 1;
        buffer[from + i] += random * gain * shape(i);
    }
    return buffer;
}
