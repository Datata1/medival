import {
    DEFAULT_WORLD_SETTINGS,
    type WORLD_LIMITS,
    type WorldSettings,
} from '@medival/shared';

/**
 * Der Bereich „Erweitert" der Weltanlage (plans/20-nacharbeiten/20-4).
 *
 * Zahlen bleiben im Formular Text, damit ein halb getipptes Feld nicht auf 0
 * springt. Erst beim Abschicken wird umgerechnet; ein leeres oder unlesbares
 * Feld fällt weg und der Server nimmt seinen Standard.
 */
export interface AdvancedWorldForm {
    mapSize: string;
    botCount: string;
    barbarianCount: string;
    settlementDensity: string;
    barbariansPerSettler: string;
    archers: boolean;
    paladin: boolean;
}

export const NUMERIC_FIELDS = [
    'mapSize',
    'botCount',
    'barbarianCount',
    'settlementDensity',
    'barbariansPerSettler',
] as const satisfies readonly (keyof typeof WORLD_LIMITS)[];

export type NumericField = (typeof NUMERIC_FIELDS)[number];

export function defaultAdvancedForm(): AdvancedWorldForm {
    const d = DEFAULT_WORLD_SETTINGS;
    return {
        mapSize: String(d.mapSize),
        botCount: String(d.botCount),
        barbarianCount: String(d.barbarianCount),
        settlementDensity: String(d.settlementDensity),
        barbariansPerSettler: String(d.barbariansPerSettler),
        archers: d.archers,
        paladin: d.paladin,
    };
}

export function advancedSettings(
    form: AdvancedWorldForm,
): Partial<WorldSettings> {
    const out: Partial<WorldSettings> = {
        archers: form.archers,
        paladin: form.paladin,
    };
    for (const field of NUMERIC_FIELDS) {
        const raw = form[field].trim().replace(',', '.');
        if (raw === '') continue;
        const value = Number(raw);
        if (Number.isFinite(value)) out[field] = value;
    }
    return out;
}
