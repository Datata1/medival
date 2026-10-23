import { RESEARCH } from '../data/research.js';
import { UNITS } from '../data/units.js';
import { entriesOf } from '../lib/objects.js';
import type { BuildingLevels, UnitSpec, UnitType } from '../types.js';

/** Warum eine Forschung nicht geht — oder `null`, wenn sie geht. */
export type ResearchBlock =
    | 'no_research_needed'
    | 'already_researched'
    | 'smithy_too_low'
    | 'requirements_missing';

export function researchBlock(
    unit: UnitType,
    levels: BuildingLevels,
    researched: readonly UnitType[],
): ResearchBlock | null {
    const spec = RESEARCH[unit];
    if (spec === null) return 'no_research_needed';
    if (researched.includes(unit)) return 'already_researched';
    if (levels.smithy < spec.smithy) return 'smithy_too_low';
    if (
        spec.requires &&
        entriesOf(spec.requires).some(([b, min]) => levels[b] < min)
    )
        return 'requirements_missing';
    return null;
}

/** Ist die Einheit in diesem Dorf erforscht (oder braucht keine Forschung)? */
export function isResearched(
    unit: UnitType,
    researched: readonly UnitType[],
): boolean {
    return RESEARCH[unit] === null || researched.includes(unit);
}

export type RecruitBlock =
    | `${UnitSpec['recruitedAt']}_missing`
    | 'not_researched';

/**
 * Warum eine Einheit nicht ausgebildet werden kann — oder `null`.
 *
 * Der einzige Ort der Rekrutierungs-Voraussetzungen (19-13): Server, Bots und
 * Client fragen hier. Vorher prüfte jeder für sich nur das Gebäude.
 */
export function recruitBlock(
    unit: UnitType,
    levels: BuildingLevels,
    researched: readonly UnitType[],
): RecruitBlock | null {
    const building = UNITS[unit].recruitedAt;
    if (levels[building] < 1) return `${building}_missing`;
    if (!isResearched(unit, researched)) return 'not_researched';
    return null;
}

export function canRecruit(
    unit: UnitType,
    levels: BuildingLevels,
    researched: readonly UnitType[],
): boolean {
    return recruitBlock(unit, levels, researched) === null;
}
