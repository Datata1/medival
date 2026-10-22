import type { BuildingType } from '@medival/shared';
import type { World } from '../../src/engine/world.js';

/**
 * Lesende Hilfen für Szenarien (plans/19-prototyp/19-1).
 *
 * Im Plan hieß die Datei `expect.ts`; umbenannt, weil sie nichts prüft,
 * sondern Zustand ausliest — die Erwartung schreibt der Test mit Vitest.
 */

export interface ReportRow {
    id: number;
    type: string;
    createdGameTime: number;
    payload: Record<string, unknown>;
}

export function reportsOf(world: World, playerId: number): ReportRow[] {
    const rows = world.sqlite
        .prepare(
            `SELECT id, type, created_game_time AS createdGameTime,
                    payload_json AS payload
             FROM reports WHERE player_id = ? ORDER BY id`,
        )
        .all(playerId) as {
        id: number;
        type: string;
        createdGameTime: number;
        payload: string;
    }[];
    return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

export function unitsAt(world: World, villageId: number) {
    return world.getUnits(villageId);
}

export function ownerOf(
    world: World,
    villageId: number,
): number | null {
    return world.getVillageRow(villageId).playerId;
}

export function levelOf(
    world: World,
    villageId: number,
    building: BuildingType,
): number {
    return world.getBuildingLevels(villageId)[building];
}

/** Summe der Dorfpunkte eines Spielers (`null` = alle Barbaren). */
export function pointsOf(
    world: World,
    playerId: number | null,
): number {
    const row = world.sqlite
        .prepare(
            playerId === null
                ? 'SELECT COALESCE(SUM(points), 0) AS n FROM villages WHERE player_id IS NULL'
                : 'SELECT COALESCE(SUM(points), 0) AS n FROM villages WHERE player_id = ?',
        )
        .get(...(playerId === null ? [] : [playerId])) as { n: number };
    return row.n;
}

/** Ausstehende Events eines Typs, nach Fälligkeit. */
export function pendingEvents(world: World, type?: string) {
    return world.sqlite
        .prepare(
            type === undefined
                ? 'SELECT id, type, due_game_time AS due, payload_json AS payload FROM events ORDER BY due_game_time, id'
                : 'SELECT id, type, due_game_time AS due, payload_json AS payload FROM events WHERE type = ? ORDER BY due_game_time, id',
        )
        .all(...(type === undefined ? [] : [type])) as {
        id: number;
        type: string;
        due: number;
        payload: string;
    }[];
}

/**
 * Hängt einen Beobachter vor die Event-Verarbeitung der Welt und liefert
 * eine Funktion zum Abhängen. Für Invarianten wie „in jedem Handler gilt
 * `now() === dueGameTime`" oder Protokolle einzelner Bot-Ticks.
 */
export function observeEvents(
    world: World,
    fn: (event: {
        id: number;
        type: string;
        dueGameTime: number;
        payload: unknown;
        now: number;
    }) => void,
): () => void {
    // Privates Feld, nur im Test: Der Scheduler ruft `this.handleEvent`
    // zur Laufzeit über die Instanz auf, eine Instanz-Eigenschaft gewinnt.
    const target = world as unknown as {
        handleEvent: (ev: {
            id: number;
            type: string;
            dueGameTime: number;
            payload: unknown;
        }) => void;
    };
    const original = target.handleEvent;
    target.handleEvent = function (ev) {
        fn({ ...ev, now: world.now() });
        return original.call(this, ev);
    };
    return () => {
        target.handleEvent = original;
    };
}
