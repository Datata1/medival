import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    Duration,
    farmCapacity,
    totalBuildingPop,
} from '@medival/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorldManager } from '../src/engine/worldManager.js';

let dir: string;
let manager: WorldManager;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-test-'));
    manager = new WorldManager(dir);
});

afterEach(() => {
    manager.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
});

function createSmallWorld() {
    return manager.createWorld('Testwelt', {
        speed: 100,
        mapSize: 40,
        botCount: 5,
        barbarianCount: 10,
        // Barbaren ruhig stellen: Diese Tests prüfen anderes, und tickende
        // Dörfer würden Ereigniszahlen und Ressourcen unvorhersehbar machen.
        // Barbarenverhalten hat eine eigene Datei (barbarian.test.ts).
        barbarianAttemptsPerHour: 0,
        seed: 12345,
    });
}

describe('world creation', () => {
    it('generates player, bots and barbarians', () => {
        const world = createSmallWorld();
        const map = world.sqlite
            .prepare('SELECT COUNT(*) AS n FROM villages')
            .get() as { n: number };
        expect(map.n).toBe(1 + 5 + 10);
        const playerVillage = world.sqlite
            .prepare('SELECT * FROM villages WHERE player_id = 1')
            .get() as { x: number; y: number };
        expect(playerVillage.x).toBe(20);
        expect(playerVillage.y).toBe(20);
    });

    it('is deterministic for the same seed', () => {
        const a = createSmallWorld();
        const b = manager.createWorld('Zwilling', {
            speed: 100,
            mapSize: 40,
            botCount: 5,
            barbarianCount: 10,
            seed: 12345,
            barbarianAttemptsPerHour: 0,
        });
        const rowsA = a.sqlite
            .prepare('SELECT x, y FROM villages ORDER BY id')
            .all();
        const rowsB = b.sqlite
            .prepare('SELECT x, y FROM villages ORDER BY id')
            .all();
        expect(rowsA).toEqual(rowsB);
    });
});

describe('economy & build queue', () => {
    it('produces resources over game time (lazy evaluation)', () => {
        const world = createSmallWorld();
        const village = world.villageView(1);
        world.clock.skip(Duration.hours(1));
        const later = world.villageView(1);
        // level 1 camp: 30/h × speed 100 = 3000/h, clamped by warehouse (1000)
        expect(later.resources.wood).toBe(later.capacity);
        expect(later.resources.wood).toBeGreaterThan(
            village.resources.wood,
        );
    });

    it('upgrades a building through the queue', () => {
        const world = createSmallWorld();
        world.upgradeBuilding(1, 'timber_camp');
        let view = world.villageView(1);
        expect(view.buildQueue).toHaveLength(1);
        expect(view.resources.wood).toBeLessThan(500);

        // Jump past completion and force event processing.
        world.clock.skip(Duration.hours(1));
        world.scheduler.processDue();
        view = world.villageView(1);
        expect(view.buildQueue).toHaveLength(0);
        expect(view.buildings.timber_camp).toBe(2);
        expect(view.points).toBeGreaterThan(0);
    });

    it('queues sequentially and enforces the queue limit', () => {
        const world = createSmallWorld();
        world.clock.skip(Duration.hours(1)); // fill storage
        for (let i = 0; i < 5; i++)
            world.upgradeBuilding(1, 'warehouse');
        expect(() => world.upgradeBuilding(1, 'warehouse')).toThrow(
            'queue_full',
        );
        const view = world.villageView(1);
        const times = view.buildQueue.map((q) => q.completesAt);
        expect([...times].sort((x, y) => x - y)).toEqual(times);
        // strictly increasing target levels
        expect(view.buildQueue.map((q) => q.targetLevel)).toEqual([
            2, 3, 4, 5, 6,
        ]);
    });

    it('rejects unaffordable and gated buildings', () => {
        const world = createSmallWorld();
        expect(() => world.upgradeBuilding(1, 'academy')).toThrow();
        expect(() => world.upgradeBuilding(1, 'stable')).toThrow(
            'requirements_missing',
        );
    });

    it('never exceeds farm capacity with building population', () => {
        const world = createSmallWorld();
        const view = world.villageView(1);
        expect(view.popUsed).toBeLessThanOrEqual(view.popMax);
        expect(totalBuildingPop(view.buildings)).toBeLessThanOrEqual(
            farmCapacity(view.buildings.farm),
        );
    });
});

describe('pause & persistence', () => {
    it('game time freezes while paused', async () => {
        const world = createSmallWorld();
        world.pause();
        const t1 = world.now();
        await new Promise((r) => setTimeout(r, 30));
        expect(world.now()).toBe(t1);
        world.resume();
        expect(world.status).toBe('running');
    });

    it('survives a manager restart with clock and queue intact', () => {
        const world = createSmallWorld();
        world.clock.skip(Duration.hours(1));
        world.upgradeBuilding(1, 'clay_pit');
        const id = world.id;
        const gameTime = world.now();
        manager.shutdown();

        manager = new WorldManager(dir);
        const reloaded = manager.getWorld(id)!;
        expect(reloaded).toBeDefined();
        expect(reloaded.now()).toBeGreaterThanOrEqual(gameTime);
        // Queue survived; fast-forward completes it.
        reloaded.clock.skip(Duration.hours(2));
        reloaded.scheduler.processDue();
        expect(reloaded.villageView(1).buildings.clay_pit).toBe(2);
    });
});
