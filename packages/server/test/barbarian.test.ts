import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    createRng,
    Duration,
    EMPTY_BUILDING_LEVELS,
    farmCapacity,
    STARTING_BUILDINGS,
} from '@medival/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    type BarbarianSnapshot,
    decideBarbarianAction,
} from '../src/ai/decide/barbarian.js';
import type { World } from '../src/engine/world.js';
import { WorldManager } from '../src/engine/worldManager.js';

// ── Entscheidung: pure, ohne Datenbank ────────────────────────────────

/**
 * Ein Snapshot als Literal — genau das ist der Gewinn der puren
 * Entscheidungsschicht (plans/14-barbarendoerfer.md): kein SQLite, kein
 * Scheduler, keine Welt.
 */
function snapshot(
    patch: Partial<BarbarianSnapshot> = {},
): BarbarianSnapshot {
    return {
        levels: { ...EMPTY_BUILDING_LEVELS, ...STARTING_BUILDINGS },
        resources: { wood: 5000, clay: 5000, iron: 5000 },
        popInUse: 10,
        points: 100,
        building: false,
        recruiting: false,
        maxPoints: 1500,
        ...patch,
    };
}

/** Was kommt bei vielen Zügen heraus? Einzelne Züge sind zufällig. */
function tally(
    base: Partial<BarbarianSnapshot>,
    runs = 3000,
): Map<string, number> {
    const rng = createRng(31337);
    const counts = new Map<string, number>();
    for (let i = 0; i < runs; i++) {
        const action = decideBarbarianAction(snapshot(base), rng);
        const key =
            action.kind === 'build'
                ? `build:${action.building}`
                : action.kind === 'recruit'
                  ? `recruit:${action.unit}`
                  : 'idle';
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}

describe('Barbaren-Entscheidung (pure)', () => {
    it('tut nichts, wenn nichts bezahlbar ist', () => {
        const counts = tally({
            resources: { wood: 0, clay: 0, iron: 0 },
        });
        expect([...counts.keys()]).toEqual(['idle']);
    });

    it('baut nichts mehr, sobald der Punktedeckel erreicht ist', () => {
        const counts = tally({ points: 1500, maxPoints: 1500 });
        const builds = [...counts.keys()].filter((k) =>
            k.startsWith('build:'),
        );
        expect(builds).toEqual([]);
    });

    it('rekrutiert über dem Deckel weiter — sonst wird das Dorf wehrlos', () => {
        const counts = tally({
            points: 1500,
            maxPoints: 1500,
            levels: {
                ...EMPTY_BUILDING_LEVELS,
                ...STARTING_BUILDINGS,
                barracks: 3,
                farm: 5,
            },
        });
        const recruits = [...counts.keys()].filter((k) =>
            k.startsWith('recruit:'),
        );
        expect(recruits.length).toBeGreaterThan(0);
    });

    it('rührt niemals Stall oder Adelshof an', () => {
        // Reiche Barbaren mit allen Voraussetzungen: Selbst dann nicht.
        const counts = tally({
            resources: { wood: 1e9, clay: 1e9, iron: 1e9 },
            levels: {
                ...EMPTY_BUILDING_LEVELS,
                headquarters: 25,
                barracks: 10,
                stable: 10,
                farm: 25,
                warehouse: 30,
            },
        });
        expect(counts.get('build:stable')).toBeUndefined();
        expect(counts.get('build:academy')).toBeUndefined();
    });

    it('rekrutiert nur Infanterie', () => {
        const counts = tally({
            levels: {
                ...EMPTY_BUILDING_LEVELS,
                ...STARTING_BUILDINGS,
                barracks: 5,
                stable: 5,
                farm: 10,
            },
            resources: { wood: 1e6, clay: 1e6, iron: 1e6 },
        });
        const units = [...counts.keys()]
            .filter((k) => k.startsWith('recruit:'))
            .map((k) => k.slice('recruit:'.length))
            .sort();
        expect(units).toEqual(['spear', 'sword']);
    });

    it('rekrutiert nicht ohne Kaserne', () => {
        const counts = tally({
            levels: { ...EMPTY_BUILDING_LEVELS, ...STARTING_BUILDINGS },
        });
        expect(
            [...counts.keys()].filter((k) => k.startsWith('recruit:')),
        ).toEqual([]);
    });

    it('zieht den Bauernhof vor, wenn die Bevölkerung klemmt', () => {
        const levels = {
            ...EMPTY_BUILDING_LEVELS,
            ...STARTING_BUILDINGS,
            farm: 5,
        };
        const tight = tally({
            levels,
            popInUse: farmCapacity(5) - 1,
        });
        const roomy = tally({ levels, popInUse: 5 });

        expect(tight.get('build:farm') ?? 0).toBeGreaterThan(
            (roomy.get('build:farm') ?? 0) * 3,
        );
    });

    it('zieht den Speicher vor, wenn das Lager voll ist', () => {
        const levels = {
            ...EMPTY_BUILDING_LEVELS,
            ...STARTING_BUILDINGS,
            warehouse: 3,
        };
        // Lager randvoll (Kapazität bei Stufe 3 liegt bei ~1512).
        const full = tally({
            levels,
            resources: { wood: 1500, clay: 1500, iron: 1500 },
        });
        const empty = tally({
            levels,
            resources: { wood: 400, clay: 400, iron: 400 },
        });

        expect(full.get('build:warehouse') ?? 0).toBeGreaterThan(
            empty.get('build:warehouse') ?? 0,
        );
    });

    it('baut nicht, während schon etwas in der Bauschleife steht', () => {
        const counts = tally({ building: true });
        expect(
            [...counts.keys()].filter((k) => k.startsWith('build:')),
        ).toEqual([]);
    });

    it('ist träge: auch mit vollem Lager passiert nicht immer etwas', () => {
        const counts = tally({});
        // Ein optimierender Spieler würde jede Gelegenheit nutzen. Barbaren
        // nicht — genau das unterscheidet sie von den Bots aus Plan 15.
        expect(counts.get('idle') ?? 0).toBeGreaterThan(100);
    });

    it('ist deterministisch — gleicher Seed, gleiche Folge', () => {
        const run = () => {
            const rng = createRng(4711);
            return Array.from({ length: 50 }, () =>
                JSON.stringify(decideBarbarianAction(snapshot(), rng)),
            );
        };
        expect(run()).toEqual(run());
    });
});

// ── Engine: eine simulierte Spielwoche ────────────────────────────────

describe('Barbarendörfer in einer laufenden Welt', () => {
    let dir: string;
    let manager: WorldManager;
    let world: World;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-barb-'));
        manager = new WorldManager(dir);
        world = manager.createWorld('Barbarenwelt', {
            speed: 100,
            unitSpeed: 100,
            mapSize: 40,
            botCount: 0,
            barbarianCount: 20,
            seed: 8080,
            // Basisrate × speed = wirksame Rate: 0.04 × 100 = 4 Versuche
            // je Stunde und Dorf.
            barbarianAttemptsPerHour: 0.04,
            barbarianMaxPoints: 400,
        });
    });

    afterAll(() => {
        manager.shutdown();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const barbarians = () =>
        world.sqlite
            .prepare(
                'SELECT id, points FROM villages WHERE player_id IS NULL ORDER BY id',
            )
            .all() as { id: number; points: number }[];

    it('plant beim Erzeugen genau einen Tick je Barbarendorf', () => {
        const pending = world.sqlite
            .prepare(
                `SELECT COUNT(*) AS n FROM events WHERE type = 'barbarian_tick'`,
            )
            .get() as { n: number };
        expect(pending.n).toBe(20);
    });

    it('wächst über eine simulierte Spielwoche', () => {
        const before = barbarians();
        const start = before.reduce((s, v) => s + v.points, 0);

        // Eine Spielwoche in Scheiben, damit Bauzeiten dazwischen ablaufen.
        for (let hour = 0; hour < 24 * 7; hour++) {
            world.clock.skip(Duration.hours(1));
            world.scheduler.processDue();
        }

        const after = barbarians();
        const end = after.reduce((s, v) => s + v.points, 0);
        expect(end).toBeGreaterThan(start);
        // Nicht nur eines wächst, sondern die Mehrheit.
        const grown = after.filter(
            (v, i) => v.points > (before[i]?.points ?? 0),
        );
        expect(grown.length).toBeGreaterThan(after.length / 2);
    });

    it('überschreitet den Punktedeckel nicht wesentlich', () => {
        // Ein laufendes Bauvorhaben darf den Deckel überschießen — es wurde
        // begonnen, als das Dorf noch darunter lag. Danach ist Schluss.
        for (const v of barbarians()) {
            expect(v.points).toBeLessThan(400 * 1.5);
        }
    });

    it('greift niemals an', () => {
        const attacks = world.sqlite
            .prepare(
                `SELECT COUNT(*) AS n FROM movements m
                 JOIN villages v ON v.id = m.origin_village_id
                 WHERE v.player_id IS NULL`,
            )
            .get() as { n: number };
        expect(attacks.n).toBe(0);
    });

    it('hält die Kette am Leben — nach der Woche ticken alle weiter', () => {
        const pending = world.sqlite
            .prepare(
                `SELECT COUNT(DISTINCT json_extract(payload_json, '$.villageId')) AS n
                 FROM events WHERE type = 'barbarian_tick'`,
            )
            .get() as { n: number };
        expect(pending.n).toBe(20);
    });

    it('verdoppelt die Ketten nicht beim erneuten Öffnen', () => {
        // Der gefährlichste Fehler dieses Plans: Jedes Öffnen einer Welt
        // würde die Zahl der Events verdoppeln, bis Barbaren im Sekundentakt
        // bauen. `startBarbarianTicks` ist deshalb idempotent.
        const count = () =>
            (
                world.sqlite
                    .prepare(
                        `SELECT COUNT(*) AS n FROM events WHERE type = 'barbarian_tick'`,
                    )
                    .get() as { n: number }
            ).n;
        const before = count();
        manager.getWorld(world.id);
        manager.getWorld(world.id);
        expect(count()).toBe(before);
    });
});

describe('Barbaren abschaltbar', () => {
    it('plant bei Rate 0 keinen einzigen Tick', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'medival-still-'),
        );
        const manager = new WorldManager(dir);
        const world = manager.createWorld('Stille', {
            speed: 100,
            mapSize: 40,
            botCount: 0,
            barbarianCount: 10,
            seed: 1,
            barbarianAttemptsPerHour: 0,
        });

        const pending = world.sqlite
            .prepare(
                `SELECT COUNT(*) AS n FROM events WHERE type = 'barbarian_tick'`,
            )
            .get() as { n: number };
        expect(pending.n).toBe(0);

        manager.shutdown();
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
