/**
 * Typisierte Object-Helfer (siehe plans/08-no-typecasting.md).
 *
 * `Object.entries` und `Object.keys` verlieren den Schlüsseltyp: TypeScript
 * liefert `string`, obwohl der Objekttyp die Schlüssel kennt. Ohne Helfer
 * entsteht dadurch an jeder Aufrufstelle ein Cast.
 *
 * AUSNAHME vom Cast-Verbot: Diese Datei darf casten. Der Cast ist hier sicher,
 * weil er nichts über *Werte* behauptet — er gibt nur die Schlüsselinformation
 * zurück, die der Compiler ohnehin schon hat. Die Laufzeitdaten bleiben
 * unangetastet, und der Cast lebt an dieser einen Stelle statt an acht
 * Aufrufstellen. Die Werte werden anschließend regulär typgeprüft.
 */

/** Schlüssel eines Objekttyps, soweit sie Strings sind. */
type StringKey<T> = Extract<keyof T, string>;

/** Wie `Object.keys`, behält aber den Schlüsseltyp. */
export function keysOf<T extends object>(obj: T): StringKey<T>[] {
    return Object.keys(obj) as StringKey<T>[];
}

/**
 * Wie `Object.entries`, behält aber den Schlüsseltyp und lässt Einträge mit
 * `undefined`-Wert aus (bei `Partial`-Records der Normalfall).
 */
export function entriesOf<T extends object>(
    obj: T,
): [StringKey<T>, NonNullable<T[StringKey<T>]>][] {
    const result: [StringKey<T>, NonNullable<T[StringKey<T>]>][] = [];
    for (const key of keysOf(obj)) {
        const value = obj[key];
        if (value === undefined || value === null) continue;
        result.push([key, value]);
    }
    return result;
}

/**
 * Ein Record mit genau einem Eintrag. Ein Objektliteral mit berechnetem
 * Schlüssel (`{ [type]: n }`) verliert in TypeScript den Schlüsseltyp und
 * bräuchte einen Cast; die Zuweisung an einen typisierten Record nicht.
 */
export function singleEntry<K extends string, V>(
    key: K,
    value: V,
): Partial<Record<K, V>> {
    const record: Partial<Record<K, V>> = {};
    record[key] = value;
    return record;
}
