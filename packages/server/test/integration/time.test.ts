import { Duration, GameTime } from '@medival/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../harness/act.js';
import {
    createTestApp,
    loginAs,
    type TestApp,
} from '../harness/app.js';
import { givenPlayer, givenVillage } from '../harness/given.js';
import {
    levelOf,
    pendingEvents,
    reportsOf,
    unitsAt,
} from '../harness/query.js';
import {
    advance,
    advanceTo,
    advanceYielding,
    createTestWorld,
    QUIET_SETTINGS,
    type TestWorld,
} from '../harness/world.js';

/**
 * Zeit-Engine: Konsistenz & Millisekunden (plans/19-prototyp/19-2).
 */

let tw: TestWorld | null = null;
let api: TestApp | null = null;
afterEach(async () => {
    tw?.dispose();
    tw = null;
    await api?.dispose();
    api = null;
});

describe('Nachholen vor jedem Zugriff', () => {
    it('ein Befehl sieht ein schon fälliges, noch unverarbeitetes Event', async () => {
        api = await createTestApp();
        // Der angemeldete Account gründet die Welt und steuert Dorf 1 (19-9).
        const { cookie, account } = await loginAs(api, 'Baumeisterin');
        const world = api.manager.createWorld(
            'Nachholen',
            QUIET_SETTINGS,
            {
                founder: {
                    name: 'Baumeisterin',
                    accountId: account.id,
                },
            },
        );
        world.pause();
        const v = givenVillage(world, 1, {
            x: 10,
            y: 10,
            resources: 'full',
        });
        act.build(world, v, 'headquarters');
        const due = world.scheduler.nextDue();
        if (due === null) throw new Error('kein Bauauftrag');

        // Der Timer hat (noch) nicht gefeuert: Uhr 5 ms nach Fälligkeit,
        // Event liegt unverarbeitet in der Tabelle.
        world.clock.setTo(due + 5);
        expect(levelOf(world, v, 'headquarters')).toBe(1);

        const res = await api.app.inject({
            url: `/api/worlds/${world.id}/villages/${v}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(
            (res.json() as { buildings: { headquarters: number } })
                .buildings.headquarters,
        ).toBe(2);
    });

    it('meldet bei großem Rückstand 503 statt synchron zu blockieren', async () => {
        api = await createTestApp();
        const { cookie } = await loginAs(api, 'Geduldige');
        const world = api.manager.createWorld(
            'Rückstand',
            QUIET_SETTINGS,
        );
        world.pause();
        // 1 500 fällige Events (unbekannter Typ, wird verworfen).
        const insert = world.sqlite.prepare(
            "INSERT INTO events (due_game_time, type, payload_json) VALUES (?, 'noop', '{}')",
        );
        world.sqlite.transaction(() => {
            for (let i = 0; i < 1_500; i++) insert.run(world.now());
        })();

        const first = await api.app.inject({
            url: `/api/worlds/${world.id}`,
            headers: { cookie },
        });
        expect(first.statusCode).toBe(503);
        expect(first.headers['retry-after']).toBe('1');
        // Die erste Anfrage hat 1 000 abgearbeitet, die zweite schafft den Rest.
        const second = await api.app.inject({
            url: `/api/worlds/${world.id}`,
            headers: { cookie },
        });
        expect(second.statusCode).toBe(200);
    });
});

describe('Gleichstand in derselben Millisekunde', () => {
    /*
     * B hat zwei Dörfer, A greift das eine an; B schickt aus dem anderen
     * Unterstützung. Beide Wege sind gleich lang und gleich schnell — die
     * Ankunft fällt auf dieselbe Millisekunde. Abgeschickt wird der Angriff
     * zuerst, die Einfügereihenfolge spräche also für den Angriff.
     */
    it('Unterstützung kämpft mit, auch wenn der Angriff zuerst abging', () => {
        tw = createTestWorld();
        const { world } = tw;
        const a = givenPlayer(world, { name: 'A' });
        const b = givenPlayer(world, { name: 'B' });
        const attacker = givenVillage(world, a, {
            x: 14,
            y: 10,
            units: { spear: 300 },
        });
        const target = givenVillage(world, b, { x: 10, y: 10 });
        const helper = givenVillage(world, b, {
            x: 10,
            y: 14,
            units: { spear: 300 },
        });

        const atk = act.attack(world, attacker, target, { spear: 300 });
        const sup = act.support(world, helper, target, { spear: 300 });
        expect(sup.arrivalGameTime).toBe(atk.arrivalGameTime);

        advanceTo(world, GameTime.of(atk.arrivalGameTime));
        const [report] = reportsOf(world, a);
        // 300 Speere greifen mit 3 000 an, 300 verteidigen mit 4 500.
        expect(report?.payload.attackerWon).toBe(false);
        expect(report?.payload.defender).toEqual({ spear: 300 });
    });
});

describe('Ganze Millisekunden', () => {
    it('nach einer Spielwoche hat kein Zeitstempel Nachkommastellen', async () => {
        tw = createTestWorld({
            botCount: 6,
            barbarianCount: 12,
            barbarianAttemptsPerHour: 0.5,
        });
        const { world } = tw;
        await advanceYielding(
            world,
            Duration.hours(168 / world.settings.speed),
        );
        const fractional = (sql: string) =>
            (world.sqlite.prepare(sql).get() as { n: number }).n;
        expect(
            fractional(
                'SELECT COUNT(*) AS n FROM events WHERE due_game_time != CAST(due_game_time AS INTEGER)',
            ),
        ).toBe(0);
        expect(
            fractional(
                'SELECT COUNT(*) AS n FROM movements WHERE arrival_game_time != CAST(arrival_game_time AS INTEGER)',
            ),
        ).toBe(0);
        expect(
            fractional(
                'SELECT COUNT(*) AS n FROM recruit_queue WHERE per_unit_ms != CAST(per_unit_ms AS INTEGER)',
            ),
        ).toBe(0);
    });
});

describe('Rückstand ändert nichts am Ergebnis', () => {
    /*
     * Zwei gleiche Welten (gleicher Seed). Die eine läuft Event für Event,
     * die andere „verschläft" sechs Spielstunden und holt dann alles auf
     * einmal nach — wie nach einem Serverneustart. Weil jeder Handler mit
     * der Fälligkeit seines Events rechnet statt mit der Uhr, muss am Ende
     * derselbe Zustand stehen.
     */
    it('gleicher Endzustand nach Nachholen wie bei pünktlicher Verarbeitung', () => {
        const settings = {
            botCount: 6,
            barbarianCount: 8,
            barbarianAttemptsPerHour: 0.2,
            seed: 777,
        };
        const punctual = createTestWorld(settings, 'Pünktlich');
        const late = createTestWorld(settings, 'Verspätet');
        try {
            const span = Duration.hours(
                6 / punctual.world.settings.speed,
            );
            advance(punctual.world, span);

            const target = GameTime.add(late.world.now(), span);
            late.world.clock.setTo(target);
            late.world.scheduler.drainUntil(target);

            const snapshot = (w: TestWorld['world']) =>
                JSON.stringify({
                    villages: w.sqlite
                        .prepare(
                            'SELECT id, player_id, wood, clay, iron, points, loyalty FROM villages ORDER BY id',
                        )
                        .all(),
                    buildings: w.sqlite
                        .prepare(
                            'SELECT * FROM buildings ORDER BY village_id, type',
                        )
                        .all(),
                    units: w.sqlite
                        .prepare(
                            'SELECT * FROM units ORDER BY village_id, unit_type',
                        )
                        .all(),
                    queue: w.sqlite
                        .prepare(
                            'SELECT * FROM build_queue ORDER BY id',
                        )
                        .all(),
                    events: w.sqlite
                        .prepare(
                            'SELECT due_game_time, type, payload_json FROM events ORDER BY due_game_time, priority, id',
                        )
                        .all(),
                });
            expect(snapshot(late.world)).toBe(snapshot(punctual.world));
        } finally {
            punctual.dispose();
            late.dispose();
        }
    });
});

describe('Rekrutierung: ein Event je Auftrag', () => {
    it('5 000 Speere sind ein Event, Zwischenstände werden ausgerechnet', () => {
        tw = createTestWorld();
        const { world } = tw;
        const v = givenVillage(world, givenPlayer(world), {
            x: 10,
            y: 10,
            levels: { barracks: 10, farm: 30, warehouse: 30 },
            resources: 'full',
        });
        world.sqlite
            .prepare(
                'UPDATE villages SET wood = 1e7, clay = 1e7, iron = 1e7 WHERE id = ?',
            )
            .run(v);
        // 5 000 Speere: 250 000 Holz — passt gerade in Speicher 30.
        act.recruit(world, v, 'spear', 5_000);
        expect(pendingEvents(world, 'recruit_done')).toHaveLength(1);
        expect(pendingEvents(world, 'recruit_tick')).toHaveLength(0);

        const [order] = world.sqlite
            .prepare('SELECT per_unit_ms AS per FROM recruit_queue')
            .all() as { per: number }[];
        if (!order) throw new Error('kein Auftrag');
        advance(world, Duration.ms(order.per * 2_500));
        expect(unitsAt(world, v).spear).toBe(2_500);

        advance(world, Duration.ms(order.per * 2_500));
        expect(unitsAt(world, v).spear).toBe(5_000);
        expect(world.villageView(v).recruitQueue).toHaveLength(0);
    });

    it('ein Angriff trifft genau die bis dahin fertigen Verteidiger', () => {
        tw = createTestWorld();
        const { world } = tw;
        const a = givenPlayer(world, { name: 'A' });
        const b = givenPlayer(world, { name: 'B' });
        const home = givenVillage(world, a, {
            x: 14,
            y: 10,
            units: { axe: 50 },
        });
        const target = givenVillage(world, b, {
            x: 10,
            y: 10,
            levels: { barracks: 5, farm: 20, warehouse: 20 },
            resources: 'full',
        });
        act.recruit(world, target, 'spear', 1_000);
        const { arrivalGameTime } = act.attack(world, home, target, {
            axe: 50,
        });
        const [order] = world.sqlite
            .prepare(
                'SELECT per_unit_ms AS per, started_at AS start FROM recruit_queue',
            )
            .all() as { per: number; start: number }[];
        if (!order) throw new Error('kein Auftrag');
        const readyAtArrival = Math.floor(
            (arrivalGameTime - order.start) / order.per,
        );
        expect(readyAtArrival).toBeGreaterThan(0);
        expect(readyAtArrival).toBeLessThan(1_000);

        advanceTo(world, GameTime.of(arrivalGameTime));
        const [report] = reportsOf(world, a);
        expect(report?.payload.defender).toEqual({
            spear: readyAtArrival,
        });
    });
});
