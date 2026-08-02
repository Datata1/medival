import type {
    MovementInfo,
    MovementKind,
    MovementsResponse,
    VillageView,
} from '@medival/shared';
import {
    amountAtRate,
    type BuildingLevels,
    GameTime,
    type Resources,
    UNITS,
    type UnitType,
} from '@medival/shared';

/** Project the village's resource snapshot to the current game time. */
export function liveResources(
    v: VillageView,
    gameTime: GameTime,
): Resources {
    const elapsed = GameTime.between(v.gameTime, gameTime);
    return {
        wood: Math.min(
            v.capacity,
            v.resources.wood + amountAtRate(v.rates.wood, elapsed),
        ),
        clay: Math.min(
            v.capacity,
            v.resources.clay + amountAtRate(v.rates.clay, elapsed),
        ),
        iron: Math.min(
            v.capacity,
            v.resources.iron + amountAtRate(v.rates.iron, elapsed),
        ),
    };
}

/** Building levels including queued upgrades — mirrors the server's validation. */
export function effectiveLevels(v: VillageView): BuildingLevels {
    const levels = { ...v.buildings };
    for (const q of v.buildQueue) {
        levels[q.buildingType] = Math.max(
            levels[q.buildingType],
            q.targetLevel,
        );
    }
    return levels;
}

export interface MovementRow {
    movement: MovementInfo;
    incoming: boolean;
}

/**
 * Die Bewegungen **eines** Dorfes, nach Art gefiltert und nach Dringlichkeit
 * sortiert (plans/18-ux/18-2-dorfuebersicht.md).
 *
 * Der `MovementsStore` führt die Bewegungen aller eigenen Dörfer; die
 * Dorfübersicht zeigt nur, was hier ankommt oder von hier aufbricht. Ein
 * eingehender Angriff steht immer oben — die Karte zeigt nur die ersten
 * Zeilen, und ausgerechnet die eine, die zum Handeln zwingt, darf nicht unter
 * sechs Handelszügen verschwinden.
 */
export function movementRows(
    movements: Pick<MovementsResponse, 'incoming' | 'outgoing'>,
    villageId: number,
    kinds: readonly MovementKind[],
): MovementRow[] {
    const rows: MovementRow[] = [
        ...movements.incoming
            .filter(
                (m) =>
                    m.target?.id === villageId &&
                    kinds.includes(m.kind),
            )
            .map((movement) => ({ movement, incoming: true })),
        ...movements.outgoing
            .filter(
                (m) =>
                    m.origin?.id === villageId &&
                    kinds.includes(m.kind),
            )
            .map((movement) => ({ movement, incoming: false })),
    ];
    const urgency = (row: MovementRow) =>
        row.incoming && row.movement.kind === 'attack' ? 0 : 1;
    return rows.sort(
        (a, b) =>
            urgency(a) - urgency(b) ||
            a.movement.arrivalGameTime - b.movement.arrivalGameTime,
    );
}

/** Highest affordable unit count given live resources and free farm space. */
export function maxRecruitable(
    type: UnitType,
    live: Resources,
    popFree: number,
): number {
    const spec = UNITS[type];
    return Math.max(
        0,
        Math.floor(
            Math.min(
                spec.cost.wood > 0
                    ? live.wood / spec.cost.wood
                    : Infinity,
                spec.cost.clay > 0
                    ? live.clay / spec.cost.clay
                    : Infinity,
                spec.cost.iron > 0
                    ? live.iron / spec.cost.iron
                    : Infinity,
                spec.pop > 0 ? popFree / spec.pop : Infinity,
            ),
        ),
    );
}
