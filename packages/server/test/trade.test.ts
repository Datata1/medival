import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    attitudeOf,
    Duration,
    marketCapacity,
    RELATION_RANGE,
} from '@medival/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decideShipment, surplusOf } from '../src/ai/decide/trade.js';
import { sendUnits } from '../src/engine/military.js';
import {
    freeMerchantCapacity,
    sendResources,
} from '../src/engine/trade.js';
import type { World } from '../src/engine/world.js';
import { WorldManager } from '../src/engine/worldManager.js';

let dir: string;
let manager: WorldManager;
let world: World;

/** Ein Dorf mit Marktplatz und vollem Lager, an bekannter Stelle. */
function setUp(distanceFields: number) {
    const home = world.getVillageRow(1);
    // Zweites Dorf einem anderen Spieler zuordnen und passend platzieren.
    world.sqlite
        .prepare('UPDATE villages SET x = ?, y = ? WHERE id = ?')
        .run(home.x + distanceFields, home.y, 2);
    world.sqlite
        .prepare('UPDATE villages SET player_id = 2 WHERE id = 2')
        .run();
    for (const id of [1, 2]) {
        world.sqlite
            .prepare(
                `UPDATE buildings SET level = 10 WHERE village_id = ? AND type = 'warehouse'`,
            )
            .run(id);
        world.sqlite
            .prepare(
                `UPDATE buildings SET level = 5 WHERE village_id = ? AND type = 'market'`,
            )
            .run(id);
        world.sqlite
            .prepare(
                'UPDATE villages SET wood = 4000, clay = 4000, iron = 4000, resources_updated_at = ? WHERE id = ?',
            )
            .run(world.now(), id);
    }
}

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-trade-'));
    manager = new WorldManager(dir);
    world = manager.createWorld('Handelswelt', {
        speed: 100,
        unitSpeed: 100,
        mapSize: 60,
        botCount: 2,
        barbarianCount: 2,
        seed: 909,
        barbarianAttemptsPerHour: 0,
    });
});

