import {
    AccountSchema,
    type BuildingType,
    DeletedResponseSchema,
    DiplomacyViewSchema,
    MapTilesResponseSchema,
    MapVillageAtResponseSchema,
    MeResponseSchema,
    MovementsResponseSchema,
    OkResponseSchema,
    PlayerProfileSchema,
    ReportListSchema,
    type Resources,
    ScoutIntelResponseSchema,
    SendUnitsResponseSchema,
    type TileRange,
    type Units,
    type UnitType,
    VillageViewSchema,
    WorldListSchema,
    type WorldSettings,
    WorldSummarySchema,
} from '@medival/shared';
import { z } from 'zod';

/** Fehlerantworten des Servers tragen einen Fehlercode, keinen Klartext. */
const ErrorResponseSchema = z.object({ error: z.string() });

/**
 * Jede Antwort wird gegen ihr Schema geparst statt gecastet
 * (siehe plans/08-no-typecasting.md). Vorher lieferte diese Funktion
 * `res.json() as Promise<T>` — der Client vertraute dem Server blind, und
 * ein Schema-Drift wäre erst als Folgefehler tief in der UI aufgefallen.
 */
async function request<T>(
    url: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
): Promise<T> {
    // Content-Type nur mit Body — Fastify lehnt application/json ohne Body ab.
    const res = await fetch(url, {
        // Session-Cookie mitsenden (19-8). Same-Origin ist der Standard, hier
        // ausdrücklich, damit es niemand für Zufall hält.
        credentials: 'same-origin',
        ...init,
        headers: init?.body
            ? { 'Content-Type': 'application/json' }
            : undefined,
    });
    const json: unknown = await res.json().catch(() => null);

    if (!res.ok) {
        const parsed = ErrorResponseSchema.safeParse(json);
        throw new Error(
            parsed.success ? parsed.data.error : `HTTP ${res.status}`,
        );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
        console.error(
            `Unerwartete Serverantwort für ${url}:`,
            parsed.error.issues,
        );
        throw new Error('invalid_server_response');
    }
    return parsed.data;
}

const postJson = (body: unknown): RequestInit => ({
    method: 'POST',
    body: JSON.stringify(body),
});

/** Antwort auf Anmelden und Registrieren (19-8). */
const AuthResponseSchema = z.object({ account: AccountSchema });

export const api = {
    me: () => request('/api/me', MeResponseSchema),
    register: (name: string, password: string) =>
        request(
            '/api/auth/register',
            AuthResponseSchema,
            postJson({ name, password }),
        ),
    login: (name: string, password: string) =>
        request(
            '/api/auth/login',
            AuthResponseSchema,
            postJson({ name, password }),
        ),
    logout: () =>
        request('/api/auth/logout', OkResponseSchema, {
            method: 'POST',
        }),
    listWorlds: () => request('/api/worlds', WorldListSchema),
    createWorld: (name: string, settings: Partial<WorldSettings>) =>
        request(
            '/api/worlds',
            WorldSummarySchema,
            postJson({ name, settings }),
        ),
    /** Einer Welt beitreten: Spieler und Dorf am Rand (19-9). */
    joinWorld: (id: number) =>
        request(`/api/worlds/${id}/join`, WorldSummarySchema, {
            method: 'POST',
        }),
    getWorld: (id: number) =>
        request(`/api/worlds/${id}`, WorldSummarySchema),
    pauseWorld: (id: number) =>
        request(`/api/worlds/${id}/pause`, WorldSummarySchema, {
            method: 'POST',
        }),
    resumeWorld: (id: number) =>
        request(`/api/worlds/${id}/resume`, WorldSummarySchema, {
            method: 'POST',
        }),
    deleteWorld: (id: number) =>
        request(`/api/worlds/${id}`, DeletedResponseSchema, {
            method: 'DELETE',
        }),
    /** Eigenes Spähwissen über ein Dorf, sonst `null` (20-5). */
    getIntel: (worldId: number, villageId: number) =>
        request(
            `/api/worlds/${worldId}/villages/${villageId}/intel`,
            ScoutIntelResponseSchema,
        ),
    getVillage: (worldId: number, villageId: number) =>
        request(
            `/api/worlds/${worldId}/villages/${villageId}`,
            VillageViewSchema,
        ),
    build: (
        worldId: number,
        villageId: number,
        building: BuildingType,
    ) =>
        request(
            `/api/worlds/${worldId}/villages/${villageId}/build`,
            VillageViewSchema,
            postJson({ building }),
        ),
    research: (worldId: number, villageId: number, unit: UnitType) =>
        request(
            `/api/worlds/${worldId}/villages/${villageId}/research`,
            VillageViewSchema,
            postJson({ unit }),
        ),
    recruit: (
        worldId: number,
        villageId: number,
        unit: UnitType,
        count: number,
    ) =>
        request(
            `/api/worlds/${worldId}/villages/${villageId}/recruit`,
            VillageViewSchema,
            postJson({ unit, count }),
        ),
    send: (
        worldId: number,
        villageId: number,
        target: number,
        kind: 'attack' | 'support',
        units: Units,
        catapultTarget?: BuildingType,
    ) =>
        request(
            `/api/worlds/${worldId}/villages/${villageId}/send`,
            SendUnitsResponseSchema,
            postJson({ target, kind, units, catapultTarget }),
        ),
    ship: (
        worldId: number,
        villageId: number,
        target: number,
        resources: Resources,
    ) =>
        request(
            `/api/worlds/${worldId}/villages/${villageId}/ship`,
            SendUnitsResponseSchema,
            postJson({ target, resources }),
        ),
    getDiplomacy: (worldId: number) =>
        request(
            `/api/worlds/${worldId}/diplomacy`,
            DiplomacyViewSchema,
        ),
    foundTribe: (worldId: number, name: string, tag: string) =>
        request(
            `/api/worlds/${worldId}/tribe`,
            OkResponseSchema,
            postJson({ name, tag }),
        ),
    invitePlayer: (worldId: number, playerId: number) =>
        request(
            `/api/worlds/${worldId}/tribe/invite`,
            OkResponseSchema,
            postJson({ playerId }),
        ),
    acceptInvitation: (worldId: number, tribeId: number) =>
        request(
            `/api/worlds/${worldId}/tribe/accept`,
            OkResponseSchema,
            postJson({ tribeId }),
        ),
    leaveTribe: (worldId: number) =>
        request(
            `/api/worlds/${worldId}/tribe/leave`,
            OkResponseSchema,
            postJson({}),
        ),
    getPlayerProfile: (worldId: number, playerId: number) =>
        request(
            `/api/worlds/${worldId}/players/${playerId}`,
            PlayerProfileSchema,
        ),
    getMapTiles: (worldId: number, range: TileRange) =>
        request(
            `/api/worlds/${worldId}/map/tiles?tx0=${range.tx0}&ty0=${range.ty0}&tx1=${range.tx1}&ty1=${range.ty1}`,
            MapTilesResponseSchema,
        ),
    getMapVillageAt: (worldId: number, x: number, y: number) =>
        request(
            `/api/worlds/${worldId}/map/at?x=${x}&y=${y}`,
            MapVillageAtResponseSchema,
        ),
    getMovements: (worldId: number) =>
        request(
            `/api/worlds/${worldId}/movements`,
            MovementsResponseSchema,
        ),
    getReports: (worldId: number) =>
        request(`/api/worlds/${worldId}/reports`, ReportListSchema),
    markReportsRead: (worldId: number) =>
        request(
            `/api/worlds/${worldId}/reports/read`,
            OkResponseSchema,
            {
                method: 'POST',
            },
        ),
};
