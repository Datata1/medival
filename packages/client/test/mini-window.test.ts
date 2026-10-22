import { describe, expect, it } from 'vitest';
import { MINI_SPAN, miniWindow } from '../src/features/map/derive.js';

describe('Übersichtsausschnitt (19-6)', () => {
    it('zeigt 100×100 Felder um die Kamera', () => {
        expect(miniWindow({ x: 500, y: 500 }, 1000)).toEqual({
            x0: 450,
            y0: 450,
            span: MINI_SPAN,
        });
    });

    it('bleibt am Weltrand innerhalb der Welt', () => {
        expect(miniWindow({ x: 10, y: 995 }, 1000)).toEqual({
            x0: 0,
            y0: 900,
            span: 100,
        });
    });

    it('zeigt kleine Welten ganz', () => {
        expect(miniWindow({ x: 20, y: 20 }, 40)).toEqual({
            x0: 0,
            y0: 0,
            span: 40,
        });
    });
});
