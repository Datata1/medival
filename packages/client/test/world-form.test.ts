import { DEFAULT_WORLD_SETTINGS } from '@medival/shared';
import { describe, expect, it } from 'vitest';
import {
    advancedSettings,
    defaultAdvancedForm,
} from '../src/features/lobby/worldForm.js';

describe('Weltanlage: Erweitert (20-4)', () => {
    it('schickt die Standardwerte unverändert', () => {
        expect(advancedSettings(defaultAdvancedForm())).toEqual({
            mapSize: DEFAULT_WORLD_SETTINGS.mapSize,
            botCount: DEFAULT_WORLD_SETTINGS.botCount,
            barbarianCount: DEFAULT_WORLD_SETTINGS.barbarianCount,
            settlementDensity: DEFAULT_WORLD_SETTINGS.settlementDensity,
            barbariansPerSettler:
                DEFAULT_WORLD_SETTINGS.barbariansPerSettler,
            archers: true,
            paladin: true,
        });
    });

    it('liest Eingaben, auch mit Komma, und lässt leere Felder weg', () => {
        const form = {
            ...defaultAdvancedForm(),
            botCount: '2',
            settlementDensity: '0,05',
            barbarianCount: '',
            paladin: false,
        };
        const settings = advancedSettings(form);
        expect(settings).toMatchObject({
            botCount: 2,
            settlementDensity: 0.05,
            paladin: false,
        });
        expect(settings).not.toHaveProperty('barbarianCount');
    });
});
