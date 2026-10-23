import { z } from 'zod';
import {
    BUILDING_ORDER,
    EMPTY_BUILDING_LEVELS,
} from '../data/buildings.js';
import { UNIT_ORDER } from '../data/units.js';
import { Duration, GameTime } from '../time.js';
import {
    type BuildingLevels,
    type BuildingType,
    MOVEMENT_KINDS,
    type MovementKind,
    type Resources,
    type Units,
    type UnitType,
} from '../types.js';

/**
 * Schemas für die Kern-Spieltypen (siehe plans/08-no-typecasting.md).
 *
 * Die handgeschriebenen Typen in `types.ts` bleiben die lesbare Wahrheit;
 * jedes Schema trägt `satisfies z.ZodType<X>`, damit der Compiler meldet,
 * wenn Schema und Typ auseinanderlaufen.
 */

export const BuildingTypeSchema = z.enum(
    BUILDING_ORDER,
) satisfies z.ZodType<BuildingType>;

/**
 * Der Versammlungsplatz (plans/18-ux/18-2-dorfuebersicht.md).
 *
 * Seit 19-13 ein echtes Gebäude mit einer Stufe: Ohne ihn kann ein Dorf keine
 * Truppen schicken, und Katapulte können ihn zerstören. Vorher war er nur eine
 * Unterseite des Dorfes. Seine Seite bleibt der Ort, an dem alle Bewegungen
 * dieses Dorfes zusammenlaufen.
 */
export const RALLY_POINT = 'rally_point' satisfies BuildingType;

/** Alles, was hinter `/village/$villageId/` stehen darf. */
export const VillagePageSchema = z.enum(BUILDING_ORDER);

export type VillagePage = z.infer<typeof VillagePageSchema>;
export const UnitTypeSchema = z.enum(
    UNIT_ORDER,
) satisfies z.ZodType<UnitType>;
export const MovementKindSchema = z.enum(
    MOVEMENT_KINDS,
) satisfies z.ZodType<MovementKind>;

/** Spielzeit-Stempel: der Brand entsteht über den validierten Konstruktor. */
export const GameTimeSchema = z
    .number()
    .int()
    .nonnegative()
    .transform(GameTime.of);

/** Zeitspanne: ebenfalls über den validierten Konstruktor gebrandet. */
export const DurationSchema = z.number().int().transform(Duration.ms);

const resourceAmount = z.number().finite().nonnegative();

export const ResourcesSchema = z.object({
    wood: resourceAmount,
    clay: resourceAmount,
    iron: resourceAmount,
}) satisfies z.ZodType<Resources>;

/** Truppenmengen: ganzzahlig und nicht negativ; unbekannte Einheiten fliegen raus. */
export const UnitsSchema = z.partialRecord(
    UnitTypeSchema,
    z.number().int().nonnegative(),
) satisfies z.ZodType<Units>;

export const BuildingLevelsSchema = z.record(
    BuildingTypeSchema,
    z.number().int().nonnegative(),
) satisfies z.ZodType<BuildingLevels>;

/** Beute-Tripel in Bewegungen; fehlende Felder gelten als 0. */
export const CarriedResourcesSchema = z
    .object({
        wood: resourceAmount.optional(),
        clay: resourceAmount.optional(),
        iron: resourceAmount.optional(),
    })
    .transform((c) => ({
        wood: c.wood ?? 0,
        clay: c.clay ?? 0,
        iron: c.iron ?? 0,
    })) satisfies z.ZodType<Resources, unknown>;

export { EMPTY_BUILDING_LEVELS };
