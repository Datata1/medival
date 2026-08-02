import type { VillageView } from '@medival/shared';
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