afterEach(() => {
    manager.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('Rohstofflieferungen', () => {
    it('kommt NICHT sofort an', () => {
        // Die Falle aus der Planung: `travelTime` liefert Duration.zero, wenn
        // keine Einheiten mitreisen. Eine Lieferung ohne eigene
        // Laufzeitfunktion wäre quer über die Karte sofort da.
        setUp(20);
        const { arrivalGameTime } = sendResources(world, 1, 2, {
            wood: 1000,
            clay: 0,
            iron: 0,
        });
        expect(arrivalGameTime).toBeGreaterThan(world.now());
    });

    it('bucht beim Absender ab und beim Empfänger auf', () => {
        setUp(5);
        const before = world.villageView(2).resources.wood;
        const senderBefore = world.villageView(1).resources.wood;

        const { arrivalGameTime } = sendResources(world, 1, 2, {
            wood: 1000,
            clay: 0,
            iron: 0,
        });
        expect(world.villageView(1).resources.wood).toBeLessThan(
            senderBefore,
        );

        world.clock.skip(
            Duration.ms(arrivalGameTime - world.now() + 1000),
        );
        world.scheduler.processDue();
        expect(world.villageView(2).resources.wood).toBeGreaterThan(
            before,
        );
    });

    it('hebt das Ansehen des Empfängers gegenüber dem Absender', () => {
        setUp(3);
        expect(world.settleStanding(2, 1)).toBe(0);

        const { arrivalGameTime } = sendResources(world, 1, 2, {
            wood: 1500,
            clay: 1500,
            iron: 0,
        });
        world.clock.skip(
            Duration.ms(arrivalGameTime - world.now() + 1000),
        );
        world.scheduler.processDue();

        expect(world.settleStanding(2, 1)).toBeGreaterThan(0);
        // Asymmetrisch: Der Absender denkt deswegen nicht besser über sich.
        expect(world.settleStanding(1, 2)).toBe(0);
    });

    it('wirkt in der Ferne deutlich schwächer', () => {
        // Derselbe Betrag, einmal nah und einmal fern.
        setUp(2);
        let arrival = sendResources(world, 1, 2, {
            wood: 2000,
            clay: 0,
            iron: 0,
        }).arrivalGameTime;
        world.clock.skip(Duration.ms(arrival - world.now() + 1000));
        world.scheduler.processDue();
        const near = world.settleStanding(2, 1);

        // Zurücksetzen und weit weg verschieben.
        world.sqlite.prepare('DELETE FROM relations').run();
        setUp(RELATION_RANGE * 8);
        arrival = sendResources(world, 1, 2, {
            wood: 2000,
            clay: 0,
            iron: 0,
        }).arrivalGameTime;
        world.clock.skip(Duration.ms(arrival - world.now() + 1000));
        world.scheduler.processDue();
        const far = world.settleStanding(2, 1);

        expect(far).toBeLessThan(near / 4);
    });

    it('deckelt auf den Speicher des Empfängers', () => {
        setUp(2);
        // Empfängerlager fast voll.
        const cap = world.villageView(2).capacity;
        world.sqlite
            .prepare(
                'UPDATE villages SET wood = ?, resources_updated_at = ? WHERE id = 2',
            )
            .run(cap - 10, world.now());

        const { arrivalGameTime } = sendResources(world, 1, 2, {
            wood: 3000,
            clay: 0,
            iron: 0,
        });
        world.clock.skip(
            Duration.ms(arrivalGameTime - world.now() + 1000),
        );
        world.scheduler.processDue();
        expect(world.villageView(2).resources.wood).toBeLessThanOrEqual(
            cap,
        );
    });

    it('bindet Händler und gibt sie nach der Rückkehr frei', () => {
        setUp(4);
        const capacity = marketCapacity(5);
        expect(freeMerchantCapacity(world, 1)).toBe(capacity);

        const { arrivalGameTime } = sendResources(world, 1, 2, {
            wood: 2000,
            clay: 0,
            iron: 0,
        });
        expect(freeMerchantCapacity(world, 1)).toBe(capacity - 2000);

        // Hinweg abwarten …
        world.clock.skip(
            Duration.ms(arrivalGameTime - world.now() + 1000),
        );
        world.scheduler.processDue();
        // … und die Rückreise der Händler.
        world.clock.skip(Duration.hours(6));
        world.scheduler.processDue();
        expect(freeMerchantCapacity(world, 1)).toBe(capacity);
    });

    it('lehnt mehr ab, als die Händler tragen können', () => {
        setUp(3);
        expect(() =>
            sendResources(world, 1, 2, {
                wood: marketCapacity(5) + 1,
                clay: 0,
                iron: 0,
            }),
        ).toThrow('not_enough_merchants');
    });

    it('lehnt ohne Marktplatz ab', () => {
        setUp(3);
        world.sqlite
            .prepare(
                `UPDATE buildings SET level = 0 WHERE village_id = 1 AND type = 'market'`,
            )
            .run();
        expect(() =>
            sendResources(world, 1, 2, { wood: 100, clay: 0, iron: 0 }),
        ).toThrow('market_missing');
    });

    it('lehnt Lieferungen an Barbarendörfer ab', () => {
        setUp(3);
        const barbarian = world.sqlite
            .prepare(
                'SELECT id FROM villages WHERE player_id IS NULL LIMIT 1',
            )
            .get() as { id: number };
        expect(() =>
            sendResources(world, 1, barbarian.id, {
                wood: 100,
                clay: 0,
                iron: 0,
            }),
        ).toThrow('target_is_barbarian');
    });

    it('lehnt leere Lieferungen ab', () => {
        setUp(3);
        expect(() =>
            sendResources(world, 1, 2, { wood: 0, clay: 0, iron: 0 }),
        ).toThrow('no_resources_selected');
    });
});

describe('Ansehen durch Kampf', () => {
    it('ein Angriff senkt das Ansehen des Verteidigers', () => {
        setUp(3);
        world.addUnits(1, { axe: 300 });
        world.addUnits(2, { spear: 40 });
        expect(world.settleStanding(2, 1)).toBe(0);

        const { arrivalGameTime } = sendUnits(world, 1, 2, 'attack', {
            axe: 300,
        });
        world.clock.skip(
            Duration.ms(arrivalGameTime - world.now() + 1000),
        );
        world.scheduler.processDue();

        // Der Verteidiger denkt schlechter über den Angreifer.
        expect(world.settleStanding(2, 1)).toBeLessThan(0);
        // Asymmetrisch: Der Angreifer selbst ist unbeeindruckt.
        expect(world.settleStanding(1, 2)).toBe(0);
    });

    it('ein Angriff schadet mehr, als eine Lieferung nützt', () => {
        setUp(3);
        // Erst liefern …
        let arrival = sendResources(world, 1, 2, {
            wood: 2000,
            clay: 2000,
            iron: 0,
        }).arrivalGameTime;
        world.clock.skip(Duration.ms(arrival - world.now() + 1000));
        world.scheduler.processDue();
        const afterGift = world.settleStanding(2, 1);
        expect(afterGift).toBeGreaterThan(0);

        // … dann überfallen.
        world.addUnits(1, { axe: 300 });
        world.addUnits(2, { spear: 40 });
        arrival = sendUnits(world, 1, 2, 'attack', {
            axe: 300,
        }).arrivalGameTime;
        world.clock.skip(Duration.ms(arrival - world.now() + 1000));
        world.scheduler.processDue();

        expect(world.settleStanding(2, 1)).toBeLessThan(0);
    });
});

describe('Bot-Handelsentscheidung (pure)', () => {
    it('liefert nichts unterhalb der Überschussschwelle', () => {
        expect(
            surplusOf({ wood: 100, clay: 100, iron: 100 }, 1000, 5000),
        ).toEqual({ wood: 0, clay: 0, iron: 0 });
    });

    it('liefert nichts ohne freie Händler', () => {
        expect(
            surplusOf({ wood: 900, clay: 900, iron: 900 }, 1000, 0),
        ).toEqual({ wood: 0, clay: 0, iron: 0 });
    });

    it('gibt nur den Überschuss ab', () => {
        const surplus = surplusOf(
            { wood: 1000, clay: 1000, iron: 1000 },
            1000,
            5000,
        );
        const total = surplus.wood + surplus.clay + surplus.iron;
        expect(total).toBeGreaterThan(0);
        // Höchstens ein Viertel des Lagers geht auf die Reise.
        expect(total).toBeLessThanOrEqual(250);
    });

    it('liefert nur an Freundliche', () => {
        const resources = { wood: 1000, clay: 1000, iron: 1000 };
        expect(
            decideShipment(resources, 1000, 5000, [
                { playerId: 2, villageId: 5, standing: 0, distance: 3 },
                {
                    playerId: 3,
                    villageId: 6,
                    standing: -50,
                    distance: 2,
                },
            ]),
        ).toBeNull();

        const friendly = decideShipment(resources, 1000, 5000, [
            { playerId: 2, villageId: 5, standing: 40, distance: 3 },
        ]);
        expect(friendly?.partner.playerId).toBe(2);
    });

    it('bevorzugt den näheren Freund', () => {
        const choice = decideShipment(
            { wood: 1000, clay: 1000, iron: 1000 },
            1000,
            5000,
            [
                {
                    playerId: 2,
                    villageId: 5,
                    standing: 45,
                    distance: 60,
                },
                {
                    playerId: 3,
                    villageId: 6,
                    standing: 40,
                    distance: 2,
                },
            ],
        );
        // Trotz etwas niedrigerem Ansehen: In der Ferne verpufft die Wirkung.
        expect(choice?.partner.playerId).toBe(3);
    });

    it('verschickt nie mehr, als vorhanden ist', () => {
        const choice = decideShipment(
            { wood: 1000, clay: 800, iron: 760 },
            1000,
            5000,
            [
                {
                    playerId: 2,
                    villageId: 5,
                    standing: 70,
                    distance: 2,
                    needs: { wood: 99_999, clay: 0, iron: 0 },
                },
            ],
        );
        expect(choice?.resources.wood).toBeLessThanOrEqual(1000);
        expect(choice?.resources.clay).toBeLessThanOrEqual(800);
        expect(choice?.resources.iron).toBeLessThanOrEqual(760);
    });
});

describe('Haltung im Spielerprofil', () => {
    it('spiegelt das Ansehen wider', () => {
        setUp(2);
        world.adjustStanding(
            2,
            1,
            { kind: 'shipment', value: 8000 },
            2,
        );
        const standing = world.settleStanding(2, 1);
        expect(attitudeOf(standing)).not.toBe('hostile');
    });
});
