import { describe, expect, it } from 'vitest';
import { continentOf } from '../src/index.js';

describe('Kontinente', () => {
    it('teilt die Karte in Hunderterblöcke', () => {
        expect(continentOf(357, 368)).toBe(33);
        expect(continentOf(521, 362)).toBe(35);
        expect(continentOf(99, 99)).toBe(0);
    });

    it('legt die Blockgrenze auf das Vielfache von 100', () => {
        expect(continentOf(99, 100)).toBe(10);
        expect(continentOf(100, 99)).toBe(1);
        expect(continentOf(100, 100)).toBe(11);
    });

    it('ist auf kleinen Karten überall K0', () => {
        // `mapSize` beginnt bei 20 — dort ist die Angabe bedeutungslos,
        // aber sie darf nicht springen.
        for (let x = 0; x < 20; x++) {
            for (let y = 0; y < 20; y++) {
                expect(continentOf(x, y)).toBe(0);
            }
        }
    });
});
