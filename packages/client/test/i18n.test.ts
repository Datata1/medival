import { describe, expect, it } from 'vitest';
import de from '../src/i18n/de.js';
import { apiErrorMessage } from '../src/lib/errors.js';

describe('API-Fehlerübersetzung', () => {
    it('übersetzt Server-Fehlercodes ins Deutsche', () => {
        expect(apiErrorMessage(new Error('not_enough_resources'))).toBe(
            'Nicht genug Rohstoffe',
        );
        expect(apiErrorMessage(new Error('farm_too_small'))).toBe(
            'Bauernhof zu klein',
        );
        expect(apiErrorMessage(new Error('support_own_only'))).toBe(
            'Unterstützung nur für eigene Dörfer',
        );
    });

    it('zeigt unbekannte Fehler roh an, statt einen leeren String zu rendern', () => {
        expect(apiErrorMessage(new Error('HTTP 503'))).toBe('HTTP 503');
    });
});

describe('Katalog-Vollständigkeit', () => {
    it('deckt jeden GameError-Code des Servers ab', () => {
        // Bewusst dupliziert statt importiert: die Liste ist der Vertrag
        // zwischen Server-Codes und Client-Katalog.
        const serverCodes = [
            'village_not_found',
            'player_not_found',
            'world_not_found',
            'invalid_building',
            'invalid_unit',
            'invalid_count',
            'invalid_movement',
            'queue_full',
            'max_level',
            'requirements_missing',
            'farm_too_small',
            'not_enough_resources',
            'barracks_missing',
            'stable_missing',
            'academy_missing',
            'no_units_selected',
            'target_is_origin',
            'support_own_only',
            'own_village_attack',
            'not_enough_units',
        ];
        for (const code of serverCodes) {
            expect(
                de.errors,
                `Fehlercode ${code} fehlt im Katalog`,
            ).toHaveProperty(code);
        }
    });

    it('hat für jedes Gebäude und jede Einheit einen Namen', () => {
        const buildings = [
            'headquarters',
            'timber_camp',
            'clay_pit',
            'iron_mine',
            'warehouse',
            'farm',
            'barracks',
            'stable',
            'wall',
            'academy',
        ];
        const units = [
            'spear',
            'sword',
            'axe',
            'light_cavalry',
            'heavy_cavalry',
            'ram',
            'noble',
        ];
        for (const b of buildings)
            expect(de.buildings).toHaveProperty(b);
        for (const u of units) expect(de.units).toHaveProperty(u);
    });
});
