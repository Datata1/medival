import { Duration } from '@medival/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { perceiveBot } from '../../src/ai/perceive.js';
import { botTickTimings } from '../../src/engine/health.js';
import type { World } from '../../src/engine/world.js';
import {
    givenPlayer,
    givenTribe,
    givenVillage,
} from '../harness/given.js';
import {
    advanceYielding,
    createTestWorld,
    type TestWorld,
} from '../harness/world.js';
import { perceiveBot as perceiveBotLegacy } from './oracle/perceive-legacy.js';

/**
 * Bot-Wahrnehmung skalierbar (plans/19-prototyp/19-5).
 */

let tw: TestWorld | null = null;
afterEach(() => {
    tw?.dispose();
    tw = null;
});

const botIds = (world: World) =>
    (
        world.sqlite
            .prepare(
                'SELECT id FROM players WHERE is_bot = 1 ORDER BY id',
            )
            .all() as { id: number }[]
    ).map((r) => r.id);

/** Gleitkomma-Rauschen aus dem Zusammensetzen von Verfallsschritten glätten. */
const normalize = (value: unknown) =>
    JSON.stringify(value, (_key, v) =>
        typeof v === 'number' && !Number.isInteger(v)
            ? Math.round(v * 1e6) / 1e6
            : v,
    );

describe('Gleichwertigkeit mit der Wahrnehmung vor 19-5', () => {
    /*
     * Zwei laufende Welten, an mehreren Zeitpunkten jeder Bot einmal mit der
     * neuen und einmal mit der alten Wahrnehmung (Testorakel). Erst neu
     * (schreibt nichts), dann alt (schreibt beim Abrechnen nur, was ohnehin
     * dasselbe ergibt).
     */
    it.each([
        {
            name: 'Kriegswelt',
            // Stämme und Einladungen entstehen hier sicher (siehe war-week).
            social: true,
            settings: {
                speed: 200,
                unitSpeed: 200,
                mapSize: 30,
                botCount: 8,
                barbarianCount: 4,
                seed: 99,
                barbarianAttemptsPerHour: 0,
            },
        },
        {
            name: 'Botwelt',
            social: false,
            settings: {
                speed: 100,
                unitSpeed: 100,
                mapSize: 40,
                botCount: 10,
                barbarianCount: 10,
                seed: 555,
                barbarianAttemptsPerHour: 0.04,
            },
        },
    ])(
        '$name: identischer Snapshot an zehn Zeitpunkten',
        async ({ settings, social }) => {
            tw = createTestWorld(settings);
            const { world } = tw;
            let compared = 0;
            let withTribe = 0;
            let withInvitation = 0;
            for (let checkpoint = 0; checkpoint < 10; checkpoint++) {
                await advanceYielding(
                    world,
                    Duration.hours(36 / world.settings.speed),
                    4,
                );
                for (const id of botIds(world)) {
                    const fresh = perceiveBot(world, id);
                    const legacy = perceiveBotLegacy(world, id);
                    expect(normalize(fresh)).toBe(normalize(legacy));
                    compared++;
                    if (fresh?.tribeId != null) withTribe++;
                    if ((fresh?.invitations.length ?? 0) > 0)
                        withInvitation++;
                }
            }
            expect(compared).toBeGreaterThan(50);
            // Die Kriegswelt deckt die sozialen Zweige wirklich ab.
            if (social)
                expect(withTribe + withInvitation).toBeGreaterThan(0);
        },
        120_000,
    );
});

describe('Wahrnehmung schreibt nicht', () => {
    it('kein einziger Schreibzugriff — auch nicht auf Ansehen und Einladungen', () => {
        tw = createTestWorld();
        const { world } = tw;
        const bot = givenPlayer(world, { bot: true });
        const friend = givenPlayer(world, { name: 'Freund' });
        const rival = givenPlayer(world, { name: 'Rivale' });
        givenVillage(world, bot, { x: 10, y: 10 });
        givenVillage(world, friend, { x: 14, y: 10 });
        givenVillage(world, rival, { x: 10, y: 15 });
        givenTribe(world, friend, [], 'Fremde', 'FR');
        // Ansehen in beide Richtungen, mit Verfall seit dem Stempel.
        world.sqlite
            .prepare(
                'INSERT INTO relations (player_id, other_player_id, standing, updated_at) VALUES (?, ?, ?, 0), (?, ?, ?, 0)',
            )
            .run(bot, rival, -40, friend, bot, 30);
        tw.world.clock.setTo(Duration.hours(5));

        const changes = () =>
            (
                world.sqlite
                    .prepare('SELECT total_changes() AS n')
                    .get() as {
                    n: number;
                }
            ).n;
        const before = changes();
        const snapshot = perceiveBot(world, bot);
        expect(changes()).toBe(before);
        // Freund, Rivale und das Heimatdorf der Kartenmitte (20|20).
        expect(snapshot?.targets.length).toBe(3);
        expect(snapshot?.foundingCandidates.length).toBe(3);
    });
});

