import {
    canAfford,
    type Resources,
    researchBlock,
    researchCost,
    type UnitType,
} from '@medival/shared';
import type { Personality } from '../personalities.js';
import type { VillageSnapshot } from './build.js';

/**
 * Forschung in der Schmiede (plans/19-prototyp/19-13).
 *
 * **Pure Funktion** — durchgesetzt von `scripts/check-ai-purity.mjs`.
 *
 * Eine Reihenfolge je Persönlichkeit, passend zu ihrer Heeresmischung
 * (`decide/recruit.ts`): Was dort einen Anteil hat, wird hier früh
 * erforscht. Geforscht wird die erste Einheit der Liste, die gerade geht —
 * ist sie noch nicht bezahlbar, wartet der Bot auf sie, statt eine spätere
 * vorzuziehen und die wichtige nie zu bekommen.
 */
const RESEARCH_ORDER: Record<Personality, readonly UnitType[]> = {
    turtle: ['sword', 'archer', 'spy', 'heavy_cavalry'],
    raider: [
        'axe',
        'light_cavalry',
        'spy',
        'mounted_archer',
        'ram',
        'catapult',
    ],
    expander: ['axe', 'spy', 'light_cavalry', 'ram'],
    balanced: ['axe', 'sword', 'spy', 'light_cavalry', 'ram'],
};

export function decideResearch(
    village: VillageSnapshot,
    /** Was nach dem geplanten Bau übrig bleibt — Bauen geht vor. */
    resources: Resources,
    personality: Personality,
    enabledUnits: readonly UnitType[],
): UnitType | null {
    if (village.researching) return null;
    for (const unit of RESEARCH_ORDER[personality]) {
        if (!enabledUnits.includes(unit)) continue;
        const block = researchBlock(
            unit,
            village.levels,
            village.researched,
        );
        if (block === 'already_researched') continue;
        // Schmiede zu klein oder Nebengebäude fehlt: Später geht es weiter
        // mit dieser Einheit, nicht mit der nächsten.
        if (block !== null) return null;
        return canAfford(resources, researchCost(unit)) ? unit : null;
    }
    return null;
}
