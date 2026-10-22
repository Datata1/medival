import { z } from 'zod';
import { ATTITUDES } from '../logic/relations.js';
import { MAX_TILES_PER_SIDE } from '../logic/tiles.js';
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

/** Rohstofflieferung an ein fremdes Dorf (plans/16-ansehen-und-handel.md). */
export const SendResourcesRequestSchema = z.object({
    target: z.number().int().positive(),
    resources: ResourcesSchema,
});

// ── Stämme (Plan 17) ─────────────────────────────────────────────────

export const FoundTribeRequestSchema = z.object({
    name: z.string().trim().min(1).max(40),
    tag: z.string().trim().min(1).max(5),
});

export const InvitePlayerRequestSchema = z.object({
    playerId: z.number().int().positive(),
});

export const AcceptInvitationRequestSchema = z.object({
    tribeId: z.number().int().positive(),
});

const tribeMember = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    points: z.number().int().nonnegative(),
    villageCount: z.number().int().nonnegative(),
});

export const TribeSchema = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    tag: z.string(),
    founderId: z.number().int().positive(),
    members: z.array(tribeMember),
});

/** Alles, was die Diplomatie-Ansicht braucht — ein Abruf statt fünf. */
export const DiplomacyViewSchema = z.object({
    tribe: TribeSchema.nullable(),
    /** Bekannte Spieler mit Haltung, ohne Barbaren. */
    players: z.array(
        z.object({
            id: z.number().int().positive(),
            name: z.string(),
            isBot: z.boolean(),
            points: z.number().int().nonnegative(),
            tribeTag: z.string().nullable(),
            standing: z.number(),
            attitude: z.enum(ATTITUDES),
            distance: z.number(),
        }),
    ),
    /** Offene Einladungen an den Spieler. */
    invitations: z.array(
        z.object({
            tribeId: z.number().int().positive(),
            tribeName: z.string(),
            tribeTag: z.string(),
            expiresGameTime: GameTimeSchema,
        }),
    ),
    gameTime: GameTimeSchema,
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
    /**
     * Wanduhrzeit (Epoch-ms), zu der die Spielzeit 0 war (19-3). Eine
     * Ankunft um Spielzeit t ist um `epochZeroMs + t` — in Uhrzeit.
     */
    epochZeroMs: z.number().finite(),
    /** Server läuft im Entwicklermodus: Pause und Vorspulen verfügbar. */
    devMode: z.boolean(),
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
    /** Gesamte Transportkapazität des Marktplatzes. */
    merchantCapacity: z.number(),
    /** Davon gerade frei — unterwegs gebundene Händler zählen nicht. */
    merchantsFree: z.number(),
});

export const MapVillageSchema = z.object({
    id: z.number().int().positive(),
    playerId: z.number().int().positive().nullable(),
    x: z.number().int(),
    y: z.number().int(),
    name: z.string(),
    points: z.number().int(),
    /** Stammeskürzel des Besitzers — die Karte färbt danach (19-7). */
    tribeTag: z.string().nullable().optional(),
});

/** Anfrage nach Kacheln: höchstens `MAX_TILES_PER_SIDE` je Richtung. */
export const MapTilesQuerySchema = z
    .object({
        tx0: z.coerce.number().int(),
        ty0: z.coerce.number().int(),
        tx1: z.coerce.number().int(),
        ty1: z.coerce.number().int(),
    })
    .refine(
        (q) =>
            q.tx1 >= q.tx0 &&
            q.ty1 >= q.ty0 &&
            q.tx1 - q.tx0 < MAX_TILES_PER_SIDE &&
            q.ty1 - q.ty0 < MAX_TILES_PER_SIDE,
        'Zu großer Kartenausschnitt',
    );

export const MapPointQuerySchema = z.object({
    x: z.coerce.number().int(),
    y: z.coerce.number().int(),
});

export const MovementInfoSchema = z.object({
    id: z.number().int().positive(),
    kind: MovementKindSchema,
    origin: villageRef.optional(),
    target: villageRef.optional(),
    /**
     * Wird **auch bei eingehenden Feindbewegungen** ausgeliefert: Verborgen
     * bleibt allein die Truppenzusammensetzung, nicht die Tatsache, dass etwas
     * unterwegs ist — die Ankunftszeit steht ja ohnehin daneben. Ohne den
     * Abflug ließe sich der Marker auf der Karte nicht setzen
     * (plans/18-ux/18-3-karte.md).
     */
    departureGameTime: GameTimeSchema,
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
    /**
     * Wie dieser Spieler zum menschlichen Spieler steht — asymmetrisch, also
     * seine Sicht auf uns, nicht unsere auf ihn. `null` beim eigenen Profil.
     */
    standing: z.number().nullable(),
    attitude: z.enum(ATTITUDES).nullable(),
    /** Stammeskürzel, falls Mitglied. */
    tribeTag: z.string().nullable(),
});

export const SendUnitsResponseSchema = z.object({
    arrivalGameTime: GameTimeSchema,
    gameTime: GameTimeSchema,
});

export const DeletedResponseSchema = z.object({ deleted: z.boolean() });
export const OkResponseSchema = z.object({ ok: z.boolean() });
export const WorldListSchema = z.array(WorldListEntrySchema);
/** Kacheln eines Ausschnitts (19-7). */
export const MapTilesResponseSchema = z.object({
    tiles: z.array(
        z.object({
            tx: z.number().int(),
            ty: z.number().int(),
            villages: z.array(MapVillageSchema),
        }),
    ),
});

/** Das Dorf auf einem Feld, falls dort eins steht (Zielauswahl, 19-7). */
export const MapVillageAtResponseSchema = z.object({
    village: MapVillageSchema.nullable(),
});
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
    z.object({ type: z.literal('tribe'), tribeId: z.number().int() }),
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
export type Tribe = z.infer<typeof TribeSchema>;
export type DiplomacyView = z.infer<typeof DiplomacyViewSchema>;
export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;

/** Vorspulen im Entwicklermodus (19-3): höchstens eine Woche je Aufruf. */
export const DevSkipRequestSchema = z.object({
    ms: z
        .number()
        .int()
        .positive()
        .max(7 * 24 * 3_600_000),
});

// ── Accounts (plans/19-prototyp/19-8-accounts-und-session.md) ─────────

/** Name: 3–24 Zeichen aus Buchstaben, Ziffern, Leerzeichen, `_` und `-`. */
export const AccountNameSchema = z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[\p{L}\p{N}_ -]+$/u);

export const PasswordSchema = z.string().min(8).max(200);

export const RegisterRequestSchema = z.object({
    name: AccountNameSchema,
    password: PasswordSchema,
});

export const LoginRequestSchema = z.object({
    name: z.string().trim().min(1).max(24),
    password: z.string().min(1).max(200),
});

export const AccountRoleSchema = z.enum(['player', 'admin']);

export const AccountSchema = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    role: AccountRoleSchema,
});

/** Wer angemeldet ist — `account: null` heißt: niemand. */
export const MeResponseSchema = z.object({
    account: AccountSchema.nullable(),
    devMode: z.boolean(),
});

export type Account = z.infer<typeof AccountSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
