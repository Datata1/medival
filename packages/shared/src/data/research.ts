import type { BuildingLevels, Resources, UnitType } from '../types.js';
import { UNITS } from './units.js';

/**
 * Forschung in der Schmiede (plans/19-prototyp/19-13): eine Freischaltung je
 * Einheit, keine Forschungsstufen. `null` heißt: braucht keine Forschung —
 * der Speerträger von Anfang an, das Adelsgeschlecht über den Adelshof.
 *
 * Schmiedenstufen und weitere Voraussetzungen nach Tribal Wars. Kosten und
 * Dauer sind eigene Werte: das Achtfache der Einheitenkosten und das
 * Vierfache ihrer Ausbildungszeit. So bleibt eine Forschung teurer als ein
 * kleiner Trupp, und eine neue Einheit macht sie mit, ohne eigene Tabelle.
 */
export interface ResearchSpec {
    smithy: number;
    requires?: Partial<BuildingLevels>;
}

export const RESEARCH: Record<UnitType, ResearchSpec | null> = {
    spear: null,
    sword: { smithy: 1 },
    axe: { smithy: 2 },
    archer: { smithy: 5 },
    spy: { smithy: 1, requires: { stable: 1 } },
    light_cavalry: { smithy: 3, requires: { stable: 1 } },
    mounted_archer: { smithy: 7, requires: { stable: 1 } },
    heavy_cavalry: { smithy: 15, requires: { stable: 10 } },
    ram: { smithy: 2, requires: { workshop: 1 } },
    catapult: { smithy: 12, requires: { workshop: 2 } },
    noble: null,
};

export const RESEARCH_COST_FACTOR = 8;
export const RESEARCH_TIME_FACTOR = 4;

export function researchCost(unit: UnitType): Resources {
    const c = UNITS[unit].cost;
    return {
        wood: c.wood * RESEARCH_COST_FACTOR,
        clay: c.clay * RESEARCH_COST_FACTOR,
        iron: c.iron * RESEARCH_COST_FACTOR,
    };
}

/** Forschungszeit in Sekunden bei Weltgeschwindigkeit 1. */
export function researchTimeS(unit: UnitType): number {
    return UNITS[unit].recruitTimeS * RESEARCH_TIME_FACTOR;
}
