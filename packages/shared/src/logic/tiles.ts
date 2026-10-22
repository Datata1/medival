/**
 * Kartenkacheln (plans/19-prototyp/19-7-karten-api-ausschnitt.md).
 *
 * Der Client lädt die Karte in festen Kacheln zu 20×20 Feldern statt alle
 * Dörfer der Welt auf einmal. Fest ausgerichtet (`x0 = ⌊x/20⌋·20`), damit sie
 * sich cachen lassen und dieselbe Kachel immer dieselbe Anfrage ist. Client
 * und Server rechnen mit denselben Funktionen.
 */

export const TILE_SIZE = 20;

/** Höchstens so viele Kacheln je Richtung in einer Anfrage (6×6 = 36). */
export const MAX_TILES_PER_SIDE = 6;

export interface TileRange {
    tx0: number;
    ty0: number;
    tx1: number;
    ty1: number;
}

export function tileOf(
    x: number,
    y: number,
): { tx: number; ty: number } {
    return {
        tx: Math.floor(x / TILE_SIZE),
        ty: Math.floor(y / TILE_SIZE),
    };
}

/** Alle Kacheln, die ein Feldrechteck berühren (Ränder eingeschlossen). */
export function tilesCovering(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
): TileRange {
    const a = tileOf(Math.min(x0, x1), Math.min(y0, y1));
    const b = tileOf(Math.max(x0, x1), Math.max(y0, y1));
    return { tx0: a.tx, ty0: a.ty, tx1: b.tx, ty1: b.ty };
}

export function tileKey(tx: number, ty: number): string {
    return `${tx}:${ty}`;
}

/** Das Feldrechteck einer Kachel, Ränder eingeschlossen. */
export function tileBounds(tx: number, ty: number) {
    return {
        x0: tx * TILE_SIZE,
        y0: ty * TILE_SIZE,
        x1: tx * TILE_SIZE + TILE_SIZE - 1,
        y1: ty * TILE_SIZE + TILE_SIZE - 1,
    };
}
