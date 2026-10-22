import {
    MapFullError,
    maxSettlementRadius,
    placeVillage,
    RING_WIDTH,
    STARTING_BUILDINGS,
    settlementRadius,
    spacedIsFree,
} from '@medival/shared';
import { scheduleBarbarianTick } from '../ai/barbarian.js';
import { GameError } from './errors.js';
import {
    insertBarbarian,
    insertVillage,
    rollBarbarian,
} from './mapgen.js';
import { villagesInBox } from './spatial.js';
import type { World } from './world.js';

/**
 * Einen Spieler in einer laufenden Welt ansiedeln
 * (plans/19-prototyp/19-6): sein Dorf am Rand des Siedlungskreises, dazu
 * `barbariansPerSettler` Barbarendörfer im selben Ring — sonst stünden die
 * Farmziele alle in der Mitte, und wer neu dazukommt, hätte keine.
 *
 * 19-9 ruft das beim Beitreten einer Welt auf. Liefert die ID des neuen
 * Dorfes; `map_full`, wenn der Kreis den Kartenrand erreicht hat.
 */
export function settleNewPlayer(
    world: World,
    playerId: number,
    villageName: string,
): number {
    const { settings } = world;
    const center = Math.floor(settings.mapSize / 2);

    /*
     * Belegte Felder einmal für die Umgebung des Rings lesen statt je
     * geprüftem Feld; nur die Rückfall-Suche fragt außerhalb einzeln nach.
     */
    const reach =
        settlementRadius(
            world.settledCount + settings.barbariansPerSettler + 1,
            settings.settlementDensity,
        ) +
        RING_WIDTH * 4 +
        2;
    const known = new Set(
        villagesInBox(
            world,
            center - reach,
            center - reach,
            center + reach,
            center + reach,
        ).map((v) => `${v.x},${v.y}`),
    );
    const occupied = (x: number, y: number) =>
        Math.abs(x - center) <= reach && Math.abs(y - center) <= reach
            ? known.has(`${x},${y}`)
            : villagesInBox(world, x, y, x, y).length > 0;
    const isFree = spacedIsFree(occupied);

    const place = () => {
        try {
            const spot = placeVillage({
                n: world.settledCount,
                density: settings.settlementDensity,
                mapSize: settings.mapSize,
                rng: world.rng.next,
                seed: settings.seed,
                isFree,
            });
            known.add(`${spot.x},${spot.y}`);
            world.settledCount++;
            return spot;
        } catch (error) {
            if (error instanceof MapFullError)
                throw new GameError('map_full');
            throw error;
        }
    };

    let villageId = 0;
    world.sqlite.transaction(() => {
        const home = place();
        villageId = insertVillage(
            world.db,
            playerId,
            home.x,
            home.y,
            villageName,
            { ...STARTING_BUILDINGS },
        );
        for (let i = 0; i < settings.barbariansPerSettler; i++) {
            // Ist für Barbaren kein Platz mehr, siedelt der Spieler trotzdem.
            if (
                settlementRadius(
                    world.settledCount,
                    settings.settlementDensity,
                ) > maxSettlementRadius(settings.mapSize)
            )
                break;
            const id = insertBarbarian(
                world.db,
                place(),
                rollBarbarian(world.rng.next),
            );
            scheduleBarbarianTick(world, id, world.rng.next);
        }
    })();
    world.persist();
    world.broadcast({ type: 'map_changed' });
    return villageId;
}
