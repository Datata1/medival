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
 * Bots in einer laufenden Welt — zwei Spielwochen.
 *
 * Umgezogen aus `test/bot.test.ts` (plans/19-prototyp/19-4). Vorher lief die
 * Welt über `clock.skip(1h)` + `processDue()`: höchstens 200 Events je
 * Stunde, alle mit der Uhrzeit am Ende der Stunde. Jetzt läuft sie Event für
 * Event über den Harness, und die Zeiträume sind echte Spielwochen
 * (`gameWeeks`). Die Schwellen sind neu eingemessen, Messwerte stehen an den
 * Prüfungen.
 */

describe('Bots in einer laufenden Welt', () => {
    let tw: TestWorld;
    let manager: WorldManager;
    let world: World;

    beforeAll(() => {
        tw = createTestWorld(
            {
                speed: 100,
                unitSpeed: 100,
                mapSize: 40,
                botCount: 10,
                barbarianCount: 10,
                seed: 555,
                barbarianAttemptsPerHour: 0.04,
            },
            'Botwelt',
        );
        ({ world, manager } = tw);
    });

    afterAll(() => {
        tw.dispose();
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

    it('wächst über zwei Spielwochen', () => {
        const before = pointsOf('bot');
        advance(world, gameWeeks(world, 2));
        expect(pointsOf('bot')).toBeGreaterThan(before);
    }, 60_000);

    it('baut deutlich klüger aus als Barbaren', () => {
        // Zehn Bots gegen zehn Barbaren, gleiche Startbedingungen. Der
        // eigentliche Nachweis, dass „klüger" nicht nur behauptet ist.
        const bots = pointsOf('bot');
        const barbarians = pointsOf('barbarian');
        /*
         * Gemessen nach zwei Spielwochen (19-4): 8 840 zu 1 187 Punkte,
         * Faktor 7,4. Die Schwelle liegt bei 5,0.
         *
         * Vorher stand hier „Faktor 2,3" — gemessen mit Bots, die nach jeder
         * vollen Bauschleife zehn Minuten schliefen, in einer Welt, die nur
         * 200 Events je Stunde verarbeitete.
         */
        expect(bots).toBeGreaterThan(barbarians * 5.0);
    });

    it('baut Speicher und Bauernhof mit aus (19-4)', () => {
        // Vorher blieben beide in jeder echten Welt auf Stufe 1–2.
        // Gemessen nach zwei Spielwochen: Speicher 4,8, Bauernhof 3,8.
        const avg = (building: string) =>
            (
                world.sqlite
                    .prepare(
                        `SELECT AVG(b.level) AS n FROM buildings b
                         JOIN villages v ON v.id = b.village_id
                         WHERE v.player_id > 1 AND b.type = ?`,
                    )
                    .get(building) as { n: number }
            ).n;
        expect(avg('warehouse')).toBeGreaterThan(3.5);
        expect(avg('farm')).toBeGreaterThan(2.5);
    });

    // Gemessen nach zwei Spielwochen: Wall turtle 15,5 / raider 7,7;
    // Hauptgebäude expander 14,0 / turtle 4,0.
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
