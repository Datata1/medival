import { Duration } from '../time.js';

/** Deterministic seeded RNG (mulberry32). One instance per world, state persisted as the seed advances. */
export type Rng = () => number;

export function createRng(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function randInt(rng: Rng, min: number, max: number): number {
    return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Mulberry32 with exposable state (the full state is one 32-bit word),
 * so a world's RNG can be persisted and restored across server restarts.
 */
export interface StatefulRng {
    next: Rng;
    readonly state: number;
}

export function createStatefulRng(state: number): StatefulRng {
    let a = state >>> 0;
    return {
        next: () => {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        },
        get state() {
            return a >>> 0;
        },
    };
}

/**
 * Wartezeit bis zum nächsten Treffer eines Poisson-Prozesses, in Spielstunden.
 *
 * Der Hintergrund (siehe plans/14-barbarendoerfer.md): Gewünscht ist „pro
 * Zeiteinheit besteht die Chance p, dass etwas passiert" — ein Bernoulli-
 * Prozess. Dessen Wartezeit ist exponentialverteilt, und die lässt sich in
 * *einem* Zug ziehen, statt tausendmal zu würfeln, bis einmal „ja" fällt:
 *
 *     Δt = -ln(1 - U) / λ        mit U gleichverteilt [0,1)
 *
 * Das Ergebnis ist dieselbe Verteilung, nicht eine Näherung. Der Unterschied
 * liegt allein in den Kosten: ein Event pro Treffer statt 3600 Würfen pro
 * Stunde. Diese Engine hat bewusst keinen Tick — eine Schleife über alle
 * Dörfer im Sekundentakt wäre die erste Stelle, die das Prinzip bricht.
 *
 * Gibt `null` zurück, wenn die Rate 0 oder ungültig ist: „nie" ist kein
 * Zeitpunkt, und `Infinity` würde sonst als Zeitstempel in der Event-Tabelle
 * landen und den Scheduler auf einem kaputten Wert festnageln.
 */
export function exponentialWait(
    rng: Rng,
    ratePerGameHour: number,
): Duration | null {
    if (!Number.isFinite(ratePerGameHour) || ratePerGameHour <= 0)
        return null;
    // 1 - rng() statt rng(): mulberry32 kann 0 liefern, und ln(0) ist -∞.
    // Der Ausdruck landet damit in (0,1], wo der Logarithmus endlich bleibt.
    const hours = -Math.log(1 - rng()) / ratePerGameHour;
    return Duration.hours(hours);
}

/**
 * Zufälliges Element aus einer garantiert nichtleeren Liste.
 * Der Typ `[T, ...T[]]` macht die Nichtleere zur Compiler-Zusicherung — damit
 * entfällt das `!` an der Aufrufstelle (plans/08-no-typecasting.md).
 */
export function pickRandom<T>(
    rng: Rng,
    items: readonly [T, ...T[]],
): T {
    const index = randInt(rng, 0, items.length - 1);
    return items[index] ?? items[0];
}
