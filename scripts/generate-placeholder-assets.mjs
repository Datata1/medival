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
    TERRAIN_SPRITES_16,
    UNIT_ICONS_16,
} from './lib/sprite-definitions.mjs';
import { KEYS, PALETTE, toGimpPalette } from './lib/sprite-palette.mjs';

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
        terrain: 'terrain',
        building: 'buildings',
        unit: 'units',
        yard: 'yard',
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

/** `#rrggbb` → [r, g, b]. */
function rgb(hex) {
    return [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
    ];
}

/**
 * Der Dorfplatz als Hintergrundbild (plans/18-ux/18-2-dorfuebersicht.md).
 *
 * Bewusst gerechnet statt gemalt: Ein handgeschriebenes Pixelbild wären hunderte
 * Zeilen Text, die niemand liest und die beim ersten eigenen Bild wieder
 * verschwinden. Die Rechnung liefert genau das, was der Platzhalter leisten
 * muss — eine Palisade, ein Platz darin, Wiese davor —, damit die Hotspots
 * darauf sichtbar sitzen.
 *
 * Es ist **kein Sprite**: Es steht nicht in der Registry und nicht unter
 * `sprites/`, weil es keine Bijektion Registry↔Datei mitmachen soll.
 */
function writeVillageYard(width, height) {
    const grass = rgb(PALETTE.grassDark);
    const grassLit = rgb(PALETTE.grassLight);
    const ground = rgb(PALETTE.stoneLight);
    const groundDark = rgb(PALETTE.stoneDark);
    const palisade = rgb(PALETTE.woodLight);
    const palisadeDark = rgb(PALETTE.woodDark);

    const rgba = new Uint8Array(width * height * 4);
    const cx = width / 2;
    const cy = height / 2;
    const rx = width * 0.46;
    const ry = height * 0.44;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Abstand zur Palisade in Vielfachen ihres Radius.
            const dx = (x + 0.5 - cx) / rx;
            const dy = (y + 0.5 - cy) / ry;
            const r = Math.hypot(dx, dy);
            /*
             * Ein Streumuster aus den Koordinaten statt eines Zufallsgenerators:
             * Derselbe Aufruf erzeugt immer dasselbe Bild, sonst wäre nach jedem
             * `pnpm assets:generate` eine geänderte Datei im Verzeichnisstand.
             */
            const hash = Math.imul(
                x * 374761393 + y * 668265263,
                1274126177,
            );
            const speckle = ((hash ^ (hash >>> 13)) >>> 0) % 100 < 22;
            let color;
            if (r > 1.02) color = speckle ? grassLit : grass;
            else if (r > 0.96)
                color = x % 3 === 0 ? palisadeDark : palisade;
            else color = speckle ? groundDark : ground;

            const i = (y * width + x) * 4;
            rgba[i] = color[0];
            rgba[i + 1] = color[1];
            rgba[i + 2] = color[2];
            rgba[i + 3] = 255;
        }
    }

    const file = join(ASSETS, 'backgrounds/village-yard.png');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, encodePng(width, height, rgba));
    return file;
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

// Das Gelände liegt in derselben Größe wie die Dörfer — es teilt sich mit
// ihnen das Feldraster der Karte (Plan 18-3).
for (const [id, rows] of Object.entries(TERRAIN_SPRITES_16))
    written.push(write(id, rows, 2));

/*
 * Die Gebäude auf dem Dorfplatz (Plan 18-2) sind dieselben Silhouetten in
 * 32×32 — verdoppelt wie die Kartendörfer. Sie sind eine eigene Familie und
 * nicht dieselbe Datei wie `building.*`, weil sie an ganz anderer Stelle
 * stehen: 16 px neben einer Zeile Text, 32 px auf dem Dorfplatz. Eine eigene
 * Zeichnung ersetzt später genau eine der beiden, ohne die andere zu stören.
 */
for (const [id, rows] of Object.entries(BUILDING_ICONS_16))
    written.push(
        write(`yard.${id.slice('building.'.length)}`, rows, 2),
    );

/*
 * Der Dorfplatz selbst: kein Sprite, sondern ein Hintergrundbild. Breit und
 * flach (5:2), weil die Übersicht die ganze Breite des Rahmens nutzt und die
 * Höhe der einzige knappe Wert ist: Unter den beiden Leisten aus 18-1 bleiben
 * bei 1280×800 rund 600 px, und davon will die Grafik nur den oberen Teil.
 */
const yardFile = writeVillageYard(480, 192);

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
    `✓ Dorfplatz geschrieben: ${yardFile.replace(ASSETS, 'assets/')}`,
);
console.log(
    `✓ Palette geschrieben: ${paletteFile.replace(ASSETS, 'assets/')}`,
);
