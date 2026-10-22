import { z } from 'zod';
import type { WorldSettings } from '../types.js';

/**
 * Welt-Einstellungen mit echten Schranken.
 *
 * Diese Grenzen sind kein Selbstzweck: Vor Plan 08 war `settings` eine reine
 * Typ-Behauptung, sodass `{"speed":"schnell"}` bis in `buildTime()` durchlief
 * und NaN-Zeitstempel in die Welt-Datei schrieb. Die Obergrenzen schützen
 * zusätzlich die Kartengenerierung, die für zu viele Dörfer auf zu kleiner
 * Fläche keinen Platz mehr findet.
 */
const worldSettingsFields = z.object({
    speed: z.number().finite().min(1).max(10_000),
    unitSpeed: z.number().finite().min(1).max(10_000),
    mapSize: z.number().int().min(20).max(500),
    botCount: z.number().int().min(0).max(500),
    barbarianCount: z.number().int().min(0).max(5_000),
    /*
     * Basisrate bei Weltgeschwindigkeit 1; die Engine multipliziert sie mit
     * `speed`. Obergrenze 60: Zusammen mit Speed 500 und 80 Dörfern wären das
     * schon ~670 Events pro Sekunde. Die Untergrenze 0 ist ausdrücklich
     * erlaubt und bedeutet „keine Ticks einplanen" — der Rückweg zum
     * Verhalten vor Plan 14.
     *
     * `.default()` statt Pflichtfeld, damit Welt-Dateien aus der Zeit vor
     * Plan 14 weiter geöffnet werden können: Ihr `settings_json` kennt diese
     * Felder nicht, und ein Pflichtfeld würde jeden bestehenden Spielstand
     * unlesbar machen. Additive Migration, wie in `migrateWorldDb`.
     */
    barbarianAttemptsPerHour: z
        .number()
        .finite()
        .min(0)
        .max(60)
        .default(1),
    barbarianMaxPoints: z
        .number()
        .int()
        .min(0)
        .max(100_000)
        .default(1500),
    victoryVillageShare: z.number().finite().gt(0).max(1),
    seed: z.number().int().min(0).max(0xffff_ffff),
});

export const WorldSettingsSchema = worldSettingsFields.refine(
    (s) =>
        1 + s.botCount + s.barbarianCount <=
        (s.mapSize * s.mapSize) / 4,
    'Zu viele Dörfer für diese Kartengröße',
) satisfies z.ZodType<WorldSettings, unknown>;

/**
 * Teilmenge für die Weltenerstellung: prüft die Feldgrenzen, aber nicht die
 * Gesamt-Invariante — die kann erst nach dem Merge mit den Defaults gelten.
 * Der WorldManager parst das Ergebnis deshalb noch einmal gegen
 * `WorldSettingsSchema`.
 */
export const WorldSettingsPatchSchema = worldSettingsFields.partial();

export const CreateWorldRequestSchema = z.object({
    name: z.string().trim().min(1).max(60).optional(),
    settings: WorldSettingsPatchSchema.optional(),
});

/**
 * Lebenszyklus einer Welt (plans/19-prototyp/19-3): Sie läuft, ist im
 * Entwicklermodus pausiert, oder sie ist beendet. `won`/`lost` stammen aus
 * dem Singleplayer — Sieg und Niederlage aus Sicht *eines* Menschen — und
 * werden beim Lesen alter Spielstände zu `ended`.
 */
export const WorldStatusSchema = z.preprocess(
    (value) => (value === 'won' || value === 'lost' ? 'ended' : value),
    z.enum(['running', 'paused', 'ended']),
);
