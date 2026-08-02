import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    Duration,
    EMPTY_BUILDING_LEVELS,
    farmCapacity,
    type Resources,
    STARTING_BUILDINGS,
} from '@medival/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planBot } from '../src/ai/bot.js';
import {
    decideBuild,
    type VillageSnapshot,
} from '../src/ai/decide/build.js';
import { readBotState } from '../src/ai/perceive.js';
import {
    PERSONALITIES,
    type Personality,
} from '../src/ai/personalities.js';
import type { World } from '../src/engine/world.js';
import { WorldManager } from '../src/engine/worldManager.js';

// ── Entscheidung: pure, ohne Datenbank ────────────────────────────────

const RICH: Resources = { wood: 1e6, clay: 1e6, iron: 1e6 };

function village(
    patch: Partial<VillageSnapshot> = {},
): VillageSnapshot {
    const base = {
        id: 1,
        levels: { ...EMPTY_BUILDING_LEVELS, ...STARTING_BUILDINGS },
        resources: { wood: 800, clay: 800, iron: 800 },
        ratesPerHour: { wood: 300, clay: 300, iron: 300 },
        capacity: 1000,
        popInUse: 20,
        queueLength: 0,
        ...patch,
    };
    // Ohne eigene Angabe entspricht die geplante Sicht der gebauten.
    return { plannedLevels: base.levels, ...base };
}

/**
 * Ein entwickeltes Dorf: Grundversorgung steht, damit die Persönlichkeit
 * überhaupt zum Zug kommt. Sonst entscheidet immer die Rangfolge.
 */
function developed(patch: Partial<VillageSnapshot> = {}) {
    return village({
        levels: {
            ...EMPTY_BUILDING_LEVELS,
            headquarters: 10,
            timber_camp: 15,
            clay_pit: 15,
            iron_mine: 15,
            warehouse: 20,
            farm: 15,
            barracks: 3,
        },
        resources: RICH,
        ratesPerHour: { wood: 5000, clay: 5000, iron: 5000 },
        capacity: 500_000,
        popInUse: 200,
        ...patch,
    });
}

