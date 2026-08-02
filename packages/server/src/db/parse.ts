import type { z } from 'zod';
import { GameError } from '../engine/errors.js';

/**
 * Konvertierung an den Datenbank- und HTTP-Grenzen (plans/08-no-typecasting.md).
 *
 * Leitsatz: *Parse at the boundary, trust inside.* Alles, was das Programm
 * betritt, wird hier einmal geprüft — danach sind die Typen verdient und
 * interne Aufrufe prüfen nicht erneut.
 */

/** Wird geworfen, wenn persistierte Daten nicht zu ihrem Schema passen. */
export class DataIntegrityError extends Error {
    constructor(
        readonly context: string,
        readonly issues: string,
    ) {
        super(`Ungültige Daten in ${context}: ${issues}`);
        this.name = 'DataIntegrityError';
    }
}

function describe(error: z.ZodError): string {
    return error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
}

/**
 * Parst eine JSON-Spalte aus der Welt-Datei. Savegames überleben
 * Programmversionen — ein Feldwechsel darf hier nicht still zu `undefined`
 * werden, sondern muss als Integritätsfehler sichtbar sein.
 */
export function parseJsonColumn<T>(
    schema: z.ZodType<T>,
    raw: string,
    context: string,
): T {
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch (cause) {
        throw new DataIntegrityError(
            context,
            `kein gültiges JSON (${String(cause)})`,
        );
    }
    const result = schema.safeParse(json);
    if (!result.success)
        throw new DataIntegrityError(context, describe(result.error));
    return result.data;
}

/** Parst Daten aus einer Abfrage ohne Drizzle-Typisierung (PRAGMA, Roh-SQL). */
export function parseRow<T>(
    schema: z.ZodType<T>,
    row: unknown,
    context: string,
): T {
    const result = schema.safeParse(row);
    if (!result.success)
        throw new DataIntegrityError(context, describe(result.error));
    return result.data;
}

/**
 * Parst eine Eingabe von außen (HTTP-Body, Query, Pfadparameter).
 * Schlägt sie fehl, ist das ein Client-Fehler (HTTP 400), kein Serverfehler.
 */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input);
    if (!result.success) throw new GameError('invalid_input');
    return result.data;
}

/**
 * Erste Zeile eines Abfrageergebnisses oder ein sauberer Spielfehler.
 * Ersetzt das `rows[0]!`-Muster, dessen `!` nur den Compiler beruhigte.
 */
export function firstOrThrow<T>(
    rows: readonly T[],
    errorCode: string,
): T {
    const row = rows[0];
    if (row === undefined) throw new GameError(errorCode);
    return row;
}
