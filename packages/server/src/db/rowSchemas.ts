import {
    WorldSettingsSchema,
    WorldStatusSchema,
} from '@medival/shared';
import { z } from 'zod';

/**
 * Schemas für Abfragen ohne Drizzle-Typisierung (Roh-SQL, PRAGMA, Meta-DB).
 * Drizzle-Selects sind bereits typisiert und brauchen hier nichts.
 */

export const PlayerBotFlagSchema = z.object({
    is_bot: z.number().int(),
});

export const TableColumnSchema = z.object({ name: z.string() });

/** Zeile der Welten-Metadatenbank (`worlds.sqlite`). */
export const WorldMetaRowSchema = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    seed: z.number().int(),
    settings_json: z.string(),
    status: WorldStatusSchema,
    game_time_ms: z.number().int().nonnegative(),
    rng_state: z.number().int(),
    created_at: z.number().int(),
    /** Fehlt bei Spielständen von vor 19-3; dann läuft die Uhr ab `game_time_ms`. */
    epoch_zero_ms: z.number().nullable().optional(),
    /** Platzierte Dörfer seit Weltbeginn (19-6); fehlt vor 19-6. */
    settled_count: z.number().int().nullable().optional(),
});

export type WorldMetaRow = z.infer<typeof WorldMetaRowSchema>;

/** Die Einstellungen liegen als JSON-Text in der Metazeile. */
export const StoredWorldSettingsSchema = WorldSettingsSchema;
