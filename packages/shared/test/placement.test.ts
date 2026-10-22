import { describe, expect, it } from 'vitest';
import { continentOf } from '../src/logic/continent.js';
import {
    MapFullError,
    placeVillage,
    RING_WIDTH,
    settlementCapacity,
    settlementRadius,
    spacedIsFree,
} from '../src/logic/placement.js';
import { createRng } from '../src/logic/rng.js';

/** Platziert `count` Dörfer wie die Kartengenerierung und liefert sie in Reihenfolge. */
function settle(
    count: number,
    { mapSize = 1000, density = 0.15, seed = 42 } = {},
) {
    const taken = new Set<string>();
    const isFree = spacedIsFree((x, y) => taken.has(`${x},${y}`));
    const rng = createRng(seed);
    const spots: { x: number; y: number }[] = [];
    for (let n = 0; n < count; n++) {
        const spot = placeVillage({
            n,
            density,
            mapSize,
            rng,
            seed,
            isFree,
        });
        taken.add(`${spot.x},${spot.y}`);
        spots.push(spot);
    }
    return spots;
}

const dist = (s: { x: number; y: number }, c = 500) =>
    Math.hypot(s.x - c, s.y - c);

describe('Kreisförmige Besiedlung (19-6)', () => {
    const spots = settle(5_000);

    it('belegt kein Feld doppelt und kein Nachbarfeld', () => {
        const keys = new Set(spots.map((s) => `${s.x},${s.y}`));
        expect(keys.size).toBe(spots.length);
        for (const s of spots) {
            let neighbours = 0;
            for (let dx = -1; dx <= 1; dx++)
                for (let dy = -1; dy <= 1; dy++)
                    if (
                        (dx || dy) &&
                        keys.has(`${s.x + dx},${s.y + dy}`)
                    )
                        neighbours++;
            expect(neighbours).toBe(0);
        }
    });

    it('beginnt genau in der Mitte', () => {
        expect(spots[0]).toEqual({ x: 500, y: 500 });
    });

    it('wächst rund von innen nach außen', () => {
        // Das n-te Dorf liegt im Ring um r(n); erlaubt ist die Streuung plus
        // ein Feld Rundung. Ein kleiner Anteil darf aus breiteren Ringen
        // stammen (Gelände, volle Stellen).
        let outside = 0;
        spots.forEach((s, n) => {
            const r = settlementRadius(n, 0.15);
            if (Math.abs(dist(s) - r) > RING_WIDTH + 1) outside++;
        });
        expect(outside / spots.length).toBeLessThan(0.05);
    });

    it('erreicht die Zieldichte im Kreis', () => {
        const r = settlementRadius(2_000, 0.15);
        const inside = spots.filter((s) => dist(s) <= r).length;
        const density = inside / (Math.PI * r * r);
        expect(density).toBeGreaterThan(0.15 * 0.8);
        expect(density).toBeLessThan(0.15 * 1.2);
    });

    it('belegt zuerst die vier Kontinente um die Mitte', () => {
        const first = new Set(
            spots.slice(0, 300).map((s) => continentOf(s.x, s.y)),
        );
        expect([...first].sort()).toEqual([44, 45, 54, 55]);
    });

    it('ist deterministisch', () => {
        expect(settle(500)).toEqual(spots.slice(0, 500));
    });
});

describe('Kontinente auf 1000×1000', () => {
    it('teilt in 100 Kontinente K00–K99', () => {
        expect(continentOf(0, 0)).toBe(0);
        expect(continentOf(999, 999)).toBe(99);
        expect(continentOf(500, 500)).toBe(55);
        expect(continentOf(499, 499)).toBe(44);
    });
});

describe('Kartenrand', () => {
    it('meldet eine volle Karte, statt endlos zu suchen', () => {
        const capacity = settlementCapacity(40, 0.15);
        expect(() => settle(capacity, { mapSize: 40 })).not.toThrow();
        expect(() => settle(capacity + 40, { mapSize: 40 })).toThrow(
            MapFullError,
        );
    });
});
