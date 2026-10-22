/**
 * Einheitliches Zeitsystem (siehe plans/02-zeitsystem-shared.md).
 *
 * Zwei Branded Types auf number-Basis — zur Laufzeit gewöhnliche Zahlen
 * (DB-/JSON-kompatibel, keine Kosten), zur Compile-Zeit nicht verwechselbar:
 *
 * - `GameTime`: absoluter Spielzeit-Stempel (ms seit Weltstart, nie negativ)
 * - `Duration`: Zeitspanne in ms
 *
 * Arithmetik mit den Werten als Zahl (z. B. `completesAt - now`) bleibt möglich
 * und ergibt `number`; wo eine Funktion explizit `GameTime`/`Duration` verlangt,
 * erzwingt der Compiler eine bewusste Konstruktion über diese Helfer.
 *
 * AUSNAHME vom Cast-Verbot (plans/08-no-typecasting.md): Diese Datei darf
 * casten, weil hier die Brands *entstehen*. Jeder Cast steht hinter einer
 * Laufzeitprüfung — ein NaN oder Infinity kann einen Zeitwert nie verlassen,
 * egal welcher Unsinn hereingereicht wurde. Genau das trennt einen validierten
 * Konstruktor von einer bloßen Typ-Behauptung.
 */

export type GameTime = number & { readonly __brand: 'GameTime' };
export type Duration = number & { readonly __brand: 'Duration' };

/** Eingaben großzügig annehmen (roher ms-Wert oder Duration), Ausgaben streng typen. */
export type DurationLike = Duration | number;
export type GameTimeLike = GameTime | number;

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

/** Wird geworfen, wenn ein Zeitwert nicht darstellbar ist (NaN, Infinity, negativ). */
export class TimeValueError extends TypeError {
    constructor(what: string, value: unknown) {
        super(
            `${what} muss eine endliche Zahl sein, war: ${String(value)}`,
        );
        this.name = 'TimeValueError';
    }
}

function finiteDuration(n: number): Duration {
    if (!Number.isFinite(n)) throw new TimeValueError('Duration', n);
    return n as Duration;
}

/**
 * Zeitpunkte sind **ganze Millisekunden** (plans/19-prototyp/19-2). Vorher
 * entstanden über `exponentialWait` und `Duration.scale` Stempel wie
 * 9079141.307; Gleichstand und Reihenfolge zweier Events waren damit eine
 * Frage der Nachkommastellen statt eine Regel. Gerundet wird hier, an der
 * einzigen Stelle, an der ein `GameTime` entsteht.
 */
function finiteGameTime(n: number): GameTime {
    if (!Number.isFinite(n) || n < 0)
        throw new TimeValueError('GameTime', n);
    return Math.round(n) as GameTime;
}

export const Duration = {
    ms(n: DurationLike): Duration {
        return finiteDuration(n);
    },
    seconds(n: number): Duration {
        return finiteDuration(n * MS_PER_SECOND);
    },
    minutes(n: number): Duration {
        return finiteDuration(n * MS_PER_MINUTE);
    },
    hours(n: number): Duration {
        return finiteDuration(n * MS_PER_HOUR);
    },
    zero: 0 as Duration,

    add(a: DurationLike, b: DurationLike): Duration {
        return finiteDuration(a + b);
    },
    scale(d: DurationLike, factor: number): Duration {
        return finiteDuration(d * factor);
    },
    /** Rundet auf ganze ms und erzwingt eine Untergrenze (z. B. Mindest-Bauzeit). */
    atLeast(d: DurationLike, min: DurationLike): Duration {
        return finiteDuration(
            Math.max(Math.round(finiteDuration(d)), min),
        );
    },

    toSeconds(d: DurationLike): number {
        return d / MS_PER_SECOND;
    },
    toHours(d: DurationLike): number {
        return d / MS_PER_HOUR;
    },
} as const;

export const GameTime = {
    /** Konstruktor an DB-/API-Grenzen: prüft, statt nur zu behaupten. */
    of(n: GameTimeLike): GameTime {
        return finiteGameTime(n);
    },
    zero: 0 as GameTime,

    add(t: GameTime, d: DurationLike): GameTime {
        return finiteGameTime(t + d);
    },
    /** Zeitspanne from → to; nie negativ (Schutz gegen rückdatierte Stempel). */
    between(from: GameTimeLike, to: GameTimeLike): Duration {
        return finiteDuration(Math.max(0, to - from));
    },
    max(a: GameTime, b: GameTime): GameTime {
        return finiteGameTime(Math.max(a, b));
    },
} as const;

/**
 * Ersetzt alle "x pro Stunde × Δt"-Rechnungen (Produktion, Loyalität, …):
 * `amountAtRate(30, Duration.hours(2)) === 60`.
 */
export function amountAtRate(
    perHour: number,
    elapsed: DurationLike,
): number {
    const amount = (perHour * elapsed) / MS_PER_HOUR;
    if (!Number.isFinite(amount))
        throw new TimeValueError('Rate', perHour);
    return amount;
}
