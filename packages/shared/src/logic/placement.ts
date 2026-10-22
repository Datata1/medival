import type { Rng } from './rng.js';
import { terrainAt } from './terrain.js';

/**
 * Kreisförmige Besiedlung von der Kartenmitte aus
 * (plans/19-prototyp/19-6-weltkarte-kreisfoermige-besiedlung.md).
 *
 * Wie in Tribal Wars stehen die Dörfer in einem dichten, runden Haufen in der
 * Mitte, und jedes neue kommt an seinen Rand. Bei einer Zieldichte `d`
 * (Dörfer je Feld innerhalb des Kreises) braucht ein Kreis für `n` Dörfer den
 * Radius `r(n) = √(n / (π·d))`; das n-te Dorf landet in einem Ring um `r(n)`.
 * Mehr Regel braucht es nicht — der Haufen wird von selbst rund, gleichmäßig
 * dicht und wächst von innen nach außen.
 *
 * **Pur.** Kein Datenbankzugriff: Ob ein Feld frei ist, beantwortet der
 * hereingereichte `isFree`-Rückruf, der Zufall kommt aus einem eigenen
 * Strom. Dieselben Eingaben ergeben dasselbe Feld.
 */

/** Radiale Streuung um den Zielring, in Feldern. */
export const RING_WIDTH = 3;

/** Höchste Dichte, die sich mit Mindestabstand 1 verlässlich füllen lässt. */
export const MAX_SETTLEMENT_DENSITY = 0.2;

/** Wird geworfen, wenn die Karte für ein weiteres Dorf zu voll ist. */
export class MapFullError extends Error {
    constructor() {
        super('map_full');
        this.name = 'MapFullError';
    }
}

export function settlementRadius(n: number, density: number): number {
    return Math.sqrt(Math.max(0, n) / (Math.PI * density));
}

/** Größter nutzbarer Radius: ein Feld Rand und ein Feld Abstand. */
export function maxSettlementRadius(mapSize: number): number {
    return Math.floor(mapSize / 2) - 2;
}

/** Wie viele Dörfer eine Karte bei dieser Dichte fasst. */
export function settlementCapacity(
    mapSize: number,
    density: number,
): number {
    const r = maxSettlementRadius(mapSize);
    return Math.floor(Math.PI * r * r * density);
}

export interface PlacementInput {
    /** Das wievielte Dorf das ist (0 = das erste). */
    n: number;
    density: number;
    mapSize: number;
    rng: Rng;
    seed: number;
    isFree: (x: number, y: number) => boolean;
}

export function placeVillage(input: PlacementInput): {
    x: number;
    y: number;
} {
    const { n, density, mapSize, rng, seed, isFree } = input;
    const center = Math.floor(mapSize / 2);
    const maxR = maxSettlementRadius(mapSize);
    const target = settlementRadius(n, density);
    if (target > maxR) throw new MapFullError();

    // Das erste Dorf steht genau in der Mitte — dort beginnt die Besiedlung.
    if (n === 0 && isFree(center, center))
        return { x: center, y: center };

    const inside = (x: number, y: number) =>
        x >= 1 && y >= 1 && x <= mapSize - 2 && y <= mapSize - 2;

    /*
     * Zwei Durchgänge wie vor 19-6: erst nur Ebene, dann jedes freie Feld.
     * Das Gelände sperrt rund 30 % der Fläche; eine Welt, die sich deshalb
     * nicht anlegen ließe, wäre der schlechtere Fehler. Innerhalb eines
     * Durchgangs wird der Ring schrittweise breiter, falls er voll ist.
     */
    for (const plainOnly of [true, false]) {
        for (let widen = 1; widen <= 4; widen++) {
            const width = RING_WIDTH * widen;
            for (let attempt = 0; attempt < 200; attempt++) {
                const angle = rng() * 2 * Math.PI;
                const dist = Math.min(
                    maxR,
                    Math.abs(target + (rng() * 2 - 1) * width),
                );
                const x = Math.round(center + Math.cos(angle) * dist);
                const y = Math.round(center + Math.sin(angle) * dist);
                if (!inside(x, y)) continue;
                if (plainOnly && terrainAt(seed, x, y) !== 'plain')
                    continue;
                if (isFree(x, y)) return { x, y };
            }
        }
    }

    /*
     * Rückversicherung: Feld für Feld vom Zielring nach außen, dann nach
     * innen. Deterministisch und endlich — gibt es irgendwo im Kreis noch
     * Platz, wird er gefunden.
     */
    const rings = Math.ceil(target);
    const order = [
        ...Array.from(
            { length: maxR - rings + 1 },
            (_, i) => rings + i,
        ),
        ...Array.from({ length: rings }, (_, i) => rings - 1 - i),
    ];
    for (const r of order) {
        for (let dx = -r; dx <= r; dx++) {
            for (const dy of r === 0 ? [0] : [-r, r]) {
                for (const [x, y] of [
                    [center + dx, center + dy],
                    [center + dy, center + dx],
                ] as const) {
                    if (Math.hypot(x - center, y - center) > maxR)
                        continue;
                    if (inside(x, y) && isFree(x, y)) return { x, y };
                }
            }
        }
    }
    throw new MapFullError();
}

/**
 * Ein Feld ist frei, wenn weder es selbst noch eines seiner acht Nachbarn
 * belegt ist — Mindestabstand 1, damit der Haufen lesbar bleibt.
 */
export function spacedIsFree(
    occupied: (x: number, y: number) => boolean,
): (x: number, y: number) => boolean {
    return (x, y) => {
        for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
                if (occupied(x + dx, y + dy)) return false;
        return true;
    };
}
