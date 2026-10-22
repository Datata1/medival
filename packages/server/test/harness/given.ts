import {
    type BuildingLevels,
    entriesOf,
    type Resources,
    STARTING_BUILDINGS,
    type Units,
    villagePoints,
    warehouseCapacity,
} from '@medival/shared';
import type {
    Difficulty,
    Personality,
} from '../../src/ai/personalities.js';
import { players } from '../../src/db/schema.js';
import { insertVillage } from '../../src/engine/mapgen.js';
import {
    acceptInvitation,
    foundTribe,
    invitePlayer,
} from '../../src/engine/tribes.js';
import type { World } from '../../src/engine/world.js';

/**
 * Ausgangslagen als Daten (plans/19-prototyp/19-1).
 *
 * Die Builder schreiben direkt in die Tabellen — über `insertVillage`, den
 * Weg, den auch die Kartengenerierung nimmt. Spielregeln umgehen sie
 * bewusst nicht: Truppen, Rohstoffe und Stufen werden *gesetzt*, nicht
 * erspielt, aber alles Weitere läuft über die echten Kommandos.
 */

export interface PlayerSpec {
    name?: string;
    /** Mit `true` ein Bot — ohne Tick-Kette; die startet ein Test selbst. */
    bot?: boolean;
    personality?: Personality;
    difficulty?: Difficulty;
}

let playerCounter = 0;

export function givenPlayer(
    world: World,
    spec: PlayerSpec = {},
): number {
    playerCounter++;
    const bot = spec.bot ?? false;
    const row = world.db
        .insert(players)
        .values({
            name: spec.name ?? `Spieler ${playerCounter}`,
            isBot: bot,
            personality: bot ? (spec.personality ?? 'balanced') : null,
            difficulty: bot ? (spec.difficulty ?? 'normal') : null,
        })
        .returning({ id: players.id })
        .all()[0];
    if (!row) throw new Error('givenPlayer: kein Spieler angelegt');
    return row.id;
}

export interface VillageSpec {
    x: number;
    y: number;
    name?: string;
    /** Abweichungen von `STARTING_BUILDINGS`. */
    levels?: Partial<BuildingLevels>;
    units?: Units;
    /** Feste Menge, oder `'full'` für ein volles Lager. */
    resources?: Resources | 'full';
}

/** Ein Dorf für `playerId` (`null` = Barbarendorf). Liefert die Dorf-ID. */
export function givenVillage(
    world: World,
    playerId: number | null,
    spec: VillageSpec,
): number {
    const levels: BuildingLevels = {
        ...STARTING_BUILDINGS,
        ...spec.levels,
    };
    const id = insertVillage(
        world.db,
        playerId,
        spec.x,
        spec.y,
        spec.name ?? `Dorf ${spec.x}|${spec.y}`,
        levels,
    );
    if (spec.units) world.addUnits(id, spec.units);

    const capacity = warehouseCapacity(levels.warehouse);
    const res =
        spec.resources === 'full'
            ? { wood: capacity, clay: capacity, iron: capacity }
            : (spec.resources ?? null);
    /*
     * `insertVillage` stempelt Rohstoffe auf Spielzeit 0. In einer Welt,
     * die schon läuft, hätte das neue Dorf sonst rückwirkend Produktion
     * seit Weltbeginn — der Stempel gehört auf „jetzt".
     */
    world.sqlite
        .prepare(
            `UPDATE villages SET
               wood = COALESCE(?, wood), clay = COALESCE(?, clay),
               iron = COALESCE(?, iron), points = ?,
               resources_updated_at = ?, loyalty_updated_at = ?
             WHERE id = ?`,
        )
        .run(
            res?.wood ?? null,
            res?.clay ?? null,
            res?.iron ?? null,
            villagePoints(levels),
            world.now(),
            world.now(),
            id,
        );
    return id;
}

/** Setzt Gebäudestufen eines bestehenden Dorfes (und dessen Punkte). */
export function givenLevels(
    world: World,
    villageId: number,
    levels: Partial<BuildingLevels>,
): void {
    for (const [type, level] of entriesOf(levels)) {
        world.sqlite
            .prepare(
                'UPDATE buildings SET level = ? WHERE village_id = ? AND type = ?',
            )
            .run(level, villageId, type);
    }
    world.sqlite
        .prepare('UPDATE villages SET points = ? WHERE id = ?')
        .run(
            villagePoints(world.getBuildingLevels(villageId)),
            villageId,
        );
}

/**
 * Ein Stamm aus `founderId` und `memberIds` — über die echten Kommandos
 * (gründen, einladen, annehmen), damit Ansehen und Einladungen stimmen.
 */
export function givenTribe(
    world: World,
    founderId: number,
    memberIds: readonly number[] = [],
    name = 'Teststamm',
    tag = 'TST',
): number {
    const tribeId = foundTribe(world, founderId, name, tag);
    for (const id of memberIds) {
        invitePlayer(world, founderId, id);
        acceptInvitation(world, id, tribeId);
    }
    return tribeId;
}
