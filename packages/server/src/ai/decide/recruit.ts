import {
    canAfford,
    entriesOf,
    farmCapacity,
    type Resources,
    UNITS,
    type UnitType,
    unitCost,
} from '@medival/shared';
import {
    PERSONALITY_WEIGHTS,
    type Personality,
} from '../personalities.js';
import type { VillageSnapshot } from './build.js';

/**
 * Truppenaushebung (siehe plans/17-staemme-und-krieg.md).
 *
 * **Pure Funktion** — durchgesetzt von `scripts/check-ai-purity.mjs`.
 *
 * Ohne diesen Baustein gäbe es keinen Krieg: Plan 15 hat Bots das Bauen
 * beigebracht, aber nie das Rekrutieren. In der ersten Kriegswoche stand
 * deshalb kein einziger Angriff in den Bewegungen — die Bots hatten schlicht
 * keine Truppen.
 */

export interface RecruitChoice {
    unit: UnitType;
    count: number;
}

/** Wie viel des Lagers je Runde in Truppen fließen darf. */
const RECRUIT_BUDGET = 0.35;
/** Höchstzahl je Auftrag — lieber öfter wenig als einmal alles. */
const BATCH = 10;
/**
 * Reserve an Bevölkerung, die frei bleibt. Ein Dorf, das seinen Bauernhof mit
 * Truppen füllt, kann nichts mehr bauen.
 */
const POP_RESERVE = 0.15;

/**
 * Angestrebte **Zusammensetzung** des Heeres je Persönlichkeit, als Anteile.
 *
 * Bewusst eine Mischung und keine Rangfolge: Der erste Entwurf war eine
 * Prioritätenliste, und weil der Speerträger überall vorn stand, hob **jeder**
 * Bot ausschließlich Speerträger aus. Nach einer Spielwoche hatten alle acht
 * Bots reine Verteidigungsheere und griffen folgerichtig nie an.
 *
 * Rekrutiert wird jeweils die Einheit, die am weitesten unter ihrem Anteil
 * liegt — deterministisch und ohne Zufall.
 */
const TARGET_MIX: Record<
    Personality,
    Partial<Record<UnitType, number>>
> = {
    // Verteidigt und greift nicht an — bleibt bewusst ohne Offensive.
    turtle: { spear: 0.7, sword: 0.3 },
    // Plündert: Äxte, dazu leichte Kavallerie für die Beute.
    raider: { axe: 0.6, light_cavalry: 0.25, spear: 0.15 },
    // Wächst, hält aber die Dörfer: halb und halb.
    expander: { spear: 0.5, axe: 0.5 },
    balanced: { spear: 0.4, axe: 0.4, sword: 0.2 },
};

/**
 * Was ein Dorf als Nächstes ausheben sollte — oder `null`.
 *
 * `resources` ist das, was **nach** dem geplanten Bau übrig bleibt: Bauen hat
 * Vorrang, Truppen kommen aus dem Rest.
 */
export function decideRecruit(
    village: VillageSnapshot,
    resources: Resources,
    personality: Personality,
    recruiting: boolean,
): RecruitChoice | null {
    if (recruiting) return null;

    const popMax = farmCapacity(village.levels.farm);
    const popFree = popMax * (1 - POP_RESERVE) - village.popInUse;
    if (popFree <= 0) return null;

    const budget: Resources = {
        wood: resources.wood * RECRUIT_BUDGET,
        clay: resources.clay * RECRUIT_BUDGET,
        iron: resources.iron * RECRUIT_BUDGET,
    };
    const weights = PERSONALITY_WEIGHTS[personality];

    const mix = TARGET_MIX[personality];
    const total = Math.max(
        1,
        entriesOf(village.units).reduce((s, [, n]) => s + n, 0),
    );

    // Die Einheit mit dem größten Rückstand auf ihren Zielanteil zuerst.
    const ranked = entriesOf(mix)
        .map(([unit, share]) => ({
            unit,
            deficit: share - (village.units[unit] ?? 0) / total,
        }))
        .sort((a, b) => b.deficit - a.deficit);

    for (const { unit, deficit } of ranked) {
        if (deficit <= 0) continue;
        const spec = UNITS[unit];
        // Das Gebäude muss stehen; Voraussetzungen prüft `recruitUnits` erneut.
        if (village.levels[spec.recruitedAt] < 1) continue;

        const count = Math.min(BATCH, Math.floor(popFree / spec.pop));
        if (count < 1) continue;
        if (!canAfford(budget, unitCost(unit, count))) continue;

        // Die Mischung entscheidet *was*, die Aggression *wie viel*.
        const scaled = Math.max(
            1,
            Math.round(count * Math.min(1, weights.aggression + 0.4)),
        );
        return { unit, count: scaled };
    }
    return null;
}
