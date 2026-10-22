import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../../src/engine/world.js';
import type { WorldManager } from '../../src/engine/worldManager.js';
import {
    advance,
    createTestWorld,
    gameWeeks,
    type TestWorld,
} from '../harness/world.js';

/**
 * Barbarendörfer in einer laufenden Welt — eine Spielwoche.
 *
 * Umgezogen aus `test/barbarian.test.ts` (plans/19-prototyp/19-4). Vorher lief die
 * Welt über `clock.skip(1h)` + `processDue()`: höchstens 200 Events je
 * Stunde, alle mit der Uhrzeit am Ende der Stunde. Jetzt läuft sie Event für
 * Event über den Harness, und die Zeiträume sind echte Spielwochen
 * (`gameWeeks`). Die Schwellen sind neu eingemessen, Messwerte stehen an den
 * Prüfungen.
 */

describe('Barbarendörfer in einer laufenden Welt', () => {
    let tw: TestWorld;
    let manager: WorldManager;
    let world: World;

    beforeAll(() => {
        tw = createTestWorld(
            {
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
            },
            'Barbarenwelt',
        );
        ({ world, manager } = tw);
    });

    afterAll(() => {
        tw.dispose();
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

        advance(world, gameWeeks(world, 1));

        const after = barbarians();
        const end = after.reduce((s, v) => s + v.points, 0);
        expect(end).toBeGreaterThan(start);
        // Nicht nur eines wächst, sondern die Mehrheit.
        const grown = after.filter(
            (v, i) => v.points > (before[i]?.points ?? 0),
        );
        expect(grown.length).toBeGreaterThan(after.length / 2);
    }, 60_000);

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
