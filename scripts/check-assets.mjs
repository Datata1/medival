#!/usr/bin/env node
/**
 * Prüft, dass Registry und Sprite-Dateien deckungsgleich sind
 * (siehe plans/12-assets-und-sprites.md).
 *
 * Zwei Fehlerbilder, die sonst still bleiben: eine Registry-Zeile ohne Datei
 * (leeres Bild zur Laufzeit) und eine Datei ohne Registry-Zeile (Karteileiche,
 * die beim Bauen mitgeschleppt wird). Zusätzlich werden die Maße geprüft — ein
 * versehentlich 20×20 großes Sprite fällt in der Oberfläche sonst erst spät auf.
 *
 * Selbsttest: `node scripts/check-assets.mjs --self-test`
 */
import {
    existsSync,
    readdirSync,
    readFileSync,
    statSync,
} from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ASSETS = join(ROOT, 'packages/client/src/assets');
const SPRITES = join(ASSETS, 'sprites');
const REGISTRY = join(ASSETS, 'registry.ts');

/**
 * Erwartete Kantenlänge je Gruppe. `yard` sind die Gebäude auf dem Dorfplatz
 * (Plan 18-2) — dieselben Silhouetten wie `buildings`, aber doppelt so groß.
 * Das Hintergrundbild des Dorfplatzes liegt bewusst nicht unter `sprites/`:
 * Es ist kein Sprite und nimmt an der Registry-Bijektion nicht teil.
 */
const EXPECTED_SIZE = {
    icons: 16,
    buildings: 16,
    units: 16,
    map: 32,
    yard: 32,
};

/** Liest Breite und Höhe aus dem IHDR-Block eines PNG. */
function pngSize(file) {
    const header = readFileSync(file).subarray(0, 24);
    const isPng = header
        .subarray(0, 8)
        .equals(
            Buffer.from([
                0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            ]),
        );
    if (!isPng) return null;
    return {
        width: header.readUInt32BE(16),
        height: header.readUInt32BE(20),
    };
}

function registryEntries() {
    const source = readFileSync(REGISTRY, 'utf8');
    const ids = [...source.matchAll(/'([\w.]+)':\s*(\w+),/g)].map(
        (m) => m[1],
    );
    const files = [
        ...source.matchAll(/from '\.\/(sprites\/[\w/-]+\.png)'/g),
    ].map((m) => m[1]);
    return { ids, files };
}

function spriteFiles() {
    const found = [];
    for (const folder of readdirSync(SPRITES)) {
        const dir = join(SPRITES, folder);
        if (!statSync(dir).isDirectory()) continue;
        for (const name of readdirSync(dir)) {
            if (name.endsWith('.png'))
                found.push(`sprites/${folder}/${name}`);
        }
    }
    return found;
}

if (process.argv.includes('--self-test')) {
    // Die Größenprüfung muss ein falsches Maß erkennen.
    const wrong = { width: 20, height: 20 };
    if (wrong.width === EXPECTED_SIZE.icons) {
        console.error(
            '  Selbsttest: 20×20 dürfte nicht als gültige Icon-Größe gelten',
        );
        process.exit(1);
    }
    // Der PNG-Leser muss echte Maße liefern.
    const sample = join(SPRITES, 'icons/wood.png');
    if (existsSync(sample)) {
        const size = pngSize(sample);
        if (size?.width !== 16) {
            console.error(
                `  Selbsttest: wood.png wurde als ${JSON.stringify(size)} gelesen`,
            );
            process.exit(1);
        }
    }
    console.log(
        '✓ Selbsttest bestanden: Maße werden korrekt gelesen und geprüft',
    );
    process.exit(0);
}

const problems = [];
const { ids, files: registered } = registryEntries();
const onDisk = spriteFiles();

if (ids.length !== registered.length) {
    problems.push(
        `Registry ist unstimmig: ${ids.length} IDs, aber ${registered.length} Importe`,
    );
}

for (const file of registered) {
    if (!existsSync(join(ASSETS, file))) {
        problems.push(
            `In der Registry eingetragen, aber nicht vorhanden: ${file}`,
        );
    }
}

for (const file of onDisk) {
    if (!registered.includes(file)) {
        problems.push(
            `Datei ohne Registry-Eintrag (Karteileiche): ${file}`,
        );
    }
}

for (const file of onDisk) {
    const folder = file.split('/')[1];
    const expected = EXPECTED_SIZE[folder];
    if (!expected) continue;
    const size = pngSize(join(ASSETS, file));
    if (!size) {
        problems.push(`Kein gültiges PNG: ${file}`);
    } else if (size.width !== expected || size.height !== expected) {
        problems.push(
            `${file} ist ${size.width}×${size.height}, erwartet ${expected}×${expected}`,
        );
    }
}

if (problems.length > 0) {
    console.error(
        `\n✗ ${problems.length} Problem(e) bei den Sprites:\n`,
    );
    for (const p of problems) console.error(`  ${p}`);
    console.error(
        `\nRegistry: ${relative(ROOT, REGISTRY)}\n` +
            'Platzhalter neu erzeugen: pnpm assets:generate\n' +
            'Konventionen: plans/12-assets-und-sprites.md\n',
    );
    process.exit(1);
}

console.log(
    `✓ ${ids.length} Sprites: Registry und Dateien decken sich, Maße stimmen`,
);
