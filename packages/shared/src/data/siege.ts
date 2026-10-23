import type { BuildingType } from '../types.js';

/**
 * Katapulte (plans/19-prototyp/19-11-werkstatt-katapult.md).
 *
 * Wie viele Katapulte nötig sind, um ein Gebäude der Stufe L um eine Stufe zu
 * senken — Index 0 ist Stufe 1. Angelehnt an die Tabelle aus Tribal Wars:
 * kleine Gebäude fallen schnell, große kosten ein Vielfaches. Als Daten statt
 * als Formel, weil die Vorlage eine Tabelle ist und sich so Stufe für Stufe
 * nachjustieren lässt.
 */
export const CATAPULTS_PER_LEVEL: readonly number[] = [
    2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 6, 7, 8, 8, 9, 10, 10, 11,
    12, 13, 15, 16, 17, 19, 20, 22,
];

/**
 * Unter diese Stufe fällt ein Gebäude nicht: Ohne Hauptgebäude, Bauernhof
 * und Speicher wäre ein Dorf nicht mehr spielbar.
 */
export const MIN_LEVEL_AFTER_CATAPULTS: Partial<
    Record<BuildingType, number>
> = {
    headquarters: 1,
    farm: 1,
    warehouse: 1,
};

/** Standardziel, wenn beim Abschicken keines gewählt wurde. */
export const DEFAULT_CATAPULT_TARGET: BuildingType = 'headquarters';
