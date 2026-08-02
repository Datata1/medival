/**
 * Kontinente: die Karte in Hunderterblöcke geteilt (plans/18-ux/18-1-rahmen-und-kopfzeile.md).
 *
 * Ein Kontinent ist kein Spielobjekt, sondern eine Lesehilfe. „K33" ist
 * kürzer als „irgendwo zwischen 300|300 und 399|399" und erlaubt es,
 * über Gegenden zu sprechen, ohne Koordinaten zu vergleichen.
 *
 * Auf kleinen Karten (`mapSize` beginnt bei 20) liegt alles auf K0. Das ist
 * richtig so und kein Sonderfall — dort braucht niemand eine Gegendangabe.
 */
export function continentOf(x: number, y: number): number {
    return Math.floor(y / 100) * 10 + Math.floor(x / 100);
}
