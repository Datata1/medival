import { z } from 'zod';
import { keysOf } from '../lib/objects.js';

/**
 * Event-Payloads als discriminated union (siehe plans/08-no-typecasting.md).
 *
 * Events überleben Serverneustarts in der Welt-Datei und damit auch
 * Programmversionen. Vorher wurde die Payload blind gecastet
 * (`ev.payload as { villageId: number; queueId: number }`) — ein umbenanntes
 * Feld oder ein Event aus einer älteren Version wäre erst tief im Handler
 * als `undefined`-Folgefehler aufgefallen. Jetzt wird geparst: Ein Event, das
 * nicht zum Schema passt, wird als Validierungsfehler geloggt und übersprungen
 * (zusammen mit der Fehlerisolation aus Plan 03 friert die Welt dabei nicht ein).
 */

const villageId = z.number().int().positive();

export const BuildCompletePayloadSchema = z.object({
    villageId,
    queueId: z.number().int().positive(),
});

export const RecruitTickPayloadSchema = z.object({
    queueId: z.number().int().positive(),
});

export const ArrivalPayloadSchema = z.object({
    movementId: z.number().int().positive(),
});

/** Alle bekannten Event-Typen mit ihren Payloads. */
export const EVENT_SCHEMAS = {
    build_complete: BuildCompletePayloadSchema,
    recruit_tick: RecruitTickPayloadSchema,
    arrival: ArrivalPayloadSchema,
} as const;

export type EventType = keyof typeof EVENT_SCHEMAS;

export const EVENT_TYPES: EventType[] = keysOf(EVENT_SCHEMAS);

export type BuildCompletePayload = z.infer<
    typeof BuildCompletePayloadSchema
>;
export type RecruitTickPayload = z.infer<
    typeof RecruitTickPayloadSchema
>;
export type ArrivalPayload = z.infer<typeof ArrivalPayloadSchema>;
