import { describe, expect, it } from 'vitest';
import {
    BuildRequestSchema,
    CreateWorldRequestSchema,
    DEFAULT_WORLD_SETTINGS,
    EVENT_SCHEMAS,
    GameTimeSchema,
    RecruitRequestSchema,
    SendUnitsRequestSchema,
    UnitsSchema,
    WorldMessageSchema,
    WorldSettingsSchema,
} from '../src/index.js';

describe('WorldSettings-Validierung', () => {
    it('akzeptiert die Standardeinstellungen', () => {
        expect(
            WorldSettingsSchema.parse(DEFAULT_WORLD_SETTINGS),
        ).toEqual(DEFAULT_WORLD_SETTINGS);
    });

    it('lehnt den NaN-Pfad ab, der NaN-Zeitstempel in die DB schrieb', () => {
        // Der belegte Bug aus plans/08: speed war eine reine Typ-Behauptung.
        const result = WorldSettingsSchema.safeParse({
            ...DEFAULT_WORLD_SETTINGS,
            speed: 'schnell',
        });
        expect(result.success).toBe(false);
    });

    it('lehnt unsinnige Kartengrößen und Dorfzahlen ab', () => {
        for (const patch of [
            { mapSize: -5 },
            { mapSize: 0 },
            { botCount: 999_999 },
            { speed: 0 },
            { speed: Number.POSITIVE_INFINITY },
            { victoryVillageShare: 0 },
            { victoryVillageShare: 1.5 },
        ]) {
            const result = WorldSettingsSchema.safeParse({
                ...DEFAULT_WORLD_SETTINGS,
                ...patch,
            });
            expect(
                result.success,
                `${JSON.stringify(patch)} hätte abgelehnt werden müssen`,
            ).toBe(false);
        }
    });

    it('lehnt zu viele Dörfer für die Kartenfläche ab', () => {
        const result = WorldSettingsSchema.safeParse({
            ...DEFAULT_WORLD_SETTINGS,
            mapSize: 20,
            botCount: 200,
            barbarianCount: 500,
        });
        expect(result.success).toBe(false);
    });

    it('erlaubt eine Teilmenge beim Anlegen einer Welt', () => {
        const parsed = CreateWorldRequestSchema.parse({
            name: 'Testwelt',
            settings: { speed: 500 },
        });
        expect(parsed.settings?.speed).toBe(500);
    });
});

describe('Request-Validierung', () => {
    it('lehnt unbekannte Gebäude und Einheiten ab', () => {
        expect(
            BuildRequestSchema.safeParse({ building: 'raumhafen' })
                .success,
        ).toBe(false);
        expect(
            BuildRequestSchema.safeParse({ building: 'barracks' })
                .success,
        ).toBe(true);
        expect(
            RecruitRequestSchema.safeParse({ unit: 'drache', count: 1 })
                .success,
        ).toBe(false);
    });

    it('lehnt unsinnige Rekrutierungsmengen ab', () => {
        for (const count of [0, -5, 1.5, Number.NaN, 'viele']) {
            expect(
                RecruitRequestSchema.safeParse({ unit: 'spear', count })
                    .success,
            ).toBe(false);
        }
    });

    it('lehnt Truppenlisten mit unbekannten Einheiten ab', () => {
        expect(UnitsSchema.safeParse({ drache: 5 }).success).toBe(
            false,
        );
        expect(UnitsSchema.safeParse({ spear: -1 }).success).toBe(
            false,
        );
        expect(UnitsSchema.safeParse({ spear: 10 }).success).toBe(true);
    });

    it('verlangt eine gültige Bewegungsart', () => {
        expect(
            SendUnitsRequestSchema.safeParse({
                target: 5,
                kind: 'plündern',
                units: { spear: 1 },
            }).success,
        ).toBe(false);
        expect(
            SendUnitsRequestSchema.safeParse({
                target: 5,
                kind: 'attack',
                units: { spear: 1 },
            }).success,
        ).toBe(true);
    });
});

describe('Persistierte Daten', () => {
    it('lehnt negative und nicht-ganzzahlige Spielzeiten ab', () => {
        expect(GameTimeSchema.safeParse(-1).success).toBe(false);
        expect(GameTimeSchema.safeParse(Number.NaN).success).toBe(
            false,
        );
        expect(GameTimeSchema.parse(1000)).toBe(1000);
    });

    it('prüft Event-Payloads gegen ihr Schema', () => {
        expect(
            EVENT_SCHEMAS.build_complete.safeParse({
                villageId: 1,
                queueId: 2,
            }).success,
        ).toBe(true);
        // Feld fehlt (z. B. Event aus einer älteren Programmversion)
        expect(
            EVENT_SCHEMAS.build_complete.safeParse({ villageId: 1 })
                .success,
        ).toBe(false);
        expect(
            EVENT_SCHEMAS.arrival.safeParse({ movementId: 'x' })
                .success,
        ).toBe(false);
    });

    it('erkennt unbekannte WebSocket-Nachrichten', () => {
        expect(
            WorldMessageSchema.safeParse({
                type: 'village_updated',
                villageId: 1,
            }).success,
        ).toBe(true);
        expect(
            WorldMessageSchema.safeParse({ type: 'aliens_landed' })
                .success,
        ).toBe(false);
    });
});
