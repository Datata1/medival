import { ARCHER_UNITS, UNIT_ORDER } from '../data/units.js';
import type { UnitType, WorldSettings } from '../types.js';

/**
 * Welche Einheiten es in einer Welt gibt (plans/19-prototyp/19-12).
 *
 * Die einzige Stelle, die Welt-Optionen in Einheiten übersetzt: Server
 * (Rekrutierung, Bots) und Client (Tabellen, Formulare, Handbuch) fragen
 * hier, statt `settings.archers` selbst zu prüfen. So kann keine Liste eine
 * Einheit zeigen, die eine andere verbietet.
 */
export function unitsEnabled(
    settings: Pick<WorldSettings, 'archers'>,
): UnitType[] {
    return UNIT_ORDER.filter((type) => isUnitEnabled(settings, type));
}

export function isUnitEnabled(
    settings: Pick<WorldSettings, 'archers'>,
    type: UnitType,
): boolean {
    if (!settings.archers && ARCHER_UNITS.some((a) => a === type))
        return false;
    return true;
}
