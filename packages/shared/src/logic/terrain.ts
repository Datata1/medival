import { createRng } from './rng.js';

/**
 * Gelände (siehe plans/18-ux/18-3-karte.md).
 *
 * **Berechnet, nicht gespeichert.** Jede Welt trägt bereits einen `seed`;
 * daraus rechnen Client und Server dasselbe Gelände aus. Das spart eine
 * Tabelle, eine Migration und die Übertragung von `mapSize²` Feldern — und es
 * hält beide Seiten zwangsläufig synchron, solange diese Funktion rein bleibt.
 *
 * `terrainAt` darf deshalb **nicht** von der Aufrufreihenfolge abhängen: Der
 * Client fragt die sichtbaren Felder zeilenweise ab, der Server nur die paar
 * Bauplätze, die er gerade würfelt. Ein Zufallsgenerator mit fortlaufendem
 * Zustand würde hier zwei verschiedene Welten erzeugen. Für jeden Gitterpunkt
 * entsteht deshalb ein eigener `createRng` aus einem Hash seiner Koordinaten.
 */
export const TERRAIN_TYPES = [
    'plain',
    'forest',
    'hill',
    'water',
] as const;

export type Terrain = (typeof TERRAIN_TYPES)[number];

/**
 * Kantenlänge der beiden Rauschzellen in Feldern und ihr Mischungsverhältnis.
 *
 * Die grobe Lage macht die Flecken, die feine bricht ihre Ränder auf. Beide
 * Zahlen sind klein, und das ist der Punkt: Der Anteil Ebene gilt über die
 * ganze Karte gemittelt, aber `pickFreeSpot` braucht ihn **lokal** auf der
 * kleinsten erlaubten Karte. Mit einer einzelnen Lage à 7 Feldern deckt eine
 * Zelle dort ein Zehntel der Fläche ab; ein paar nasse Würfe ertränkten die
 * halbe Welt (gemessen: 26 % Ebene statt 70 %, zu wenig für die erlaubten
 * 100 Dörfer). Zwei feinere Lagen mitteln sich über eine 20×20-Karte
 * verlässlich aus — schlechtester von 2000 Seeds: 43 % Ebene.
 */
const COARSE_CELL = 4;
const FINE_CELL = 2;
const FINE_SHARE = 0.35;

/**
 * Zwei unabhängige Rauschfelder aus demselben Weltseed — Feuchte und Relief.
 * Ohne den Versatz wären Wald und Hügel dasselbe Bild.
 */
const MOISTURE = 0x1b87_3593;
const RELIEF = 0x0f4a_7c15;

/*
 * Schwellen der beiden Felder. Bilinear geglättetes Wertrauschen ist um 0.5
 * konzentriert, die Zahlen sind also nicht als Flächenanteile lesbar — sie
 * sind an der tatsächlichen Verteilung eingemessen (Test in
 * `test/terrain.test.ts`) und ergeben rund 70 % Ebene.
 */
const WATER_ABOVE = 0.74;
const FOREST_ABOVE = 0.645;
const HILL_ABOVE = 0.69;

/** Ortsfester Zufallswert eines Gitterpunkts, in [0,1). */
function cellValue(
    seed: number,
    layer: number,
    gx: number,
    gy: number,
): number {
    let h = Math.imul(seed ^ layer, 0x85eb_ca6b);
    h = Math.imul(h ^ Math.imul(gx, 0x27d4_eb2d), 0xc2b2_ae35);
    h = Math.imul(h ^ Math.imul(gy, 0x1656_67b1), 0x9e37_79b1);
    return createRng((h ^ (h >>> 15)) >>> 0)();
}

/** Weiche Übergangskurve; ohne sie bekämen die Flecken sichtbare Kanten. */
function fade(t: number): number {
    return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Wertrauschen einer Lage: vier Gitterpunkte, bilinear geglättet interpoliert. */
function octave(
    seed: number,
    layer: number,
    cell: number,
    x: number,
    y: number,
): number {
    const cx = x / cell;
    const cy = y / cell;
    const gx = Math.floor(cx);
    const gy = Math.floor(cy);
    const fx = fade(cx - gx);
    const fy = fade(cy - gy);
    return lerp(
        lerp(
            cellValue(seed, layer, gx, gy),
            cellValue(seed, layer, gx + 1, gy),
            fx,
        ),
        lerp(
            cellValue(seed, layer, gx, gy + 1),
            cellValue(seed, layer, gx + 1, gy + 1),
            fx,
        ),
        fy,
    );
}

/** Beide Lagen übereinander, wieder in [0,1). */
function noise(
    seed: number,
    layer: number,
    x: number,
    y: number,
): number {
    return (
        (1 - FINE_SHARE) * octave(seed, layer, COARSE_CELL, x, y) +
        FINE_SHARE *
            // Der Versatz der Lage trennt die Gitter: Ohne ihn träfen grobe und
            // feine Zelle an jedem Vielfachen von 4 auf denselben Zufallswert.
            octave(seed, layer ^ 0x5bf0_3635, FINE_CELL, x, y)
    );
}

/**
 * Das Gelände eines Feldes. Rein, zustandslos und für dieselben Argumente
 * immer dasselbe Ergebnis.
 *
 * Die Reihenfolge der Prüfungen ist Absicht: Wasser braucht mehr Feuchte als
 * Wald, also säumt Wald jeden See, statt dass Wasser unvermittelt in der Ebene
 * steht.
 */
export function terrainAt(seed: number, x: number, y: number): Terrain {
    const moisture = noise(seed, MOISTURE, x, y);
    if (moisture > WATER_ABOVE) return 'water';
    if (noise(seed, RELIEF, x, y) > HILL_ABOVE) return 'hill';
    if (moisture > FOREST_ABOVE) return 'forest';
    return 'plain';
}
