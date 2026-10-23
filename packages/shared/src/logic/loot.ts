import type { Resources } from '../types.js';

/**
 * Beute eines siegreichen Angriffs (19-13; vorher in `military.ts`).
 *
 * Das Versteck schützt `hidden` je Rohstoff; geplündert wird nur, was
 * darüber liegt. Davon nimmt der Angreifer bis zur Tragkraft, gleichmäßig
 * über die drei Rohstoffe verteilt und abgerundet — mit `hidden = 0` genau die
 * Rechnung von vorher.
 */
export function distributeLoot(
    resources: Resources,
    hidden: number,
    capacity: number,
): Resources {
    const open = {
        wood: Math.max(0, resources.wood - hidden),
        clay: Math.max(0, resources.clay - hidden),
        iron: Math.max(0, resources.iron - hidden),
    };
    const total = open.wood + open.clay + open.iron;
    if (capacity <= 0 || total <= 0)
        return { wood: 0, clay: 0, iron: 0 };
    const share = Math.min(1, capacity / total);
    return {
        wood: Math.floor(open.wood * share),
        clay: Math.floor(open.clay * share),
        iron: Math.floor(open.iron * share),
    };
}
