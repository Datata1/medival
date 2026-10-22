import { describe, expect, it } from 'vitest';
import {
    TERRAIN_TYPES,
    type Terrain,
    terrainAt,
} from '../src/logic/terrain.js';

/** Anteile eines quadratischen Ausschnitts ab (0|0). */
function shares(seed: number, size: number): Record<Terrain, number> {
    const counts: Record<Terrain, number> = {
        plain: 0,
        forest: 0,
        hill: 0,
        water: 0,
    };
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) counts[terrainAt(seed, x, y)]++;
    for (const type of TERRAIN_TYPES)
        counts[type] = counts[type] / (size * size);
    return counts;
}

/**
 * Das Gelände wird nicht gespeichert, sondern von Client und Server aus dem
 * Weltseed gerechnet (plans/18-ux/18-3-karte.md). Diese Tests sichern genau
 * die Eigenschaften, auf denen dieser Verzicht auf eine Tabelle beruht.
 */
describe('terrainAt', () => {
    it('liefert für denselben Seed dasselbe Gelände', () => {
        for (let i = 0; i < 200; i++) {
            const x = i * 7 - 300;
            const y = 91 - i * 3;
            expect(terrainAt(4711, x, y)).toBe(terrainAt(4711, x, y));
        }
    });

    it('liefert für andere Seeds anderes Gelände', () => {
        let different = 0;
        for (let y = 0; y < 40; y++)
            for (let x = 0; x < 40; x++)
                if (terrainAt(1, x, y) !== terrainAt(2, x, y))
                    different++;
        // Zwei unabhängige Karten stimmen nur dort überein, wo beide Ebene
        // sind — bei ~70 % Ebene also grob in der Hälfte der Felder.
        expect(different).toBeGreaterThan(40 * 40 * 0.25);
    });

    /*
     * Der wichtigste Test dieser Datei. Der Client fragt die sichtbaren Felder
     * zeilenweise ab, der Server nur die paar Bauplätze, die er gerade würfelt.
     * Hinge das Ergebnis am Zustand eines fortlaufenden Zufallsgenerators,
     * zeichnete der Client eine andere Welt, als der Server angelegt hat.
     */
    it('hängt nicht von der Reihenfolge der Aufrufe ab', () => {
        const points: { x: number; y: number }[] = [];
        for (let y = 0; y < 20; y++)
            for (let x = 0; x < 20; x++) points.push({ x, y });

        const inOrder = points.map((p) => terrainAt(99, p.x, p.y));

        // Rückwärts, und mit fremden Abfragen dazwischen.
        const reversed = [...points].reverse().map((p) => {
            terrainAt(99, p.x + 1000, p.y - 500);
            terrainAt(12345, p.x, p.y);
            return terrainAt(99, p.x, p.y);
        });

        expect(reversed.reverse()).toEqual(inOrder);
    });

    it('trifft die geplanten Anteile: rund 70 % Ebene', () => {
        const s = shares(4711, 150);
        expect(s.plain).toBeGreaterThan(0.6);
        expect(s.plain).toBeLessThan(0.8);
        // Der Rest verteilt sich auf alle drei — keine Sorte darf verschwinden.
        for (const type of ['forest', 'hill', 'water'] as const) {
            expect(s[type], type).toBeGreaterThan(0.02);
            expect(s[type], type).toBeLessThan(0.2);
        }
    });

    /*
     * Der Anteil gilt über die ganze Karte gemittelt; `pickFreeSpot` braucht
     * ihn aber auf der kleinsten erlaubten Karte, auf der nur wenige
     * Rauschzellen liegen. Ein zu grobes Rauschen bestand den Test darüber und
     * ließ hier trotzdem nur ein Viertel der Fläche bebaubar.
     */
    it('lässt auch auf der kleinsten Karte genug Ebene übrig', () => {
        for (let seed = 1; seed <= 300; seed++) {
            expect(
                shares(seed, 20).plain,
                `Seed ${seed}`,
            ).toBeGreaterThan(0.4);
        }
    });

    it('zeichnet Flecken statt Streusel', () => {
        let same = 0;
        let total = 0;
        for (let y = 0; y < 100; y++)
            for (let x = 0; x < 99; x++) {
                total++;
                if (terrainAt(7, x, y) === terrainAt(7, x + 1, y))
                    same++;
            }

        /*
         * Gemessen wird gegen die Streusel-Erwartung: Wären die Felder
         * unabhängig gewürfelt, träfen zwei Nachbarn mit Wahrscheinlichkeit
         * Σ pᵢ² aufeinander — bei diesen Anteilen gut die Hälfte. Ein fester
         * Grenzwert wäre hier wertlos, weil er auch bei einem Rauschen
         * bestünde, das nur die Anteile trifft.
         */
        const s = shares(7, 100);
        const ifIndependent = TERRAIN_TYPES.reduce(
            (sum, type) => sum + s[type] ** 2,
            0,
        );
        expect(same / total).toBeGreaterThan(ifIndependent + 0.2);
    });

    it('kennt auch negative und weit entfernte Koordinaten', () => {
        for (const [x, y] of [
            [-1, -1],
            [-500, 320],
            [100_000, -100_000],
        ]) {
            expect(TERRAIN_TYPES).toContain(
                terrainAt(3, x ?? 0, y ?? 0),
            );
        }
    });
});