describe('Bauentscheidung (pure)', () => {
    it('zieht den Bauernhof vor, wenn die Bevölkerung klemmt', () => {
        const levels = {
            ...EMPTY_BUILDING_LEVELS,
            ...STARTING_BUILDINGS,
            farm: 5,
        };
        const choice = decideBuild(
            village({ levels, popInUse: farmCapacity(5) - 1 }),
            'balanced',
        );
        expect(choice?.building).toBe('farm');
        expect(choice?.reason).toBe('farm');
    });

    it('baut den Speicher, wenn nichts anderes mehr hineinpasst', () => {
        // Das richtige Kriterium ist Erreichbarkeit, nicht „x Stunden
        // Produktion": Alle Ziele sind teurer als das Lager fasst, also ist
        // der Speicher tatsächlich die Grenze.
        const levels = {
            ...EMPTY_BUILDING_LEVELS,
            headquarters: 20,
            timber_camp: 22,
            clay_pit: 22,
            iron_mine: 22,
            warehouse: 1,
            farm: 20,
            barracks: 20,
            stable: 15,
            wall: 18,
        };
        const choice = decideBuild(
            village({
                levels,
                capacity: 1000,
                resources: { wood: 1000, clay: 1000, iron: 1000 },
                ratesPerHour: { wood: 9000, clay: 9000, iron: 9000 },
            }),
            'balanced',
        );
        expect(choice?.building).toBe('warehouse');
        expect(choice?.reason).toBe('warehouse');
    });

    it('baut den Speicher NICHT, nur weil die Produktion hoch ist', () => {
        // Der Fehler aus dem Browser-Lauf: Bei Speed 200 verlangte die alte
        // Regel Speicher Stufe 12, bevor überhaupt ein Rohstoffgebäude
        // ausgebaut wurde — nach einer Minute hatten alle Bots Speicher 3,0
        // und sonst nichts. Hohe Produktion allein ist kein Grund.
        const choice = decideBuild(
            village({
                levels: {
                    ...EMPTY_BUILDING_LEVELS,
                    ...STARTING_BUILDINGS,
                },
                capacity: 1000,
                resources: { wood: 900, clay: 900, iron: 900 },
                ratesPerHour: { wood: 6000, clay: 6000, iron: 6000 },
            }),
            'balanced',
        );
        expect(choice?.building).not.toBe('warehouse');
    });

    it('läuft nicht in eine Endlosschleife bei unerreichbaren Zielen', () => {
        // Wenn selbst der Speicher nicht mehr hineinpasst, gibt es nichts zu
        // entscheiden — die Funktion muss null liefern statt endlos etwas
        // vorzuschlagen, das nie bezahlbar wird.
        const choice = decideBuild(
            village({
                levels: {
                    ...EMPTY_BUILDING_LEVELS,
                    headquarters: 25,
                    timber_camp: 25,
                    clay_pit: 25,
                    iron_mine: 25,
                    warehouse: 25,
                    farm: 25,
                    barracks: 22,
                    stable: 18,
                    wall: 19,
                },
                capacity: 100,
                resources: { wood: 100, clay: 100, iron: 100 },
                ratesPerHour: { wood: 500, clay: 500, iron: 500 },
            }),
            'balanced',
        );
        expect(choice).toBeNull();
    });

    it('wählt ein Ziel, das noch nicht bezahlbar ist, und nennt die Wartezeit', () => {
        const choice = decideBuild(
            village({ resources: { wood: 0, clay: 0, iron: 0 } }),
            'balanced',
        );
        expect(choice).not.toBeNull();
        // Genau das unterscheidet Bots von Barbaren: Sie sparen auf ein Ziel.
        expect(choice?.waitFor).toBeGreaterThan(0);
    });

    it('baut nicht weiter, wenn die Schleife voll ist', () => {
        expect(
            decideBuild(village({ queueLength: 2 }), 'balanced'),
        ).toBeNull();
    });

    it('zählt die Bauschleife zur Zielstufe', () => {
        // Der Fehler aus dem ersten Lauf: `upgradeBuilding` rechnet die
        // Schleife in die Zielstufe ein, die Entscheidung tat es nicht. Ein
        // Gebäude auf Maximalstufe *in der Schleife* wurde deshalb erneut
        // vorgeschlagen und kassierte `max_level`.
        const built = {
            ...EMPTY_BUILDING_LEVELS,
            headquarters: 5,
            timber_camp: 29,
            clay_pit: 20,
            iron_mine: 20,
            warehouse: 25,
            farm: 20,
        };
        const choice = decideBuild(
            village({
                levels: built,
                plannedLevels: { ...built, timber_camp: 30 },
                queueLength: 1,
                resources: RICH,
                capacity: 500_000,
                ratesPerHour: { wood: 9000, clay: 9000, iron: 9000 },
            }),
            'balanced',
        );
        expect(choice?.building).not.toBe('timber_camp');
    });

    it('schlägt kein Gebäude ein zweites Mal auf derselben Stufe vor', () => {
        const built = {
            ...EMPTY_BUILDING_LEVELS,
            ...STARTING_BUILDINGS,
            warehouse: 5,
        };
        const choice = decideBuild(
            village({
                levels: built,
                // Speicher ist bereits auf Stufe 6 eingereiht.
                plannedLevels: { ...built, warehouse: 6 },
                queueLength: 1,
                ratesPerHour: { wood: 100_000, clay: 300, iron: 300 },
                resources: RICH,
                capacity: 500_000,
            }),
            'balanced',
        );
        // Wenn doch Speicher, dann mindestens Stufe 7 — nicht noch einmal 6.
        if (choice?.building === 'warehouse') {
            expect(choice.level).toBe(7);
        }
    });

    it('überschreitet nie die Maximalstufe', () => {
        const maxed = decideBuild(
            developed({
                levels: {
                    ...EMPTY_BUILDING_LEVELS,
                    headquarters: 30,
                    timber_camp: 30,
                    clay_pit: 30,
                    iron_mine: 30,
                    warehouse: 30,
                    farm: 30,
                    barracks: 25,
                    stable: 20,
                    wall: 20,
                    academy: 1,
                },
            }),
            'balanced',
        );
        expect(maxed).toBeNull();
    });

    it('achtet auf Voraussetzungen', () => {
        // Stall verlangt HQ 10 und Kaserne 5 — mit HQ 1 kommt er nie heraus.
        const choices = new Set<string>();
        for (const personality of PERSONALITIES) {
            const choice = decideBuild(village(), personality);
            if (choice) choices.add(choice.building);
        }
        expect(choices.has('stable')).toBe(false);
        expect(choices.has('academy')).toBe(false);
    });
});

