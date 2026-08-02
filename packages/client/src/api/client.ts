import {
    type BuildingType,
    DeletedResponseSchema,
    MapSchema,
    MovementsResponseSchema,
    OkResponseSchema,
    PlayerProfileSchema,
    ReportListSchema,
    SendUnitsResponseSchema,
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

export const api = {
    listWorlds: () => request('/api/worlds', WorldListSchema),
    createWorld: (name: string, settings: Partial<WorldSettings>) =>
        request(
            '/api/worlds',
            WorldSummarySchema,
            postJson({ name, settings }),
        ),
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
    ) =>
        request(
            `/api/worlds/${worldId}/villages/${villageId}/send`,
            SendUnitsResponseSchema,
            postJson({ target, kind, units }),
        ),
    getPlayerProfile: (worldId: number, playerId: number) =>
        request(
            `/api/worlds/${worldId}/players/${playerId}`,
            PlayerProfileSchema,
        ),
    getMap: (worldId: number) =>
        request(`/api/worlds/${worldId}/map`, MapSchema),
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
