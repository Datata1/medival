import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sameTribe } from '../../src/engine/tribes.js';
import type { World } from '../../src/engine/world.js';
import {
    advanceYielding,
    createTestWorld,
    gameWeeks,
    type TestWorld,
} from '../harness/world.js';

/**
 * Krieg und Bündnisse — zwei Spielwochen.
 *
 * Umgezogen aus `test/tribes.test.ts` (plans/19-prototyp/19-4). Vorher lief die
 * Welt über `clock.skip(1h)` + `processDue()`: höchstens 200 Events je
 * Stunde, alle mit der Uhrzeit am Ende der Stunde. Jetzt läuft sie Event für
 * Event über den Harness, und die Zeiträume sind echte Spielwochen
 * (`gameWeeks`). Die Schwellen sind neu eingemessen, Messwerte stehen an den
 * Prüfungen.
 */

describe('Krieg und Bündnisse über zwei Spielwochen', () => {
    let tw: TestWorld;
    let world: World;

    /*
     * `beforeAll`, nicht `beforeEach`: Alle Tests unten lesen nur. Vorher lief
     * dieselbe Woche siebenmal — auf dem CI-Runner 87 s fast ununterbrochen
     * synchron, sodass der Vitest-Worker seine Statusmeldungen nicht
     * zustellen konnte („Timeout calling onTaskUpdate").
     */
    beforeAll(async () => {
        tw = createTestWorld(
            {
                speed: 200,
                unitSpeed: 200,
                mapSize: 30,
                botCount: 8,
                barbarianCount: 4,
                /*
                 * Der Seed ist gewählt, nicht beliebig: Eine Stammesgründung
                 * verlangt gegenseitige Zuneigung *und* einen Wurf gegen
                 * `FOUNDING_CHANCE`, und das gelingt in einer Woche mit acht Bots
                 * nur bei etwa jedem vierten Seed (nachgemessen über acht Seeds,
                 * vorher wie nachher). Er stand auf 31415, bis Plan 18-3 die
                 * Bauplätze ans Gelände band und damit alle Entfernungen
                 * verschob — an der Häufigkeit hat sich dabei nichts geändert,
                 * nur daran, welche Seeds sie zeigen.
                 */
                seed: 99,
                barbarianAttemptsPerHour: 0,
            },
            'Kriegswoche',
        );
        ({ world } = tw);
        // Gemessen nach zwei Spielwochen (19-4): 20 Angriffstruppen,
        // 13 Angriffe bzw. Rückmärsche unterwegs, 3 Stämme.
        await advanceYielding(world, gameWeeks(world, 2));
    }, 90_000);

    afterAll(() => {
        tw.dispose();
    });

    it('Bots stellen gemischte Heere auf', () => {
        // Der Befund aus dem ersten Lauf: Eine Prioritätenliste ließ jeden Bot
        // ausschließlich Speerträger ausheben — reine Verteidigungsheere, die
        // nie angreifen konnten. Jetzt entscheidet eine Zielzusammensetzung.
        const offensive = (
            world.sqlite
                .prepare(
                    `SELECT COALESCE(SUM(u.count_home), 0) AS n FROM units u
                     JOIN villages v ON v.id = u.village_id
                     WHERE v.player_id > 1
                       AND u.unit_type IN ('axe', 'light_cavalry')`,
                )
                .get() as { n: number }
        ).n;
        expect(offensive).toBeGreaterThan(0);
    });

    it('es fließen Angriffe', () => {
        // Ohne Barbarendörfer als folgenlose Ziele gäbe es in einer
        // friedlichen Welt gar keinen Krieg (Befund aus Plan 17).
        const attacks = (
            world.sqlite
                .prepare(
                    `SELECT COUNT(*) AS n FROM movements WHERE kind = 'attack'`,
                )
                .get() as { n: number }
        ).n;
        const returning = (
            world.sqlite
                .prepare(
                    `SELECT COUNT(*) AS n FROM movements WHERE kind = 'return'`,
                )
                .get() as { n: number }
        ).n;
        expect(attacks + returning).toBeGreaterThan(0);
    });

    it('turtle greift niemals an', () => {
        // Die Zielzusammensetzung eines `turtle` enthält bewusst keine
        // Offensive — er kann gar nicht angreifen.
        const n = (
            world.sqlite
                .prepare(
                    `SELECT COUNT(*) AS n FROM movements m
                     JOIN villages v ON v.id = m.origin_village_id
                     JOIN players p ON p.id = v.player_id
                     WHERE m.kind = 'attack' AND p.personality = 'turtle'`,
                )
                .get() as { n: number }
        ).n;
        expect(n).toBe(0);
    });

    it('es entstehen Stämme', () => {
        const count = (
            world.sqlite
                .prepare('SELECT COUNT(*) AS n FROM tribes')
                .get() as { n: number }
        ).n;
        expect(count).toBeGreaterThan(0);
    });

    it('kein Bot greift den eigenen Stamm an', () => {
        const rows = world.sqlite
            .prepare(
                `SELECT o.player_id AS attacker, t.player_id AS defender
                 FROM movements m
                 JOIN villages o ON o.id = m.origin_village_id
                 JOIN villages t ON t.id = m.target_village_id
                 WHERE m.kind = 'attack'`,
            )
            .all() as {
            attacker: number | null;
            defender: number | null;
        }[];
        for (const row of rows) {
            expect(sameTribe(world, row.attacker, row.defender)).toBe(
                false,
            );
        }
    });

    it('Barbaren greifen weiterhin nie an', () => {
        const n = (
            world.sqlite
                .prepare(
                    `SELECT COUNT(*) AS n FROM movements m
                     JOIN villages v ON v.id = m.origin_village_id
                     WHERE v.player_id IS NULL`,
                )
                .get() as { n: number }
        ).n;
        expect(n).toBe(0);
    });

    it('die Welt bleibt widerspruchsfrei', () => {
        // Kein Dorf mit negativen Rohstoffen, keine Truppen im Minus.
        const bad = (
            world.sqlite
                .prepare(
                    `SELECT COUNT(*) AS n FROM villages
                     WHERE wood < 0 OR clay < 0 OR iron < 0`,
                )
                .get() as { n: number }
        ).n;
        expect(bad).toBe(0);
        const negativeUnits = (
            world.sqlite
                .prepare(
                    'SELECT COUNT(*) AS n FROM units WHERE count_home < 0',
                )
                .get() as { n: number }
        ).n;
        expect(negativeUnits).toBe(0);
    });
});
