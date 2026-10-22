import {
    buildTime,
    Duration,
    GameTime,
    warehouseCapacity,
} from '@medival/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { scheduleBotTick } from '../../src/ai/bot.js';
import { act } from '../harness/act.js';
import {
    createTestApp,
    loginAs,
    type TestApp,
} from '../harness/app.js';
import {
    givenLevels,
    givenPlayer,
    givenVillage,
} from '../harness/given.js';
import {
    levelOf,
    observeEvents,
    reportsOf,
    unitsAt,
} from '../harness/query.js';
import {
    advance,
    advanceTo,
    advanceUntil,
    advanceYielding,
    createTestWorld,
    type TestWorld,
} from '../harness/world.js';

/**
 * Szenarien, die den Harness selbst beweisen (plans/19-prototyp/19-1).
 *
 * Jede Zeitangabe hier ist auf die Millisekunde geprüft. Das ist der Sinn
 * der Übung: Eine Testwelt, die nur „ungefähr" wie der Server abläuft, hat
 * den größten Fehler des Projekts — Bots, die nach jeder vollen
 * Bauschleife zehn Minuten schlafen — eine ganze Plan-Generation lang
 * übersehen.
 */

let tw: TestWorld | null = null;
afterEach(() => {
    tw?.dispose();
    tw = null;
});

function buildQueue(world: TestWorld['world'], villageId: number) {
    return world.sqlite
        .prepare(
            'SELECT id, building_type AS type, target_level AS level, completes_at AS completesAt FROM build_queue WHERE village_id = ? ORDER BY completes_at',
        )
        .all(villageId) as {
        id: number;
        type: string;
        level: number;
        completesAt: number;
    }[];
}

describe('Zeit läuft Event für Event', () => {
    it('in jedem Handler gilt now() === Fälligkeit', () => {
        tw = createTestWorld({
            botCount: 6,
            barbarianCount: 10,
            barbarianAttemptsPerHour: 0.5,
        });
        const seen: { due: number; now: number }[] = [];
        observeEvents(tw.world, (ev) =>
            seen.push({ due: ev.dueGameTime, now: ev.now }),
        );
        advance(tw.world, Duration.minutes(30));

        expect(seen.length).toBeGreaterThan(200);
        for (const { due, now } of seen) {
            expect(now).toBe(Math.floor(due));
        }
        // Und kein fälliges Event bleibt liegen.
        const overdue = tw.world.sqlite
            .prepare(
                'SELECT COUNT(*) AS n FROM events WHERE due_game_time <= ?',
            )
            .get(tw.world.now()) as { n: number };
        expect(overdue.n).toBe(0);
    });

    it('advanceUntil hält an, sobald die Bedingung gilt', () => {
        tw = createTestWorld();
        const a = givenPlayer(tw.world);
        const v = givenVillage(tw.world, a, {
            x: 10,
            y: 10,
            resources: 'full',
        });
        act.build(tw.world, v, 'headquarters');
        const [item] = buildQueue(tw.world, v);
        if (!item) throw new Error('kein Bauauftrag');

        const reached = advanceUntil(
            tw.world,
            () => levelOf(tw!.world, v, 'headquarters') === 2,
            Duration.hours(1),
        );
        expect(reached).toBe(true);
        expect(tw.world.now()).toBe(item.completesAt);
    });
});

describe('Bauschleife', () => {
    it('ein Bau wird genau zu completesAt fertig', () => {
        tw = createTestWorld();
        const { world } = tw;
        const v = givenVillage(world, givenPlayer(world), {
            x: 10,
            y: 10,
            resources: 'full',
        });
        act.build(world, v, 'headquarters');
        const [item] = buildQueue(world, v);
        if (!item) throw new Error('kein Bauauftrag');

        advanceTo(world, GameTime.of(item.completesAt - 1));
        expect(levelOf(world, v, 'headquarters')).toBe(1);
        advanceTo(world, GameTime.of(item.completesAt));
        expect(levelOf(world, v, 'headquarters')).toBe(2);
    });

    it('der zweite Auftrag beginnt, wenn der erste endet', () => {
        tw = createTestWorld();
        const { world } = tw;
        const v = givenVillage(world, givenPlayer(world), {
            x: 10,
            y: 10,
            levels: { warehouse: 5 },
            resources: 'full',
        });
        act.build(world, v, 'timber_camp');
        act.build(world, v, 'clay_pit');
        const [first, second] = buildQueue(world, v);
        if (!first || !second) throw new Error('Aufträge fehlen');

        const expected = GameTime.add(
            GameTime.of(first.completesAt),
            buildTime('clay_pit', 2, 1, world.settings.speed),
        );
        expect(second.completesAt).toBe(expected);
        advanceTo(world, GameTime.of(second.completesAt));
        expect(levelOf(world, v, 'timber_camp')).toBe(2);
        expect(levelOf(world, v, 'clay_pit')).toBe(2);
    });
});

