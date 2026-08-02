import {
    BUILDINGS,
    type BuildingLevels,
    type BuildingType,
    buildCost,
    type Duration,
    farmCapacity,
    productionPerHour,
    type Resources,
    requirementsMet,
    timeUntilAffordable,
} from '@medival/shared';
import {
    BUILDING_CATEGORY,
    PERSONALITY_WEIGHTS,
    type Personality,
} from '../personalities.js';

/**
 * Was ein Bot als Nächstes bauen sollte (plans/15-bot-grundgeruest.md).
 *
 * **Pure Funktion.** Kein Datenbankzugriff, keine Uhr, kein freier Zufall —
 * durchgesetzt von `scripts/check-ai-purity.mjs`. Getestet wird sie mit einem
 * Snapshot als Literal, ohne SQLite und ohne laufende Welt.
 *
 * Der Unterschied zu Barbaren (Plan 14) ist bewusst: Barbaren würfeln aus
 * dem, was sie sich gerade leisten können. Bots wählen ein **Ziel** — auch
 * eines, das sie sich noch nicht leisten können — und sparen darauf hin. Der
 * Zeitpunkt der Bezahlbarkeit wird ausgerechnet, nicht abgewartet.
 */

/** Ein Dorf, so wie die Entscheidung es sieht. Flach, ohne Verhalten. */
export interface VillageSnapshot {
    id: number;
    /** Tatsächlich gebaute Stufen — maßgeblich für Produktion und Voraussetzungen. */
    levels: BuildingLevels;
    /**
     * Stufen **einschließlich** dessen, was schon in der Bauschleife steht.
     *
     * `World.upgradeBuilding` rechnet die Schleife in die Zielstufe ein. Sähe
     * die Entscheidung nur die gebauten Stufen, würde sie ein bereits
     * eingereihtes Gebäude ein zweites Mal auf dieselbe Stufe schicken und
     * `max_level` kassieren — genau das ist beim ersten Lauf passiert.
     */
    plannedLevels: BuildingLevels;
    resources: Resources;
    /** Produktion je Stunde, bereits mit der Weltgeschwindigkeit skaliert. */
    ratesPerHour: Resources;
    capacity: number;
    popInUse: number;
    /** Steht schon etwas in der Bauschleife? */
    queueLength: number;
}

export interface BuildChoice {
    building: BuildingType;
    level: number;
    cost: Resources;
    /** `null`, wenn sofort bezahlbar. */
    waitFor: Duration | null;
    /** Warum dieses Gebäude — für Tests und spätere Diagnose. */
    reason: 'farm' | 'warehouse' | 'economy' | 'personality';
}

/** Ab dieser Auslastung des Bauernhofs blockiert die Bevölkerung alles Weitere. */
const FARM_TIGHT = 0.85;
/** Nicht endlos aufreihen — der Rest wird beim nächsten Tick entschieden. */
const QUEUE_LIMIT = 2;

function nextLevel(
    village: VillageSnapshot,
    building: BuildingType,
): number | null {
    // Zielstufe aus der geplanten Sicht, Voraussetzungen aus der gebauten —
    // genau so prüft es auch `World.upgradeBuilding`.
    const level = village.plannedLevels[building] + 1;
    if (level > BUILDINGS[building].maxLevel) return null;
    if (!requirementsMet(building, village.levels)) return null;
    return level;
}

function choice(
    village: VillageSnapshot,
    building: BuildingType,
    reason: BuildChoice['reason'],
    /**
     * Mit `true` zählt nur, ob der Rohstoff nachwächst — nicht, ob die Kosten
     * ins Lager passen. So lässt sich ein Ziel *erkennen*, für das erst der
     * Speicher ausgebaut werden muss, statt es stillschweigend zu übergehen.
     */
    ignoreCapacity = false,
): BuildChoice | null {
    const level = nextLevel(village, building);
    if (level === null) return null;
    const cost = buildCost(building, level);
    const waitFor = timeUntilAffordable(
        village.resources,
        cost,
        village.ratesPerHour,
        ignoreCapacity ? Number.POSITIVE_INFINITY : village.capacity,
    );
    if (waitFor === null) return null;
    return { building, level, cost, waitFor, reason };
}

/** Passen die Kosten überhaupt ins Lager? */
function fitsInStore(cost: Resources, capacity: number): boolean {
    return (
        cost.wood <= capacity &&
        cost.clay <= capacity &&
        cost.iron <= capacity
    );
}

/**
 * Rohstoffgebäude nach Nutzen je Kosten: Welches bringt den meisten Zuwachs
 * pro ausgegebenem Rohstoff?
 *
 * Gerechnet wird mit `productionPerHour` und `buildCost` — denselben Formeln,
 * die dem Spieler in der Oberfläche angezeigt werden. Ein zweites,
 * vereinfachtes Modell für Bots wäre nach der nächsten Balancing-Änderung
 * falsch.
 */
const RESOURCE_BUILDINGS = [
    'timber_camp',
    'clay_pit',
    'iron_mine',
] as const satisfies readonly BuildingType[];

function bestEconomyChoice(
    village: VillageSnapshot,
    ignoreCapacity = false,
): BuildChoice | null {
    let best: { option: BuildChoice; value: number } | null = null;
    for (const building of RESOURCE_BUILDINGS) {
        const option = choice(
            village,
            building,
            'economy',
            ignoreCapacity,
        );
        if (!option) continue;
        const current = productionPerHour(village.levels[building]);
        const after = productionPerHour(option.level);
        const totalCost =
            option.cost.wood + option.cost.clay + option.cost.iron;
        if (totalCost <= 0) continue;
        const value = (after - current) / totalCost;
        if (!best || value > best.value) best = { option, value };
    }
    return best?.option ?? null;
}