describe('Persönlichkeiten unterscheiden sich messbar', () => {
    /** Was baut eine Persönlichkeit über viele Ausgangslagen hinweg? */
    function profile(personality: Personality): Map<string, number> {
        const counts = new Map<string, number>();
        for (let hq = 5; hq <= 20; hq++) {
            for (let barracks = 1; barracks <= 8; barracks++) {
                const choice = decideBuild(
                    developed({
                        levels: {
                            ...EMPTY_BUILDING_LEVELS,
                            headquarters: hq,
                            timber_camp: 15,
                            clay_pit: 15,
                            iron_mine: 15,
                            warehouse: 20,
                            farm: 20,
                            barracks,
                        },
                    }),
                    personality,
                );
                if (!choice) continue;
                counts.set(
                    choice.building,
                    (counts.get(choice.building) ?? 0) + 1,
                );
            }
        }
        return counts;
    }

    const profiles = new Map(
        PERSONALITIES.map((p) => [p, profile(p)] as const),
    );
    const count = (p: Personality, building: string) =>
        profiles.get(p)?.get(building) ?? 0;

    it('turtle baut mehr Wall als raider', () => {
        expect(count('turtle', 'wall')).toBeGreaterThan(
            count('raider', 'wall'),
        );
    });

    it('raider baut mehr Militärgebäude als turtle', () => {
        const military = (p: Personality) =>
            count(p, 'barracks') + count(p, 'stable');
        expect(military('raider')).toBeGreaterThan(military('turtle'));
    });

    it('expander baut mehr Hauptgebäude als turtle', () => {
        expect(count('expander', 'headquarters')).toBeGreaterThan(
            count('turtle', 'headquarters'),
        );
    });

    it('jede Persönlichkeit entscheidet sich überhaupt für etwas', () => {
        for (const p of PERSONALITIES) {
            expect(profiles.get(p)?.size ?? 0).toBeGreaterThan(0);
        }
    });
});

describe('planBot', () => {
    const snapshot = (
        personality: Personality,
        villages: VillageSnapshot[],
    ) => ({
        playerId: 2,
        personality,
        difficulty: 'normal' as const,
        state: { savingFor: {} },
        villages,
    });

    it('erzeugt einen Bau-Intent, wenn bezahlbar', () => {
        const { intents } = planBot(
            snapshot('balanced', [village({ resources: RICH })]),
        );
        expect(intents).toHaveLength(1);
        expect(intents[0]?.kind).toBe('build');
    });

    it('spart statt zu bauen, wenn es nicht reicht — und merkt sich das Ziel', () => {
        const { intents, state, nextIn } = planBot(
            snapshot('balanced', [
                village({ resources: { wood: 0, clay: 0, iron: 0 } }),
            ]),
        );
        expect(intents).toEqual([]);
        expect(state.savingFor['1']).toBeDefined();
        // Der nächste Tick liegt auf dem errechneten Zeitpunkt, nicht auf
        // einem festen Intervall.
        expect(nextIn).toBeGreaterThan(Duration.seconds(1));
    });

    it('wartet nie länger als das Höchstintervall', () => {
        // Winzige Produktion: Der errechnete Zeitpunkt läge Tage entfernt.
        // Trotzdem muss der Bot vorher noch einmal nachsehen — sonst
        // verschläft er einen Angriff.
        const { nextIn } = planBot(
            snapshot('balanced', [
                village({
                    resources: { wood: 0, clay: 0, iron: 0 },
                    ratesPerHour: { wood: 1, clay: 1, iron: 1 },
                }),
            ]),
        );
        expect(nextIn).toBeLessThanOrEqual(Duration.minutes(10));
    });

    it('behandelt mehrere Dörfer', () => {
        const { intents } = planBot(
            snapshot('balanced', [
                village({ id: 1, resources: RICH }),
                village({ id: 2, resources: RICH }),
            ]),
        );
        expect(intents.map((i) => i.kind)).toEqual(['build', 'build']);
    });

    it('ist deterministisch', () => {
        const run = () =>
            JSON.stringify(
                planBot(snapshot('raider', [developed()])).intents,
            );
        expect(run()).toBe(run());
    });
});

describe('Bot-Zustand aus der Datenbank', () => {
    it('übersteht kaputte Einträge', () => {
        for (const raw of [
            'kein json',
            'null',
            '[]',
            '{"savingFor":5}',
        ]) {
            expect(readBotState(raw).savingFor).toEqual({});
        }
    });

    it('liest ein gültiges Sparziel', () => {
        const state = readBotState(
            '{"savingFor":{"7":{"building":"barracks","level":3}}}',
        );
        expect(state.savingFor['7']).toEqual({
            building: 'barracks',
            level: 3,
        });
    });

    it('verwirft ein unbekanntes Gebäude', () => {
        expect(
            readBotState(
                '{"savingFor":{"7":{"building":"raumhafen","level":3}}}',
            ).savingFor,
        ).toEqual({});
    });
});

