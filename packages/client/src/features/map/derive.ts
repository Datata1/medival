import type {
    GameTimeLike,
    MovementInfo,
    MovementsResponse,
    Terrain,
} from '@medival/shared';
import type { SpriteId } from '../../assets/registry.js';

/**
 * Jede Bewegungsart hat ihr eigenes Zeichen — in der Liste wie auf der Karte.
 * Die Tabelle steht hier und nicht in `MovementsPanel.tsx`, seit der Marker
 * auf dem Bewegungsstrahl dieselbe Zuordnung braucht.
 */
export const KIND_ICONS = {
    attack: 'icon.attack',
    support: 'icon.support',
    return: 'icon.return',
    trade: 'icon.trade',
} as const satisfies Record<MovementInfo['kind'], SpriteId>;

/**
 * Das Sprite eines Geländes — `plain` ist die Wiese selbst und bekommt keins.
 * Ein `Record` über `Terrain`: Kommt im Shared-Paket eine Sorte dazu, ist das
 * hier ein Compile-Fehler statt einer unsichtbaren Landschaft.
 */
export const TERRAIN_SPRITES = {
    plain: null,
    forest: 'terrain.forest',
    hill: 'terrain.hill',
    water: 'terrain.water',
} as const satisfies Record<Terrain, SpriteId | null>;

/** Eine Bewegung samt ihrer Richtung — die Karte färbt danach. */
export interface MovementLine {
    movement: MovementInfo;
    incoming: boolean;
}

/**
 * Beide Listen zu einer, mit der Richtung als Feld.
 *
 * Vorher zog der Renderer die Listen zusammen und suchte die Richtung danach
 * per `movements.incoming.includes(m)` wieder heraus — eine Identitätssuche
 * mit quadratischem Aufwand für eine Information, die eine Zeile vorher noch
 * bekannt war.
 */
export function movementLines(
    movements: MovementsResponse | undefined,
): MovementLine[] {
    return [
        ...(movements?.outgoing ?? []).map((movement) => ({
            movement,
            incoming: false,
        })),
        ...(movements?.incoming ?? []).map((movement) => ({
            movement,
            incoming: true,
        })),
    ];
}

/**
 * Wo auf der Strecke steckt die Truppe? 0 = am Ursprung, 1 = am Ziel.
 *
 * Der Abflugzeitpunkt steht seit diesem Ticket in `MovementInfo`; ohne ihn
 * ließe sich die Stelle gar nicht berechnen. Eine Bewegung ohne Dauer (beide
 * Stempel gleich, etwa nach einem Server-Neustart) gilt als angekommen —
 * `0/0` wäre sonst `NaN` und die Truppe verschwände vom Bild.
 */
export function movementProgress(
    movement: MovementInfo,
    now: GameTimeLike,
): number {
    const total = movement.arrivalGameTime - movement.departureGameTime;
    if (total <= 0) return 1;
    const done = (now - movement.departureGameTime) / total;
    return Math.min(1, Math.max(0, done));
}

/** Kantenlänge des Übersichtsausschnitts in Feldern. */
export const MINI_SPAN = 100;

/**
 * Der Ausschnitt der Übersichtskarte: `MINI_SPAN`×`MINI_SPAN` Felder um die
 * Kamera, so verschoben, dass er in der Welt bleibt; auf kleineren Karten die
 * ganze Welt.
 *
 * Bis 19-6 zeigte die Übersicht immer die ganze Welt. Auf 1000×1000 waren
 * Dörfer dort nur noch ein Punktehaufen in der Mitte — der Maßstab einer
 * Übersicht muss zur Nachbarschaft passen, nicht zur Weltgröße.
 */
export function miniWindow(
    camera: { x: number; y: number },
    mapSize: number,
    span = MINI_SPAN,
): { x0: number; y0: number; span: number } {
    if (mapSize <= span) return { x0: 0, y0: 0, span: mapSize };
    const clamp = (c: number) =>
        Math.min(mapSize - span, Math.max(0, Math.round(c - span / 2)));
    return { x0: clamp(camera.x), y0: clamp(camera.y), span };
}
