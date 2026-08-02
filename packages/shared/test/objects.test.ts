import { describe, expect, it } from 'vitest';
import { entriesOf, keysOf, type Units } from '../src/index.js';

describe('typisierte Object-Helfer', () => {
    it('entriesOf behält Schlüssel und Werte', () => {
        const units: Units = { spear: 10, axe: 5 };
        expect(entriesOf(units).sort()).toEqual(
            [
                ['axe', 5],
                ['spear', 10],
            ].sort(),
        );
    });

    it('entriesOf überspringt undefined-Werte', () => {
        const units: Units = { spear: 10, axe: undefined };
        expect(entriesOf(units)).toEqual([['spear', 10]]);
    });

    it('entriesOf behält Nullwerte (0 ist ein gültiger Wert)', () => {
        expect(entriesOf({ a: 0 })).toEqual([['a', 0]]);
    });

    it('keysOf liefert die Schlüssel', () => {
        expect(keysOf({ spear: 1, axe: 2 }).sort()).toEqual([
            'axe',
            'spear',
        ]);
    });

    it('arbeitet auf leeren Objekten', () => {
        expect(entriesOf({})).toEqual([]);
        expect(keysOf({})).toEqual([]);
    });
});
