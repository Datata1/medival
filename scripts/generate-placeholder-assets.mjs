#!/usr/bin/env node
/**
 * Erzeugt die Platzhalter-Sprites (siehe plans/12-assets-und-sprites.md).
 *
 * Die Bilder entstehen aus den lesbaren Pixelkarten in `lib/sprite-definitions.mjs`
 * und werden ohne Fremdbibliothek als PNG geschrieben. Jeder Platzhalter lässt
 * sich einzeln durch eine eigene Zeichnung ersetzen — gleicher Dateiname,
 * gleiche Größe, fertig.
 *
 * Aufruf: `pnpm assets:generate`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { encodePng, spriteFromRows } from './lib/png.mjs';
import {
    BUILDING_ICONS_16,
    ICONS_16,
    MAP_SPRITES_16,
    UNIT_ICONS_16,
} from './lib/sprite-definitions.mjs';
import { KEYS, toGimpPalette } from './lib/sprite-palette.mjs';

const ASSETS = new URL(
    '../packages/client/src/assets/',
    import.meta.url,
).pathname;

/** Wo landet welche Sprite-ID? Spiegelbild der Registry im Client. */
function pathFor(id) {
    const [group, ...rest] = id.split('.');
    const name = rest.join('-');
    const folder = {
        icon: 'icons',
        map: 'map',
        building: 'buildings',
        unit: 'units',
    }[group];
    if (!folder) throw new Error(`Unbekannte Sprite-Gruppe in '${id}'`);
    return join(ASSETS, 'sprites', folder, `${name}.png`);
}

function write(id, rows, scale) {
    const { width, height, rgba } = spriteFromRows(rows, KEYS, scale);
    const file = pathFor(id);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, encodePng(width, height, rgba));
    return { id, file, size: `${width}×${height}` };
}

const written = [];

// UI-, Gebäude- und Einheiten-Icons bleiben 16×16.
for (const [id, rows] of Object.entries(ICONS_16))
    written.push(write(id, rows, 1));
for (const [id, rows] of Object.entries(BUILDING_ICONS_16))
    written.push(write(id, rows, 1));
for (const [id, rows] of Object.entries(UNIT_ICONS_16))
    written.push(write(id, rows, 1));

// Kartendörfer werden auf die Zielgröße 32×32 verdoppelt (Platzhalter-Abkürzung,
// eigene Sprites sollten echte 32×32 sein).
for (const [id, rows] of Object.entries(MAP_SPRITES_16))
    written.push(write(id, rows, 2));

// Palette für LibreSprite/Aseprite mitliefern.
const paletteFile = join(ASSETS, 'palette.gpl');
writeFileSync(paletteFile, toGimpPalette());

const bySize = written.reduce((acc, w) => {
    acc[w.size] = (acc[w.size] ?? 0) + 1;
    return acc;
}, {});

console.log(`✓ ${written.length} Platzhalter-Sprites erzeugt`);
for (const [size, count] of Object.entries(bySize))
    console.log(`    ${count}× ${size}`);
console.log(
    `✓ Palette geschrieben: ${paletteFile.replace(ASSETS, 'assets/')}`,
);