// ── Engine: eine simulierte Spielwoche ────────────────────────────────

describe('Bots in einer laufenden Welt', () => {
    let dir: string;
    let manager: WorldManager;
    let world: World;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-bot-'));
        manager = new WorldManager(dir);
        world = manager.createWorld('Botwelt', {
            speed: 100,
            unitSpeed: 100,
            mapSize: 40,
            botCount: 10,
            barbarianCount: 10,
            seed: 555,
            barbarianAttemptsPerHour: 0.04,
        });
    });

    afterAll(() => {
        manager.shutdown();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const pointsOf = (kind: 'bot' | 'barbarian') =>
        (
            world.sqlite
                .prepare(
                    kind === 'bot'
                        ? 'SELECT SUM(points) n FROM villages WHERE player_id > 1'
                        : 'SELECT SUM(points) n FROM villages WHERE player_id IS NULL',
                )
                .get() as { n: number }
        ).n;

    it('plant beim Erzeugen genau einen Tick je Bot', () => {
        const pending = world.sqlite
            .prepare(
                `SELECT COUNT(*) AS n FROM events WHERE type = 'bot_tick'`,
            )
            .get() as { n: number };
        expect(pending.n).toBe(10);
    });

    it('wächst über eine simulierte Spielwoche', () => {
        const before = pointsOf('bot');
        for (let hour = 0; hour < 24 * 7; hour++) {
            world.clock.skip(Duration.hours(1));
            world.scheduler.processDue();
        }
        expect(pointsOf('bot')).toBeGreaterThan(before);
    });

    it('baut deutlich klüger aus als Barbaren', () => {
        // Zehn Bots gegen zehn Barbaren, gleiche Startbedingungen. Der
        // eigentliche Nachweis, dass „klüger" nicht nur behauptet ist.
        const bots = pointsOf('bot');
        const barbarians = pointsOf('barbarian');
        // Gemessen bei diesem Seed: Faktor 2,8. Die Schwelle liegt bei 2,5,
        // damit der Test eine echte Aussage macht und nicht nur „irgendwas
        // mehr" prüft.
        expect(bots).toBeGreaterThan(barbarians * 2.5);
    });

    it('Persönlichkeiten unterscheiden sich auch in der echten Welt', () => {
        // Derselbe Nachweis wie in den puren Tests, aber am Ende einer
        // simulierten Spielwoche in einer laufenden Welt: turtle mauert,
        // expander baut das Hauptgebäude aus.
        const avg = (personality: string, building: string) =>
            (
                world.sqlite
                    .prepare(
                        `SELECT AVG(b.level) AS n FROM buildings b
                         JOIN villages v ON v.id = b.village_id
                         JOIN players p ON p.id = v.player_id
                         WHERE p.personality = ? AND b.type = ?`,
                    )
                    .get(personality, building) as { n: number | null }
            ).n ?? 0;

        expect(avg('turtle', 'wall')).toBeGreaterThan(
            avg('raider', 'wall'),
        );
        expect(avg('expander', 'headquarters')).toBeGreaterThan(
            avg('turtle', 'headquarters'),
        );
    });

    it('merkt sich Sparziele über den Tick hinaus', () => {
        const withState = world.sqlite
            .prepare(
                `SELECT COUNT(*) AS n FROM players
                 WHERE is_bot = 1 AND ai_state_json != '{}'`,
            )
            .get() as { n: number };
        expect(withState.n).toBeGreaterThan(0);
    });

    it('hält die Ketten am Leben', () => {
        const pending = world.sqlite
            .prepare(
                `SELECT COUNT(DISTINCT json_extract(payload_json, '$.playerId')) AS n
                 FROM events WHERE type = 'bot_tick'`,
            )
            .get() as { n: number };
        expect(pending.n).toBe(10);
    });

    it('verdoppelt die Ketten nicht beim erneuten Öffnen', () => {
        const count = () =>
            (
                world.sqlite
                    .prepare(
                        `SELECT COUNT(*) AS n FROM events WHERE type = 'bot_tick'`,
                    )
                    .get() as { n: number }
            ).n;
        const before = count();
        manager.getWorld(world.id);
        manager.getWorld(world.id);
        expect(count()).toBe(before);
    });

    it('bleibt innerhalb der Bevölkerungsgrenze', () => {
        const rows = world.sqlite
            .prepare('SELECT id FROM villages WHERE player_id > 1')
            .all() as { id: number }[];
        for (const row of rows) {
            const view = world.villageView(row.id);
            expect(view.popUsed).toBeLessThanOrEqual(view.popMax);
        }
    });
});
