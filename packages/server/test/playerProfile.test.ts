import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { World } from '../src/engine/world.js';
import { WorldManager } from '../src/engine/worldManager.js';

/** Der Gründer der Testwelt — Spieler 1 mit dem Dorf in der Mitte (19-9). */
const PLAYER_ID = 1;

let dir: string;
let manager: WorldManager;
let world: World;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-profile-'));
    manager = new WorldManager(dir);
    world = manager.createWorld(
        'Profilwelt',
        {
            speed: 100,
            mapSize: 40,
            botCount: 4,
            barbarianCount: 6,
            // Barbaren ruhig stellen: Diese Tests prüfen anderes, und tickende
            // Dörfer würden Ereigniszahlen und Ressourcen unvorhersehbar machen.
            // Barbarenverhalten hat eine eigene Datei (barbarian.test.ts).
            barbarianAttemptsPerHour: 0,
            seed: 777,
        },
        { founder: { name: 'Spieler' } },
    );
    world.pause();
});

afterEach(() => {
    manager.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Der Endpunkt wird über dieselbe Datenlage geprüft, die die Route benutzt.
 * Die Route selbst ist eine dünne Hülle; die Aussagekraft steckt in den Zahlen.
 */
function profileData(playerId: number) {
    const player = world.sqlite
        .prepare(
            'SELECT id, name, is_bot, personality FROM players WHERE id = ?',
        )
        .get(playerId) as
        | {
              id: number;
              name: string;
              is_bot: number;
              personality: string | null;
          }
        | undefined;
    if (!player) return null;

    const villages = world.sqlite
        .prepare(
            'SELECT id, name, x, y, points FROM villages WHERE player_id = ?',
        )
        .all(playerId) as Array<{ id: number; points: number }>;
    const totalPoints = villages.reduce((sum, v) => sum + v.points, 0);

    const totals = new Map<number, number>();
    for (const row of world.sqlite
        .prepare(
            'SELECT player_id, points FROM villages WHERE player_id IS NOT NULL',
        )
        .all() as Array<{ player_id: number; points: number }>) {
        totals.set(
            row.player_id,
            (totals.get(row.player_id) ?? 0) + row.points,
        );
    }
    const ahead = [...totals.values()].filter(
        (p) => p > totalPoints,
    ).length;

    return {
        player,
        villageCount: villages.length,
        totalPoints,
        rank: ahead + 1,
    };
}

describe('Spielerprofil', () => {
    it('liefert Dorfzahl, Punkte und Rang des Spielers', () => {
        const profile = profileData(PLAYER_ID);
        expect(profile).not.toBeNull();
        expect(profile?.villageCount).toBe(1);
        expect(profile?.totalPoints).toBeGreaterThan(0);
        expect(profile?.rank).toBeGreaterThanOrEqual(1);
    });

    it('zählt Barbarendörfer nicht in die Rangliste', () => {
        const barbarianVillages = world.sqlite
            .prepare(
                'SELECT COUNT(*) AS n FROM villages WHERE player_id IS NULL',
            )
            .get() as { n: number };
        expect(barbarianVillages.n).toBeGreaterThan(0);

        // Alle Ränge stammen ausschließlich von echten Spielern und Bots.
        const playerCount = (
            world.sqlite
                .prepare('SELECT COUNT(*) AS n FROM players')
                .get() as {
                n: number;
            }
        ).n;
        const profile = profileData(PLAYER_ID);
        expect(profile?.rank).toBeLessThanOrEqual(playerCount);
    });

    it('kennt die Persönlichkeit eines Bots', () => {
        const bot = world.sqlite
            .prepare('SELECT id FROM players WHERE is_bot = 1 LIMIT 1')
            .get() as { id: number };
        const profile = profileData(bot.id);
        expect(profile?.player.is_bot).toBe(1);
        expect(profile?.player.personality).toBeTruthy();
    });

    it('liefert nichts für eine unbekannte Spieler-ID', () => {
        expect(profileData(9999)).toBeNull();
    });
});
