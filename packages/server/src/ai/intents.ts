import {
    BUILDING_ORDER,
    UNIT_ORDER,
    UnitsSchema,
} from '@medival/shared';
import { z } from 'zod';

/**
 * Was ein Bot tun will (siehe plans/15-bot-grundgeruest.md).
 *
 * Absicht und Ausführung sind getrennt: Die Entscheidungsschicht liefert
 * `Intent`s, `execute.ts` setzt sie in Kommandos um. Das macht Entscheidungen
 * prüfbar (ein Test vergleicht Absichten, nicht Datenbankzustände), erlaubt
 * eine Obergrenze pro Tick und ergäbe später eine „warum tut der das?"-Anzeige,
 * ohne dass dafür etwas umgebaut werden müsste.
 *
 * `send` und `ship` erzeugt heute noch niemand — sie kommen in den Plänen 16
 * und 17. Sie stehen trotzdem von Anfang an im Typ, damit die
 * Ausführungsschicht später *erweitert* und nicht *umgebaut* wird.
 */

export const BuildIntentSchema = z.object({
    kind: z.literal('build'),
    villageId: z.number().int().positive(),
    building: z.enum(BUILDING_ORDER),
});

export const RecruitIntentSchema = z.object({
    kind: z.literal('recruit'),
    villageId: z.number().int().positive(),
    unit: z.enum(UNIT_ORDER),
    count: z.number().int().positive(),
});

/** Truppen schicken — Angriff oder Unterstützung (Plan 17). */
export const SendIntentSchema = z.object({
    kind: z.literal('send'),
    originVillageId: z.number().int().positive(),
    targetVillageId: z.number().int().positive(),
    movement: z.enum(['attack', 'support']),
    units: UnitsSchema,
});

/** Rohstoffe liefern (Plan 16). */
export const ShipIntentSchema = z.object({
    kind: z.literal('ship'),
    originVillageId: z.number().int().positive(),
    targetVillageId: z.number().int().positive(),
    resources: z.object({
        wood: z.number().int().nonnegative(),
        clay: z.number().int().nonnegative(),
        iron: z.number().int().nonnegative(),
    }),
});

export const IntentSchema = z.discriminatedUnion('kind', [
    BuildIntentSchema,
    RecruitIntentSchema,
    SendIntentSchema,
    ShipIntentSchema,
]);

export type BuildIntent = z.infer<typeof BuildIntentSchema>;
export type RecruitIntent = z.infer<typeof RecruitIntentSchema>;
export type SendIntent = z.infer<typeof SendIntentSchema>;
export type ShipIntent = z.infer<typeof ShipIntentSchema>;
export type Intent = z.infer<typeof IntentSchema>;

/**
 * Was ein Bot sich für später vornimmt: das Sparziel eines Dorfes.
 *
 * Wird in `players.ai_state_json` abgelegt und überlebt damit Neustarts —
 * deshalb ein Schema und kein blanker Typ (Plan 08: Was das Programm betritt,
 * wird geparst). Ohne diese Persistenz würde ein Bot nach jedem Serverstart
 * ein neues Ziel wählen und nie etwas Teures fertigbekommen.
 */
export const BotStateSchema = z.object({
    /** villageId → worauf gespart wird */
    savingFor: z
        .record(
            z.string(),
            z.object({
                building: z.enum(BUILDING_ORDER),
                level: z.number().int().positive(),
            }),
        )
        .default({}),
});

export type BotState = z.infer<typeof BotStateSchema>;

export const EMPTY_BOT_STATE: BotState = { savingFor: {} };
