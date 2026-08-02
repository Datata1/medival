import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Duration } from '@medival/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataIntegrityError } from '../src/db/parse.js';
import type { World } from '../src/engine/world.js';
import { WorldManager } from '../src/engine/worldManager.js';

let dir: string;
let manager: WorldManager;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-valid-'));
    manager = new WorldManager(dir);
});

afterEach(() => {
    manager.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
});

function smallWorld(): World {
    return manager.createWorld('Prüfwelt', {
        speed: 100,
        unitSpeed: 100,
        mapSize: 40,
        // Weder Bots noch Barbaren: Diese Tests prüfen die Warteschlange
        // selbst, und beide würden sie dauerhaft gefüllt halten.
        botCount: 0,
        barbarianCount: 8,
        barbarianAttemptsPerHour: 0,
        seed: 4242,
    });
}

describe('Welt-Einstellungen werden geprüft, nicht behauptet', () => {
    it('lehnt eine Geschwindigkeit ab, die keine Zahl ist', () => {
        // Der belegte Bug aus plans/08: {"speed":"schnell"} lief bis in
        // buildTime() und schrieb NaN-Zeitstempel in die Welt-Datei.
        expect(() =>
            manager.createWorld('Kaputt', {
                speed: 'schnell',
            } as never),
        ).toThrow();
    });

    it('lehnt unsinnige Kartengrößen und Dorfzahlen ab', () => {
        expect(() =>
            manager.createWorld('Zu klein', { mapSize: -5 } as never),
        ).toThrow();
        expect(() =>
            manager.createWorld('Zu voll', {
                botCount: 999_999,
            } as never),
        ).toThrow();
    });

    it('schreibt keine NaN-Zeitstempel in die Datenbank', () => {
        const world = smallWorld();
        world.pause();
        world.upgradeBuilding(1, 'timber_camp');
        const rows = world.sqlite
            .prepare('SELECT completes_at FROM build_queue')
            .all() as Array<{ completes_at: number }>;
        expect(rows).toHaveLength(1);
        for (const row of rows) {
            expect(Number.isFinite(row.completes_at)).toBe(true);
        }
    });
});

describe('Korrupte Savegame-Daten degradieren sauber', () => {
    it('erkennt eine kaputte units_json statt sie stillschweigend zu verschlucken', () => {
        const world = smallWorld();
        world.pause();
        world.addUnits(1, { spear: 10 });
        const barb = world.sqlite
            .prepare(
                'SELECT id FROM villages WHERE player_id IS NULL LIMIT 1',
            )
            .get() as { id: number };

        world.sqlite
            .prepare(
                `INSERT INTO movements (origin_village_id, target_village_id, kind,
                 units_json, departure_game_time, arrival_game_time)
                 VALUES (?, ?, 'attack', ?, 0, 1000)`,
            )
            .run(1, barb.id, '{"drache": 3}');

        // popInUse liest die Spalte — der Fehler ist eindeutig, nicht diffus.
        expect(() => world.popInUse(1)).toThrow(DataIntegrityError);
    });

    it('ein Event mit unbekanntem Typ legt die Welt nicht lahm', () => {
        const world = smallWorld();
        world.pause();
        world.sqlite
            .prepare(
                `INSERT INTO events (due_game_time, type, payload_json)
                 VALUES (?, 'aliens_landed', '{}')`,
            )
            .run(10);
        world.upgradeBuilding(1, 'timber_camp');

        world.clock.skip(Duration.hours(1));
        world.scheduler.processDue();

        // Das Bauvorhaben wurde trotz des Fremdkörpers abgearbeitet.
        expect(world.villageView(1).buildings.timber_camp).toBe(2);
    });

    it('ein Event mit fehlerhafter Payload blockiert die Warteschlange nicht', () => {
        const world = smallWorld();
        world.pause();
        // 'arrival' ohne movementId — etwa aus einer älteren Programmversion.
        world.sqlite
            .prepare(
                `INSERT INTO events (due_game_time, type, payload_json)
                 VALUES (?, 'arrival', '{"wrongField": 1}')`,
            )
            .run(5);
        world.upgradeBuilding(1, 'clay_pit');

        world.clock.skip(Duration.hours(1));
        world.scheduler.processDue();

        expect(world.villageView(1).buildings.clay_pit).toBe(2);
        expect(world.scheduler.nextDue()).toBeNull();
    });
});
