import { BUILDING_ORDER } from '../data/buildings.js';
import { ARCHER_UNITS, UNIT_ORDER } from '../data/units.js';
import type {
    BuildingType,
    UnitType,
    WorldSettings,
} from '../types.js';

type UnitOptions = Pick<WorldSettings, 'archers' | 'paladin'>;

/**
 * Welche Einheiten es in einer Welt gibt (plans/19-prototyp/19-12).
 *
 * Die einzige Stelle, die Welt-Optionen in Einheiten übersetzt: Server
 * (Rekrutierung, Bots) und Client (Tabellen, Formulare, Handbuch) fragen
 * hier, statt `settings.archers` selbst zu prüfen. So kann keine Liste eine
 * Einheit zeigen, die eine andere verbietet.
 */
export function unitsEnabled(settings: UnitOptions): UnitType[] {
    return UNIT_ORDER.filter((type) => isUnitEnabled(settings, type));
}

export function isUnitEnabled(
    settings: UnitOptions,
    type: UnitType,
): boolean {
    if (!settings.archers && ARCHER_UNITS.some((a) => a === type))
        return false;
    if (!settings.paladin && type === 'paladin') return false;
    return true;
}

/** Welche Gebäude es in einer Welt gibt — wie `unitsEnabled` (19-14). */
export function buildingsEnabled(
    settings: UnitOptions,
): BuildingType[] {
    return BUILDING_ORDER.filter((type) =>
        isBuildingEnabled(settings, type),
    );
}

export function isBuildingEnabled(
    settings: UnitOptions,
    type: BuildingType,
): boolean {
    return settings.paladin || type !== 'statue';
}
