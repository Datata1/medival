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