/**
 * Ein Wert, der Gewicht und Kosten zusammenbringt.
 *
 * Ohne den Kostenanteil spart ein Bot ewig auf den Adelshof und baut nie eine
 * Kaserne. Die Wurzel dämpft: Doppelte Kosten sollen nicht den halben Wert
 * bedeuten, sonst wird nur noch Billiges gebaut.
 */
function scoreOf(weight: number, cost: Resources): number {
    const total = cost.wood + cost.clay + cost.iron;
    return total > 0 ? weight / Math.sqrt(total) : 0;
}

/** Das nach Persönlichkeit höchstbewertete erreichbare Gebäude. */
function personalityChoice(
    village: VillageSnapshot,
    personality: Personality,
): { option: BuildChoice; score: number } | null {
    const weights = PERSONALITY_WEIGHTS[personality];
    let best: { option: BuildChoice; score: number } | null = null;
    for (const [building, category] of Object.entries(
        BUILDING_CATEGORY,
    )) {
        if (!isBuilding(building)) continue;
        // Wirtschaft läuft über `bestEconomyChoice` — dort zählt der Ertrag.
        if (category === 'economy') continue;
        const weight = weights[category];
        if (weight <= 0) continue;
        const option = choice(village, building, 'personality');
        if (!option) continue;
        const score = scoreOf(weight, option.cost);
        if (!best || score > best.score) best = { option, score };
    }
    return best;
}

function isBuilding(value: string): value is BuildingType {
    return value in BUILDINGS;
}

/**
 * Die Rangfolge. Erst was blockiert, dann was trägt, dann was der Charakter
 * will — in dieser Reihenfolge, weil ein voller Bauernhof jedes andere
 * Vorhaben unmöglich macht und ein zu kleiner Speicher jede Produktion
 * verfallen lässt.
 */
export function decideBuild(
    village: VillageSnapshot,
    personality: Personality,
): BuildChoice | null {
    if (village.queueLength >= QUEUE_LIMIT) return null;

    // 1. Bauernhof, wenn die Bevölkerung klemmt.
    const farmMax = farmCapacity(village.levels.farm);
    if (village.popInUse >= farmMax * FARM_TIGHT) {
        const farm = choice(village, 'farm', 'farm');
        if (farm) return farm;
    }

    /*
     * 2. Speicher, wenn das **nächste Ziel** nicht hineinpasst.
     *
     * Das Kriterium ist Erreichbarkeit des angestrebten Ausbaus, nicht „x
     * Stunden Produktion" — und es wird *vorausschauend* geprüft, nicht erst,
     * wenn gar nichts mehr geht.
     *
     * Zwei Irrwege liegen hinter dieser Zeile. Der erste Entwurf verlangte
     * Platz für 1,5 Stunden Produktion; bei Speed 200 sind das Speicher Stufe
     * 12, **bevor** ein Bot sein erstes Holzfällerlager ausbaut — im Browser
     * hatten alle Bots nach einer Minute Speicher 3,0 und sonst nichts. Der
     * zweite Entwurf baute den Speicher erst, wenn *überhaupt nichts* mehr
     * hineinpasste; das ist rein reaktiv und kostete gegenüber dem ersten
     * Entwurf ein Drittel des Wachstums (Faktor 4,0 → 2,7 gegen Barbaren).
     *
     * Beides zusammen ergibt die Regel hier: Das beste Wirtschaftsziel wird
     * ohne Rücksicht auf das Lager bestimmt; passt es nicht hinein, ist der
     * Speicher dran. Das ist von der Weltgeschwindigkeit unabhängig und
     * blockiert den frühen Ausbau nicht.
     */
    const wanted = bestEconomyChoice(village, true);
    if (wanted && !fitsInStore(wanted.cost, village.capacity)) {
        const warehouse = choice(village, 'warehouse', 'warehouse');
        if (warehouse) return warehouse;
    }

    // 3. Wirtschaft: das Rohstoffgebäude mit dem besten Nutzen je Kosten.
    const economy = bestEconomyChoice(village);

    // 4. Persönlichkeit — was der Charakter jenseits der Wirtschaft will.
    const flavour = personalityChoice(village, personality);

    // Nichts erreichbar: Dann ist der Speicher die letzte Möglichkeit.
    if (!economy && !flavour) {
        return choice(village, 'warehouse', 'warehouse');
    }
    if (!flavour) return economy;
    if (!economy) return flavour.option;

    /*
     * Beide Zweige auf **derselben** Skala vergleichen.
     *
     * Vorher stand hier `weights[category] >= weights.economy` — ein
     * Vergleich roher Kategoriegewichte ohne jeden Kostenbezug. Weil
     * `expansion` bei fast jeder Persönlichkeit mindestens so hoch liegt wie
     * `economy`, gewann immer das Hauptgebäude: Im Browser hatten die Bots
     * nach einer Minute `headquarters 3` und sonst alles auf Stufe 1.
     */
    const weights = PERSONALITY_WEIGHTS[personality];
    const economyScore = scoreOf(weights.economy, economy.cost);
    return flavour.score > economyScore ? flavour.option : economy;
}
