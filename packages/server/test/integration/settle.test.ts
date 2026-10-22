import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { continentOf, settlementCapacity } from '@medival/shared';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { settleNewPlayer } from '../../src/engine/settle.js';
import { WorldManager } from '../../src/engine/worldManager.js';
import { givenPlayer } from '../harness/given.js';
import { pendingEvents } from '../harness/query.js';
import { createTestWorld, type TestWorld } from '../harness/world.js';

/**
 * Weltkarte 1000×1000 und Ansiedeln am Rand (plans/19-prototyp/19-6).
 */

let tw: TestWorld | null = null;
afterEach(() => {
    tw?.dispose();
    tw = null;
});

const distanceFromCenter = (
    world: TestWorld['world'],
    villageId: number,
) => {
    const v = world.getVillageRow(villageId);
    const c = Math.floor(world.settings.mapSize / 2);
    return Math.hypot(v.x - c, v.y - c);
};

describe('Weltstart auf 1000×1000', () => {
    it('legt 300 Bots und 2 000 Barbaren rund um die Mitte an', () => {
        const started = performance.now();
        tw = createTestWorld({
            mapSize: 1000,
            botCount: 300,
            barbarianCount: 2_000,
            seed: 1000,
        });
        const elapsed = performance.now() - started;
        const { world } = tw;

        const rows = world.sqlite
            .prepare('SELECT x, y FROM villages')
            .all() as { x: number; y: number }[];
        expect(rows).toHaveLength(2_301);
        expect(world.settledCount).toBe(2_301);
        // r(2301) bei Dichte 0,15 ≈ 70: alles in den vier mittleren Kontinenten.
        const continents = new Set(
            rows.map((r) => continentOf(r.x, r.y)),
        );
        expect([...continents].sort()).toEqual([44, 45, 54, 55]);
        const farthest = Math.max(
            ...rows.map((r) => Math.hypot(r.x - 500, r.y - 500)),
        );
        expect(farthest).toBeLessThan(80);
        // Gemessen (Laptop, 2026-10-22): 0,63 s. Großzügig für den CI-Runner.
        expect(elapsed).toBeLessThan(15_000);
    }, 60_000);

    it('mischt Bots und Barbaren über den ganzen Kreis', () => {
        tw = createTestWorld({
            mapSize: 200,
            botCount: 30,
            barbarianCount: 300,
            seed: 7,
        });
        const { world } = tw;
        const avg = (where: string) =>
            (
                world.sqlite
                    .prepare(
                        `SELECT AVG((x - 100) * (x - 100) + (y - 100) * (y - 100)) AS d FROM villages WHERE ${where}`,
                    )
                    .get() as { d: number }
            ).d;
        const bots = Math.sqrt(avg('player_id > 1'));
        const barbarians = Math.sqrt(avg('player_id IS NULL'));
        // Gleich verteilt: mittlerer Abstand zur Mitte innerhalb von 20 %.
        expect(Math.abs(bots - barbarians) / barbarians).toBeLessThan(
            0.2,
        );
    });
});

describe('Ansiedeln in einer laufenden Welt', () => {
    it('setzt neue Spieler an den Rand, mit Barbaren im selben Ring', () => {
        tw = createTestWorld({
            mapSize: 400,
            botCount: 20,
            barbarianCount: 100,
            barbariansPerSettler: 2,
            seed: 11,
        });
        const { world } = tw;
        const before = world.settledCount;
        let farthestSoFar = Math.max(
            ...(
                world.sqlite
                    .prepare('SELECT id FROM villages')
                    .all() as {
                    id: number;
                }[]
            ).map((v) => distanceFromCenter(world, v.id)),
        );
        let outward = 0;
        for (let i = 0; i < 100; i++) {
            const player = givenPlayer(world, { name: `Neu ${i}` });
            const village = settleNewPlayer(world, player, `Neu ${i}`);
            const d = distanceFromCenter(world, village);
            // Am Rand: höchstens eine Ringbreite innerhalb des bisher äußersten.
            if (d >= farthestSoFar - 3 * 2) outward++;
            farthestSoFar = Math.max(farthestSoFar, d);
        }
        expect(outward).toBeGreaterThanOrEqual(95);
        // Je Spieler genau ein Dorf und zwei Barbaren.
        expect(world.settledCount).toBe(before + 100 * 3);
        const barbarians = world.sqlite
            .prepare(
                'SELECT COUNT(*) AS n FROM villages WHERE player_id IS NULL',
            )
            .get() as { n: number };
        expect(barbarians.n).toBe(100 + 200);
    });

    it('lässt die neuen Barbaren sofort ticken', () => {
        tw = createTestWorld({
            mapSize: 100,
            barbarianAttemptsPerHour: 1,
            barbariansPerSettler: 3,
            seed: 12,
        });
        const { world } = tw;
        const ticksBefore = pendingEvents(
            world,
            'barbarian_tick',
        ).length;
        settleNewPlayer(world, givenPlayer(world), 'Neu');
        expect(pendingEvents(world, 'barbarian_tick').length).toBe(
            ticksBefore + 3,
        );
    });

    it('meldet map_full, wenn der Kreis den Rand erreicht', () => {
        tw = createTestWorld({
            mapSize: 20,
            barbariansPerSettler: 0,
            seed: 3,
        });
        const { world } = tw;
        const capacity = settlementCapacity(
            20,
            world.settings.settlementDensity,
        );
        expect(() => {
            for (let i = 0; i <= capacity; i++)
                settleNewPlayer(world, givenPlayer(world), `Neu ${i}`);
        }).toThrow('map_full');
    });

    it('speichert den Zähler über einen Neustart', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'medival-settle-'),
        );
        try {
            let manager = new WorldManager(dir);
            const world = manager.createWorld('Zähler', {
                mapSize: 100,
                botCount: 2,
                barbarianCount: 5,
                seed: 5,
            });
            settleNewPlayer(world, givenPlayer(world), 'Neu');
            const count = world.settledCount;
            const id = world.id;
            manager.shutdown();

            const meta = new Database(path.join(dir, 'worlds.sqlite'));
            const row = meta
                .prepare(
                    'SELECT settled_count AS n FROM worlds WHERE id = ?',
                )
                .get(id) as { n: number };
            meta.close();
            expect(row.n).toBe(count);

            manager = new WorldManager(dir);
            expect(manager.getWorld(id)?.settledCount).toBe(count);
            manager.shutdown();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
