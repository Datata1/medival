import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Duration, type Units } from '@medival/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recruitUnits, sendUnits } from '../src/engine/military.js';
import type { World } from '../src/engine/world.js';
import { WorldManager } from '../src/engine/worldManager.js';

let dir: string;
let manager: WorldManager;
let world: World;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-mil-'));
    manager = new WorldManager(dir);
    world = manager.createWorld('Kriegswelt', {
        speed: 100,
        unitSpeed: 100,
        mapSize: 40,
        botCount: 3,
        barbarianCount: 8,
        // Barbaren ruhig stellen: Diese Tests prüfen anderes, und tickende
        // Dörfer würden Ereigniszahlen und Ressourcen unvorhersehbar machen.
        // Barbarenverhalten hat eine eigene Datei (barbarian.test.ts).
        barbarianAttemptsPerHour: 0,
        seed: 999,
    });
    world.pause(); // deterministic: advance time only via skip()
});

afterEach(() => {
    manager.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
});

/** Advance game time and process everything due. */
function forward(ms: number) {
    world.clock.skip(ms);
    world.scheduler.processDue();
}

/** Give village 1 a barracks + resources instantly (test shortcut via direct DB). */
function cheatPrepare(
    levels: Record<string, number>,
    resources = 50_000,
) {
    for (const [type, level] of Object.entries(levels)) {
        world.sqlite
            .prepare(
                'UPDATE buildings SET level = ? WHERE village_id = 1 AND type = ?',
            )
            .run(level, type);
    }
    world.sqlite
        .prepare(
            'UPDATE villages SET wood = ?, clay = ?, iron = ?, resources_updated_at = ? WHERE id = 1',
        )
        .run(resources, resources, resources, world.now());
}

function firstBarbarian(): { id: number; units: Units } {
    const row = world.sqlite
        .prepare(
            'SELECT id FROM villages WHERE player_id IS NULL ORDER BY id LIMIT 1',
        )
        .get() as { id: number };
    return { id: row.id, units: world.getUnits(row.id) };
}

describe('recruitment', () => {
    it('recruits units one at a time through the queue', () => {
        cheatPrepare({ barracks: 5, farm: 10, warehouse: 20 });
        recruitUnits(world, 1, 'spear', 3);
        expect(world.getUnits(1).spear ?? 0).toBe(0);
        // spear at speed 100: 10.2s per unit
        forward(11_000);
        expect(world.getUnits(1).spear).toBe(1);
        forward(25_000);
        expect(world.getUnits(1).spear).toBe(3);
        expect(world.villageView(1).recruitQueue).toHaveLength(0);
    });

    it('runs barracks orders sequentially, but barracks and stable in parallel', () => {
        cheatPrepare({
            barracks: 5,
            stable: 5,
            farm: 15,
            warehouse: 25,
        });
        recruitUnits(world, 1, 'spear', 2);
        recruitUnits(world, 1, 'axe', 1); // waits behind spears
        recruitUnits(world, 1, 'light_cavalry', 1); // parallel in the stable (18s)
        forward(19_000); // one spear (10.2s) and the cavalry (18s) done
        const u = world.getUnits(1);
        expect(u.spear).toBe(1);
        expect(u.light_cavalry).toBe(1);
        expect(u.axe ?? 0).toBe(0);
        forward(40_000);
        const done = world.getUnits(1);
        expect(done.spear).toBe(2);
        expect(done.axe).toBe(1);
    });

    it('rejects recruitment without the building or beyond farm space', () => {
        expect(() => recruitUnits(world, 1, 'spear', 1)).toThrow(
            'barracks_missing',
        );
        cheatPrepare({ barracks: 1, farm: 1 });
        expect(() => recruitUnits(world, 1, 'spear', 500)).toThrow(
            'farm_too_small',
        );
    });
});

