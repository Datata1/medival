import { distance } from '@medival/shared';
import { and, between } from 'drizzle-orm';
import { villages } from '../db/schema.js';
import type { World } from './world.js';

/**
 * Räumliche Abfragen (plans/19-prototyp/19-5).
 *
 * Wer etwas „in der Nähe" sucht, fragt die Datenbank nach einem Rechteck,
 * statt alle Dörfer der Welt zu lesen und in JavaScript zu filtern. Der
 * `UNIQUE(x, y)`-Index trägt die Abfrage. Wahrnehmung, Platzierung (19-6)
 * und Karten-API (19-7) benutzen dieselben Funktionen.
 */

export interface VillageLite {
    id: number;
    playerId: number | null;
    x: number;
    y: number;
    points: number;
}

/** Alle Dörfer im achsenparallelen Rechteck, Ränder eingeschlossen. */
export function villagesInBox(
    world: World,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
): VillageLite[] {
    return world.db
        .select({
            id: villages.id,
            playerId: villages.playerId,
            x: villages.x,
            y: villages.y,
            points: villages.points,
        })
        .from(villages)
        .where(
            and(
                between(villages.x, Math.floor(x0), Math.ceil(x1)),
                between(villages.y, Math.floor(y0), Math.ceil(y1)),
            ),
        )
        .all();
}

/** Dörfer im Umkreis `r` um (cx|cy), mit Entfernung. */
export function villagesInRange(
    world: World,
    cx: number,
    cy: number,
    r: number,
): (VillageLite & { dist: number })[] {
    return villagesInBox(world, cx - r, cy - r, cx + r, cy + r)
        .map((v) => ({ ...v, dist: distance(cx, cy, v.x, v.y) }))
        .filter((v) => v.dist <= r);
}
