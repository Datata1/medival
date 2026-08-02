import type { MovementInfo, MovementKind } from '@medival/shared';
import { GameTime } from '@medival/shared';
import { describe, expect, it } from 'vitest';
import { movementRows } from '../src/features/village/derive.js';

const TROOPS: readonly MovementKind[] = ['attack', 'support'];

function movement(
    id: number,
    kind: MovementKind,
    { from, to, at }: { from: number; to: number; at: number },
): MovementInfo {
    const village = (villageId: number) => ({
        id: villageId,
        name: `Dorf ${villageId}`,
        x: villageId,
        y: villageId,
    });
    return {
        id,
        kind,
        origin: village(from),
        target: village(to),
        arrivalGameTime: GameTime.of(at),
        units: null,
    };
}

/**
 * Die Auswahl der Zeilen für die Dorfübersicht steht als reine Funktion in
 * `derive.ts` und nicht in der Komponente — sonst ließe sie sich nur mit einem
 * gerenderten Dorf und einem echten Angriff prüfen, und genau der lässt sich
 * nicht auf Zuruf herbeiführen (plans/18-ux/18-2-dorfuebersicht.md).
 */
describe('Bewegungen der Dorfübersicht', () => {
    const movements = {
        incoming: [
            movement(1, 'trade', { from: 9, to: 1, at: 100 }),
            movement(2, 'attack', { from: 9, to: 1, at: 500 }),
            movement(3, 'attack', { from: 9, to: 2, at: 50 }),
        ],
        outgoing: [
            movement(4, 'support', { from: 1, to: 8, at: 200 }),
            movement(5, 'trade', { from: 2, to: 8, at: 20 }),
        ],
    };

    it('nimmt nur die Bewegungen dieses Dorfes', () => {
        const rows = movementRows(movements, 1, TROOPS);
        expect(rows.map((r) => r.movement.id)).toEqual([2, 4]);
    });

    it('trennt nach Art: Lieferungen gehören in die andere Karte', () => {
        const rows = movementRows(movements, 1, ['trade']);
        expect(rows.map((r) => r.movement.id)).toEqual([1]);
        expect(rows[0]?.incoming).toBe(true);
    });

    it('stellt den eingehenden Angriff nach oben, auch wenn er später ankommt', () => {
        // Die Karte zeigt nur die ersten Zeilen — der Angriff darf nicht
        // unter die Handelszüge rutschen, nur weil sie früher eintreffen.
        const rows = movementRows(movements, 1, ['attack', 'trade']);
        expect(rows.map((r) => r.movement.id)).toEqual([2, 1]);
    });

    it('sortiert den Rest nach Ankunft', () => {
        const rows = movementRows(
            {
                incoming: [],
                outgoing: [
                    movement(6, 'support', { from: 1, to: 8, at: 300 }),
                    movement(7, 'support', { from: 1, to: 9, at: 100 }),
                ],
            },
            1,
            TROOPS,
        );
        expect(rows.map((r) => r.movement.id)).toEqual([7, 6]);
    });
});