describe('attacks & loot', () => {
    it('farms a barbarian village: win, loot, return', () => {
        cheatPrepare({ barracks: 5, farm: 15, warehouse: 20 });
        world.addUnits(1, { axe: 200, light_cavalry: 20 });
        const barb = firstBarbarian();

        sendUnits(world, 1, barb.id, 'attack', {
            axe: 200,
            light_cavalry: 20,
        });
        expect(world.getUnits(1).axe ?? 0).toBe(0);

        forward(Duration.hours(3)); // out and back
        const after = world.getUnits(1);
        expect(after.axe).toBeGreaterThan(150); // some losses vs the garrison
        expect(world.getUnits(barb.id).spear ?? 0).toBe(0); // garrison wiped

        const report = world.sqlite
            .prepare(
                'SELECT * FROM reports WHERE player_id = 1 ORDER BY id LIMIT 1',
            )
            .get() as { type: string; payload_json: string };
        expect(report.type).toBe('attack');
        const payload = JSON.parse(report.payload_json);
        expect(payload.attackerWon).toBe(true);
        expect(
            payload.loot.wood + payload.loot.clay + payload.loot.iron,
        ).toBeGreaterThan(0);
    });

    it('loot arrives home with the returning troops', () => {
        cheatPrepare({ farm: 15, warehouse: 20 });
        world.addUnits(1, { light_cavalry: 50 });
        const barb = firstBarbarian();
        // Zero out home resources to measure the loot delta.
        world.sqlite
            .prepare(
                'UPDATE villages SET wood = 0, clay = 0, iron = 0, resources_updated_at = ? WHERE id = 1',
            )
            .run(world.now());
        world.sqlite
            .prepare(
                'UPDATE buildings SET level = 0 WHERE village_id = 1 AND type IN (?, ?, ?)',
            )
            .run('timber_camp', 'clay_pit', 'iron_mine');

        sendUnits(world, 1, barb.id, 'attack', { light_cavalry: 50 });
        forward(Duration.hours(3));
        const res = world.villageView(1).resources;
        expect(res.wood + res.clay + res.iron).toBeGreaterThan(500);
    });

    it('rejects attacking own village and supporting foreign ones', () => {
        world.addUnits(1, { spear: 10 });
        const barb = firstBarbarian();
        expect(() =>
            sendUnits(world, 1, 1, 'attack', { spear: 5 }),
        ).toThrow();
        expect(() =>
            sendUnits(world, 1, barb.id, 'support', { spear: 5 }),
        ).toThrow('support_own_only');
        expect(() =>
            sendUnits(world, 1, barb.id, 'attack', { spear: 999 }),
        ).toThrow('not_enough_units');
    });
});

describe('conquest', () => {
    it('nobles lower loyalty and take the village', () => {
        cheatPrepare({ farm: 30, warehouse: 25 });
        world.addUnits(1, { axe: 500, noble: 5 });
        const barb = firstBarbarian();

        // 5 surviving nobles deal at least 5 × 20 = 100 loyalty damage → conquest.
        sendUnits(world, 1, barb.id, 'attack', { axe: 500, noble: 5 });
        forward(Duration.hours(3));

        const owner = (
            world.sqlite
                .prepare('SELECT player_id FROM villages WHERE id = ?')
                .get(barb.id) as {
                player_id: number | null;
            }
        ).player_id;
        expect(owner).toBe(1);
        const v = world.getVillageRow(barb.id);
        expect(v.loyalty).toBe(25);
        // Exactly one noble settles in as administrator; the rest return home.
        forward(Duration.hours(3));
        expect(world.getUnits(1).noble).toBe(4);
    });

    it('loyalty regenerates over game time', () => {
        const barb = firstBarbarian();
        world.sqlite
            .prepare(
                'UPDATE villages SET loyalty = 50, loyalty_updated_at = ? WHERE id = ?',
            )
            .run(world.now(), barb.id);
        world.clock.skip(Duration.hours(1)); // 1h × speed 100 = +100 loyalty, capped
        expect(world.settleLoyalty(barb.id)).toBe(100);
    });
});

describe('support & population', () => {
    it('support merges into the target village', () => {
        // Give the player a second village.
        const second = world.sqlite
            .prepare(
                'SELECT id FROM villages WHERE player_id IS NULL ORDER BY id LIMIT 1',
            )
            .get() as { id: number };
        world.sqlite
            .prepare('UPDATE villages SET player_id = 1 WHERE id = ?')
            .run(second.id);
        world.addUnits(1, { sword: 30 });

        sendUnits(world, 1, second.id, 'support', { sword: 30 });
        forward(Duration.hours(3));
        expect(
            world.getUnits(second.id).sword ?? 0,
        ).toBeGreaterThanOrEqual(30);
    });

    it('traveling units still occupy farm space at home', () => {
        cheatPrepare({ barracks: 5, farm: 15, warehouse: 20 });
        world.addUnits(1, { axe: 100 });
        const before = world.villageView(1).popUsed;
        const barb = firstBarbarian();
        sendUnits(world, 1, barb.id, 'attack', { axe: 100 });
        const during = world.villageView(1).popUsed;
        expect(during).toBe(before);
    });
});
