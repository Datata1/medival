import { z } from 'zod';
import { parseRow } from '../db/parse.js';
import type { World } from './world.js';

/**
 * Rangliste (plans/18-ux/18-5-rangliste-profil-einstellungen.md).
 *
 * Die Rechnung stand vorher im Profil-Handler und summierte dort für jedes
 * einzelne Profil die Punkte aller Dörfer der Welt. Hier wird sie einmal für
 * alle gebildet, und Profil wie Rangliste lesen dasselbe Ergebnis. Zwei
 * Stellen, die den Rang ausrechnen, hätten früher oder später zwei Ränge
 * geliefert.
 */

export interface RankedPlayer {
    /** 1 = führend. Gleichstand teilt sich den Rang. */
    rank: number;
    id: number;
    name: string;
    isBot: boolean;
    tribeTag: string | null;
    points: number;
    villageCount: number;
}

export interface RankedTribe {
    rank: number;
    id: number;
    tag: string;
    name: string;
    members: number;
    points: number;
    pointsPerMember: number;
}

const PlayerRowSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    is_bot: z.number().int(),
    tribe_id: z.number().int().nullable(),
    points: z.number().int(),
    village_count: z.number().int(),
});

const TribeRowSchema = z.object({
    id: z.number().int(),
    tag: z.string(),
    name: z.string(),
});

/**
 * Rang bei absteigend sortierten Punkten: so viele liegen davor, plus eins.
 * Gleichstand bekommt denselben Rang, der nächste Platz danach bleibt frei
 * (1, 2, 2, 4) — dieselbe Regel wie das frühere `ahead + 1` im Profil.
 */
function withRanks<T extends { points: number }>(
    sorted: readonly T[],
): Array<T & { rank: number }> {
    let rank = 0;
    let previous: number | null = null;
    return sorted.map((entry, index) => {
        if (entry.points !== previous) {
            rank = index + 1;
            previous = entry.points;
        }
        return { ...entry, rank };
    });
}

/**
 * Alle Spieler und Stämme der Welt nach Punkten.
 *
 * Barbarendörfer haben keinen Spieler und zählen nicht mit. Spieler ohne
 * Dorf stehen mit null Punkten am Ende. Wer sie zeigt, entscheidet der
 * Aufrufer. Die Reihenfolge innerhalb eines Gleichstands folgt der ID, damit
 * zwei Aufrufe nicht verschieden sortieren.
 */
export function ranking(world: World): {
    players: RankedPlayer[];
    tribes: RankedTribe[];
} {
    // Eine Abfrage statt einer je Spieler: Eine Welt hat hunderte Spieler
    // und zehntausende Dörfer.
    const playerRows = world.sqlite
        .prepare(
            `SELECT p.id, p.name, p.is_bot, p.tribe_id,
                    COALESCE(SUM(v.points), 0) AS points,
                    COUNT(v.id) AS village_count
               FROM players p
               LEFT JOIN villages v ON v.player_id = p.id
              GROUP BY p.id
              ORDER BY points DESC, p.id ASC`,
        )
        .all()
        .map((row) => parseRow(PlayerRowSchema, row, 'ranking player'));

    const tribeRows = world.sqlite
        .prepare('SELECT id, tag, name FROM tribes')
        .all()
        .map((row) => parseRow(TribeRowSchema, row, 'ranking tribe'));
    const tribeById = new Map(tribeRows.map((t) => [t.id, t]));

    const players = withRanks(
        playerRows.map((row) => ({
            id: row.id,
            name: row.name,
            isBot: row.is_bot !== 0,
            tribeTag:
                row.tribe_id === null
                    ? null
                    : (tribeById.get(row.tribe_id)?.tag ?? null),
            points: row.points,
            villageCount: row.village_count,
        })),
    );

    const sums = new Map<number, { members: number; points: number }>();
    for (const row of playerRows) {
        if (row.tribe_id === null) continue;
        const sum = sums.get(row.tribe_id) ?? { members: 0, points: 0 };
        sum.members += 1;
        sum.points += row.points;
        sums.set(row.tribe_id, sum);
    }
    const tribes = withRanks(
        tribeRows
            .flatMap((tribe) => {
                const sum = sums.get(tribe.id);
                // Ein Stamm ohne Mitglieder ist keiner mehr.
                if (!sum) return [];
                return [
                    {
                        id: tribe.id,
                        tag: tribe.tag,
                        name: tribe.name,
                        members: sum.members,
                        points: sum.points,
                        pointsPerMember: Math.round(
                            sum.points / sum.members,
                        ),
                    },
                ];
            })
            .sort((a, b) => b.points - a.points || a.id - b.id),
    );

    return { players, tribes };
}