describe('Angriff auf ein Barbarendorf', () => {
    it('Bericht zur Ankunft, Beute zur Rückkehr — auf die Millisekunde', () => {
        tw = createTestWorld();
        const { world } = tw;
        const a = givenPlayer(world, { name: 'A' });
        const home = givenVillage(world, a, {
            x: 10,
            y: 10,
            levels: { warehouse: 10 },
            units: { axe: 300 },
            resources: { wood: 0, clay: 0, iron: 0 },
        });
        const barb = givenVillage(world, null, {
            x: 13,
            y: 10,
            units: { spear: 5 },
            resources: { wood: 400, clay: 400, iron: 400 },
        });

        const departure = world.now();
        const { arrivalGameTime } = act.attack(world, home, barb, {
            axe: 300,
        });

        advanceTo(world, GameTime.of(arrivalGameTime - 1));
        expect(reportsOf(world, a)).toHaveLength(0);
        advanceTo(world, GameTime.of(arrivalGameTime));
        const reports = reportsOf(world, a);
        expect(reports).toHaveLength(1);
        expect(reports[0]?.type).toBe('attack');
        expect(reports[0]?.createdGameTime).toBe(arrivalGameTime);
        expect(unitsAt(world, barb).spear ?? 0).toBe(0);

        // Rückweg dauert so lange wie der Hinweg.
        const returnAt =
            arrivalGameTime + (arrivalGameTime - departure);
        const ret = world.sqlite
            .prepare(
                "SELECT arrival_game_time AS t FROM movements WHERE kind = 'return'",
            )
            .get() as { t: number };
        expect(ret.t).toBe(returnAt);

        advanceTo(world, GameTime.of(returnAt - 1));
        expect(unitsAt(world, home).axe ?? 0).toBe(0);
        advanceTo(world, GameTime.of(returnAt));
        expect(unitsAt(world, home).axe ?? 0).toBeGreaterThan(290);
        const res = world.settleResources(home);
        // Die Beute ist im Lager: mehr als die Produktion der Reisezeit.
        expect(res.wood).toBeGreaterThan(300);
        expect(res.wood).toBeLessThanOrEqual(warehouseCapacity(10));
    });
});

describe('Regression: Bot schläft nach voller Bauschleife', () => {
    /*
     * Gefunden bei der Analyse von plans/19-prototyp (Welt 19, Speed 200):
     * Ist die Bauschleife voll, liefert `decideBuild` nichts, und `planBot`
     * fällt auf MAX_THINK_INTERVAL (10 min Echtzeit) zurück — die Bauten
     * sind aber nach Sekunden fertig.
     *
     * Bis 19-4 als `it.fails` festgehalten; behoben durch `queueFreeAt` im
     * Snapshot und das Aufwecken bei `build_complete`.
     */
    it('wird wieder aktiv, sobald die Schleife Platz hat', () => {
        tw = createTestWorld();
        const { world } = tw;
        const bot = givenPlayer(world, { bot: true });
        const v = givenVillage(world, bot, {
            x: 10,
            y: 10,
            resources: 'full',
        });
        givenLevels(world, v, { warehouse: 10, farm: 10 });
        world.sqlite
            .prepare(
                'UPDATE villages SET wood = 9000, clay = 9000, iron = 9000 WHERE id = ?',
            )
            .run(v);
        scheduleBotTick(world, bot, Duration.zero);

        const filled = advanceUntil(
            world,
            () => buildQueue(world, v).length >= 2,
            Duration.minutes(1),
        );
        expect(filled).toBe(true);
        const queue = buildQueue(world, v);
        const lastId = Math.max(...queue.map((q) => q.id));
        const freeAt = Math.min(...queue.map((q) => q.completesAt));

        // Sobald ein Platz frei ist, reiht der Bot binnen weniger Sekunden
        // nach. Vor 19-4 schlief er stattdessen 600 s.
        advanceTo(world, GameTime.of(freeAt + 5_000));
        const newer = buildQueue(world, v).filter((q) => q.id > lastId);
        expect(newer.length).toBeGreaterThan(0);
    });
});

