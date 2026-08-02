import { UNITS } from '../data/units.js';
import { entriesOf } from '../lib/objects.js';
import { Duration } from '../time.js';
import type { Units } from '../types.js';

export function distance(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
): number {
    return Math.hypot(x2 - x1, y2 - y1);
}

/** Speed of the slowest unit in the group, minutes per field at speed 1. */
export function slowestSpeed(units: Units): number {
    let slowest = 0;
    for (const [t, n] of entriesOf(units)) {
        if (n > 0)
            slowest = Math.max(slowest, UNITS[t].speedMinPerField);
    }
    return slowest;
}

/** Travel time between two coordinates for a unit group. */
export function travelTime(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    units: Units,
    unitSpeed: number,
): Duration {
    const dist = distance(x1, y1, x2, y2);
    const minPerField = slowestSpeed(units);
    if (minPerField === 0) return Duration.zero;
    return Duration.atLeast(
        Duration.scale(
            Duration.minutes(dist * minPerField),
            1 / unitSpeed,
        ),
        Duration.seconds(1),
    );
}
