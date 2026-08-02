import { z } from 'zod';
import {
    BuildingLevelsSchema,
    BuildingTypeSchema,
    DurationSchema,
    GameTimeSchema,
    MovementKindSchema,
    ResourcesSchema,
    UnitsSchema,
    UnitTypeSchema,
} from './primitives.js';
import { WorldSettingsSchema, WorldStatusSchema } from './world.js';

/**
 * Der API-Vertrag zwischen Server und Client (siehe plans/08-no-typecasting.md).
 *
 * Anders als bei den Kern-Spieltypen sind hier die Schemas die Wahrheit und die
 * Typen werden abgeleitet: Ein DTO existiert nur, um über die Leitung zu gehen,
 * und genau dort muss es geprüft werden. Server und Client teilen sich diese
 * Definition, sodass Drift nicht mehr unbemerkt bleiben kann.
 */

// ── gemeinsame Bausteine ──────────────────────────────────────────────

const villageRef = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    x: z.number().int(),
    y: z.number().int(),
});

// ── Requests ──────────────────────────────────────────────────────────

export const BuildRequestSchema = z.object({
    building: BuildingTypeSchema,
});

export const RecruitRequestSchema = z.object({
    unit: UnitTypeSchema,
    count: z.number().int().positive().max(100_000),
});

export const SendUnitsRequestSchema = z.object({
    target: z.number().int().positive(),
    kind: z.enum(['attack', 'support']),
    units: UnitsSchema.default({}),
});

/** Pfadparameter kommen als Strings; hier werden sie zu Zahlen geparst. */
export const NumericIdSchema = z.coerce.number().int().positive();

// ── Responses ─────────────────────────────────────────────────────────

export const WorldListEntrySchema = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    seed: z.number().int(),
    status: WorldStatusSchema,
    settings: WorldSettingsSchema,
    gameTimeMs: GameTimeSchema,
    createdAt: z.number().int(),
});

export const WorldSummarySchema = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    status: WorldStatusSchema,
    settings: WorldSettingsSchema,
    gameTime: GameTimeSchema,
    playerVillages: z.array(
        villageRef.extend({ points: z.number().int() }),
    ),
});

export const BuildQueueItemSchema = z.object({
    id: z.number().int().positive(),
    villageId: z.number().int().positive(),
    buildingType: BuildingTypeSchema,
    targetLevel: z.number().int().positive(),
    completesAt: GameTimeSchema,
});

export const RecruitQueueItemSchema = z.object({
    id: z.number().int().positive(),
    villageId: z.number().int().positive(),
    unitType: UnitTypeSchema,
    count: z.number().int().nonnegative(),
    /** 0 bedeutet: Auftrag wartet noch auf sein Gebäude. */
    nextUnitDoneAt: GameTimeSchema,
    perUnitMs: DurationSchema,
});

export const VillageViewSchema = z.object({
    id: z.number().int().positive(),
    playerId: z.number().int().positive().nullable(),
    name: z.string(),
    x: z.number().int(),
    y: z.number().int(),
    loyalty: z.number(),
    points: z.number().int(),
    gameTime: GameTimeSchema,
    resources: ResourcesSchema,
    capacity: z.number(),
    rates: ResourcesSchema,
    buildings: BuildingLevelsSchema,
    buildQueue: z.array(BuildQueueItemSchema),
    recruitQueue: z.array(RecruitQueueItemSchema),
    units: UnitsSchema,
    popUsed: z.number(),
    popMax: z.number(),
});

export const MapVillageSchema = z.object({
    id: z.number().int().positive(),
    playerId: z.number().int().positive().nullable(),
    x: z.number().int(),
    y: z.number().int(),
    name: z.string(),
    points: z.number().int(),
});

export const MovementInfoSchema = z.object({
    id: z.number().int().positive(),
    kind: MovementKindSchema,
    origin: villageRef.optional(),
    target: villageRef.optional(),
    arrivalGameTime: GameTimeSchema,
    /** Bei eingehenden Feindbewegungen bewusst verborgen. */
    units: UnitsSchema.nullable(),
});

export const MovementsResponseSchema = z.object({
    gameTime: GameTimeSchema,
    incoming: z.array(MovementInfoSchema),
    outgoing: z.array(MovementInfoSchema),
});

export const BattleReportPayloadSchema = z.object({
    attackerVillage: villageRef,
    defenderVillage: villageRef,
    attackerWon: z.boolean(),
    attacker: UnitsSchema,
    attackerLosses: UnitsSchema,
    defender: UnitsSchema,
    defenderLosses: UnitsSchema,
    wallBefore: z.number().int(),
    wallAfter: z.number().int(),
    loyaltyBefore: z.number(),
    loyaltyAfter: z.number(),
    luck: z.number(),
    loot: ResourcesSchema,
    conquered: z.boolean(),
});

export const ReportSchema = z.object({
    id: z.number().int().positive(),
    type: z.enum(['attack', 'defense']),
    createdGameTime: GameTimeSchema,
    read: z.boolean(),
    payload: BattleReportPayloadSchema,
});

/** Öffentliches Profil eines Spielers oder Bots. */
export const PlayerProfileSchema = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    isBot: z.boolean(),
    /** Nur bei Bots gesetzt: turtle | raider | expander | balanced. */
    personality: z.string().nullable(),
    villageCount: z.number().int().nonnegative(),
    totalPoints: z.number().int().nonnegative(),
    /** Platz in der Punkterangliste, 1 = führend. */
    rank: z.number().int().positive(),
    villages: z.array(villageRef.extend({ points: z.number().int() })),
});

export const SendUnitsResponseSchema = z.object({
    arrivalGameTime: GameTimeSchema,
    gameTime: GameTimeSchema,
});

export const DeletedResponseSchema = z.object({ deleted: z.boolean() });
export const OkResponseSchema = z.object({ ok: z.boolean() });
export const WorldListSchema = z.array(WorldListEntrySchema);
export const MapSchema = z.array(MapVillageSchema);
export const ReportListSchema = z.array(ReportSchema);

/** Nachrichten, die der Server über die WebSocket-Verbindung pusht. */
export const WorldMessageSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('village_updated'),
        villageId: z.number().int(),
    }),
    z.object({
        type: z.literal('build_complete'),
        villageId: z.number().int(),
    }),
    z.object({
        type: z.literal('movement'),
        originVillageId: z.number().int(),
        targetVillageId: z.number().int(),
    }),
    z.object({ type: z.literal('report'), playerId: z.number().int() }),
    z.object({
        type: z.literal('world_status'),
        status: WorldStatusSchema,
        gameTime: z.number().int(),
    }),
]);

// ── abgeleitete Typen (DTOs: Schema ist die Wahrheit) ─────────────────

export type WorldListEntry = z.infer<typeof WorldListEntrySchema>;
export type WorldSummary = z.infer<typeof WorldSummarySchema>;
export type BuildQueueItem = z.infer<typeof BuildQueueItemSchema>;
export type RecruitQueueItem = z.infer<typeof RecruitQueueItemSchema>;
export type VillageView = z.infer<typeof VillageViewSchema>;
export type MapVillage = z.infer<typeof MapVillageSchema>;
export type MovementInfo = z.infer<typeof MovementInfoSchema>;
export type MovementsResponse = z.infer<typeof MovementsResponseSchema>;
export type BattleReportPayload = z.infer<
    typeof BattleReportPayloadSchema
>;
export type Report = z.infer<typeof ReportSchema>;
export type WorldMessage = z.infer<typeof WorldMessageSchema>;
export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;
