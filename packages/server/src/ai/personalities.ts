import type { BuildingType } from '@medival/shared';
import { z } from 'zod';

/**
 * Persönlichkeit und Schwierigkeit als **Daten** (plans/15-bot-grundgeruest.md).
 *
 * Eine fünfte Persönlichkeit ist damit eine Zeile in dieser Tabelle, kein
 * neuer Zweig in einer `if`-Kaskade. `satisfies` sorgt dafür, dass ein
 * vergessenes Gewicht ein Compile-Fehler ist und kein stiller Standardwert.
 */

export const PERSONALITIES = [
    'turtle',
    'raider',
    'expander',
    'balanced',
] as const;

export type Personality = (typeof PERSONALITIES)[number];

export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Aus der Datenbank kommen Strings — hier werden sie geprüft, nicht behauptet. */
export const PersonalitySchema = z
    .enum(PERSONALITIES)
    .catch('balanced');
export const DifficultySchema = z.enum(DIFFICULTIES).catch('normal');

export interface PersonalityWeights {
    /**
     * Gewichte für den Ausbau jenseits der Rohstoffgebäude. Sie entscheiden,
     * *was* ein Bot baut, sobald die Grundversorgung steht.
     */
    readonly military: number;
    readonly defense: number;
    readonly economy: number;
    readonly expansion: number;
    /** Marktplatz — Handel und damit Diplomatie (Plan 16/17). */
    readonly trade: number;
    /** Wie weit ein Bot über die Grundversorgung hinaus vorausplant. */
    readonly aggression: number;
}

export const PERSONALITY_WEIGHTS = {
    turtle: {
        military: 0.6,
        defense: 3.0,
        economy: 1.4,
        expansion: 0.4,
        trade: 1.6,
        aggression: 0.2,
    },
    raider: {
        military: 3.0,
        defense: 0.5,
        economy: 0.9,
        expansion: 1.0,
        trade: 0.6,
        aggression: 2.5,
    },
    expander: {
        military: 1.0,
        defense: 0.7,
        economy: 1.6,
        expansion: 3.0,
        trade: 1.4,
        aggression: 0.9,
    },
    balanced: {
        military: 1.0,
        defense: 1.0,
        economy: 1.0,
        expansion: 1.0,
        trade: 1.2,
        aggression: 1.0,
    },
} as const satisfies Record<Personality, PersonalityWeights>;

/**
 * Zu welcher Kategorie ein Gebäude gehört. Vollständiges Literal, damit ein
 * neues Gebäude hier eine Zuordnung erzwingt (Muster wie
 * `EMPTY_BUILDING_LEVELS`).
 *
 * Rohstoffgebäude, Speicher und Bauernhof fehlen bewusst: Über sie entscheidet
 * nicht die Persönlichkeit, sondern die Lage — sie kommen in der Rangfolge vor
 * allem anderen (siehe `decide/build.ts`).
 */
export const BUILDING_CATEGORY = {
    headquarters: 'expansion',
    academy: 'expansion',
    barracks: 'military',
    stable: 'military',
    wall: 'defense',
    warehouse: 'economy',
    /*
     * Eigene Kategorie, nicht `economy`: Wirtschaftsgebäude werden über
     * `bestEconomyChoice` nach Ertrag je Kosten gewählt, und dort kommen nur
     * Holz, Lehm und Eisen vor. Als `economy` eingestuft hätte den Marktplatz
     * **niemand** gebaut — beim ersten Lauf entstand deshalb in einer ganzen
     * Spielwoche kein einziger Stamm (Plan 17).
     */
    market: 'trade',
    // Belagerungsgerät (19-11): Teil der Kriegsführung wie Kaserne und Stall.
    workshop: 'military',
    farm: 'economy',
    timber_camp: 'economy',
    clay_pit: 'economy',
    iron_mine: 'economy',
} as const satisfies Record<BuildingType, keyof PersonalityWeights>;

/**
 * Wie oft ein Bot höchstens nachdenkt, wenn gerade nichts zu tun ist —
 * als Faktor auf das Grundintervall. Schwerere Gegner reagieren schneller
 * auf eine veränderte Lage.
 */
export const DIFFICULTY_THINK_FACTOR = {
    easy: 2.5,
    normal: 1.0,
    hard: 0.5,
} as const satisfies Record<Difficulty, number>;

/** Wie viele Intents ein Bot je Tick ausführen darf. */
export const DIFFICULTY_ACTION_BUDGET = {
    easy: 1,
    normal: 2,
    hard: 3,
} as const satisfies Record<Difficulty, number>;