describe('Regression: Bots verschicken Kleinstlieferungen im Sekundentakt', () => {
    /*
     * Gefunden beim Bau dieses Harness (19-1): Ab Spielstunde ~4 (Seed 555,
     * zehn Bots) schickte ein Bot alle 2 s eine Lieferung von ~20 Rohstoffen
     * an denselben Partner — `decideShipment` kannte keine Mindestmenge, und
     * jede ausgeführte Absicht legte den nächsten Tick auf 2 s. Gemessen:
     * ~25 000 Events in Stunde 6. Behoben in 19-4; gemessen danach: 878
     * Ankünfte in Stunde 4 (vorher 2 485), 1 745 in Stunde 6.
     */
    it('liefert nur lohnende Mengen und je Partner eins nach dem anderen', async () => {
        tw = createTestWorld({
            botCount: 10,
            barbarianCount: 10,
            barbarianAttemptsPerHour: 0.04,
            seed: 555,
        });
        const { world } = tw;
        await advanceYielding(world, Duration.hours(3));

        let arrivals = 0;
        const violations: string[] = [];
        observeEvents(world, (ev) => {
            if (ev.type === 'arrival') arrivals++;
            if (ev.type !== 'bot_tick') return;
            // Unmittelbar vor jedem Bot-Tick: Was ist an Lieferungen unterwegs?
            const trades = world.sqlite
                .prepare(
                    `SELECT m.origin_village_id AS o, t.player_id AS p,
                            m.carries_json AS c
                     FROM movements m JOIN villages t ON t.id = m.target_village_id
                     WHERE m.kind = 'trade'`,
                )
                .all() as { o: number; p: number; c: string }[];
            const pairs = new Set<string>();
            for (const t of trades) {
                const c = JSON.parse(t.c) as Record<string, number>;
                const total =
                    (c.wood ?? 0) + (c.clay ?? 0) + (c.iron ?? 0);
                if (total < 200) violations.push(`klein: ${total}`);
                const key = `${t.o}->${t.p}`;
                if (pairs.has(key)) violations.push(`doppelt: ${key}`);
                pairs.add(key);
            }
        });
        await advanceYielding(world, Duration.hours(1), 6);

        expect(violations).toEqual([]);
        // Großzügige Obergrenze: 1,5 Ankünfte je Bot und Spielstunde (Speed
        // 100 → 100 Spielstunden je Stunde Echtzeit).
        expect(arrivals).toBeLessThan(10 * 100 * 1.5);
    });
});

describe('HTTP-App ohne Port', () => {
    let api: TestApp | null = null;
    afterEach(async () => {
        await api?.dispose();
        api = null;
    });

    it('legt eine Welt an und liefert sie aus', async () => {
        api = await createTestApp();
        const { cookie } = await loginAs(api, 'Verwalter');
        const health = await api.app.inject({ url: '/api/health' });
        expect(health.statusCode).toBe(200);

        const created = await api.app.inject({
            method: 'POST',
            url: '/api/worlds',
            headers: { cookie },
            payload: {
                name: 'API-Welt',
                settings: {
                    mapSize: 30,
                    botCount: 2,
                    barbarianCount: 3,
                    seed: 7,
                },
            },
        });
        expect(created.statusCode).toBe(200);
        const { id } = created.json() as { id: number };

        const fetched = await api.app.inject({
            url: `/api/worlds/${id}`,
            headers: { cookie },
        });
        expect(fetched.statusCode).toBe(200);
        expect(fetched.json()).toMatchObject({ id, name: 'API-Welt' });
    });

    it('meldet ungültige Einstellungen als 400, nicht als 500', async () => {
        api = await createTestApp();
        const { cookie } = await loginAs(api, 'Verwalter');
        const res = await api.app.inject({
            method: 'POST',
            url: '/api/worlds',
            headers: { cookie },
            payload: { settings: { speed: 'schnell' } },
        });
        expect(res.statusCode).toBe(400);
    });
});