describe('Räumliche Abfrage', () => {
    it('nutzt den Index auf (x, y)', () => {
        tw = createTestWorld();
        const plan = tw.world.sqlite
            .prepare(
                'EXPLAIN QUERY PLAN SELECT id FROM villages WHERE x BETWEEN 1 AND 20 AND y BETWEEN 1 AND 20',
            )
            .all() as { detail: string }[];
        expect(plan.map((p) => p.detail).join(' ')).toMatch(
            /USING (COVERING )?INDEX/,
        );
    });
});

describe('Skalierung', () => {
    /**
     * Ein Bot in der Mitte, ringsum Dörfer bei gleicher Dichte (je Dorf ein
     * Spieler, jedes vierte Feld belegt). Die Kosten je Wahrnehmung dürfen
     * nicht mit der Weltgröße wachsen, nur mit der Nachbarschaft.
     */
    function crowdedWorld(villageCount: number) {
        const t = createTestWorld({ mapSize: 500 });
        const { world } = t;
        const bot = givenPlayer(world, { bot: true });
        // Neben der Mitte: Dort steht das Heimatdorf aus der Kartengenerierung.
        givenVillage(world, bot, { x: 251, y: 251 });
        world.sqlite.transaction(() => {
            let placed = 0;
            for (let ring = 2; placed < villageCount; ring += 2) {
                for (
                    let dx = -ring;
                    dx <= ring && placed < villageCount;
                    dx += 2
                )
                    for (const dy of [-ring, ring]) {
                        if (placed >= villageCount) break;
                        for (const [x, y] of [
                            [250 + dx, 250 + dy],
                            [250 + dy, 250 + dx],
                        ] as [number, number][]) {
                            if (placed >= villageCount) break;
                            const exists = world.sqlite
                                .prepare(
                                    'SELECT 1 FROM villages WHERE x = ? AND y = ?',
                                )
                                .get(x, y);
                            if (exists) continue;
                            givenVillage(world, givenPlayer(world), {
                                x,
                                y,
                            });
                            placed++;
                        }
                    }
            }
        })();
        return { t, bot };
    }

    function timePerception(world: World, bot: number, runs = 60) {
        const times: number[] = [];
        for (let i = 0; i < runs; i++) {
            const t0 = performance.now();
            perceiveBot(world, bot);
            times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        return {
            p50: times[Math.floor(runs * 0.5)] ?? 0,
            p99: times[Math.floor(runs * 0.99)] ?? 0,
        };
    }

    it('kostet bei doppelter Dorfzahl kaum mehr', () => {
        const small = crowdedWorld(5_000);
        const smallTime = timePerception(small.t.world, small.bot);
        small.t.dispose();
        const large = crowdedWorld(10_000);
        tw = large.t;
        const largeTime = timePerception(large.t.world, large.bot);

        /*
         * Gemessen (Laptop, 2026-10-22), sehr dichte Welt mit ~3 600 Dörfern
         * in Reichweite: 5 000 Dörfer p50 5,2 ms / p99 7,4 ms, 10 000 Dörfer
         * p50 5,0 ms / p99 5,9 ms. Die alte Wahrnehmung brauchte p50 438 ms
         * bzw. 500 ms — sie las jeden Spieler samt Dörfern und schrieb für
         * jedes Paar das Ansehen. Großzügige Schwellen, weil der CI-Runner
         * langsamer ist.
         */
        expect(smallTime.p50).toBeLessThan(25);
        expect(largeTime.p50).toBeLessThan(smallTime.p50 * 1.5);
    }, 120_000);
});

describe('Messpunkt', () => {
    it('/api/health meldet die Dauer je Bot-Tick', async () => {
        tw = createTestWorld({ botCount: 4, seed: 3 });
        botTickTimings.reset();
        await advanceYielding(tw.world, Duration.minutes(10), 2);
        const snap = tw.manager.health.snapshot(
            tw.manager.loadedWorlds(),
        );
        expect(snap.botTick.count).toBeGreaterThan(0);
        expect(snap.botTick.p99Ms).toBeGreaterThanOrEqual(
            snap.botTick.p50Ms,
        );
    });
});
