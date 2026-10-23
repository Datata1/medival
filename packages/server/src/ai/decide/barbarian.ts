import {
    BUILDINGS,
    type BuildingLevels,
    type BuildingType,
    buildCost,
    canAfford,
    entriesOf,
    farmCapacity,
    type Resources,
    type Rng,
    requirementsMet,
    UNITS,
    type UnitType,
    unitCost,
    warehouseCapacity,
} from '@medival/shared';

/**
 * Entscheidung eines Barbarendorfs (siehe plans/14-barbarendoerfer.md).
 *
 * **Pure Funktion.** Kein Datenbankzugriff, keine Uhr, kein Zufall außer dem
 * hereingereichten `Rng`. Ein Test dafür lautet: Snapshot als Literal
 * hinschreiben, Ergebnis prüfen — ohne SQLite, ohne Scheduler, ohne Welt.
 */

/** Alles, was für die Entscheidung nötig ist — flach und ohne Verhalten. */
export interface BarbarianSnapshot {
    levels: BuildingLevels;
    resources: Resources;
    /** Bevölkerung inkl. Bauschleife, Rekrutierungsschleife und Reisenden. */
    popInUse: number;
    points: number;
    /** Steht schon etwas in der Bauschleife? Barbaren reihen nicht auf. */
    building: boolean;
    /** Steht schon etwas in der Rekrutierungsschleife? */
    recruiting: boolean;
    maxPoints: number;
}

export type BarbarianAction =
    | { kind: 'build'; building: BuildingType }
    | { kind: 'recruit'; unit: UnitType; count: number }
    | { kind: 'idle' };

/**
 * Grundgewicht je Gebäude; 0 heißt „rührt ein Barbar nie an".
 *
 * Bewusst als **vollständiges** Literal über alle Gebäudetypen, nicht als
 * Teilmenge: So erzwingt der Compiler bei einem neuen Gebäude eine
 * Entscheidung hier, statt es still auf 0 zu lassen — dasselbe Muster wie
 * `EMPTY_BUILDING_LEVELS` in `shared/src/data/buildings.ts`.
 *
 * Stall, Adelshof und Marktplatz stehen deshalb ausdrücklich mit 0 da: Ein
 * Barbarendorf stellt keine Kavallerie auf, bekommt nie einen Adligen und
 * handelt mit niemandem.
 */
const BUILD_WEIGHTS: Record<BuildingType, number> = {
    timber_camp: 10,
    clay_pit: 10,
    iron_mine: 8,
    warehouse: 4,
    farm: 4,
    headquarters: 3,
    barracks: 1,
    wall: 1,
    stable: 0,
    // Barbaren belagern niemanden (19-11).
    workshop: 0,
    // Barbaren forschen nicht (Schwerter haben sie von Anfang an), ihr
    // Versteck und ihr Versammlungsplatz bleiben, wie sie entstanden (19-13).
    smithy: 0,
    rally_point: 0,
    hiding_place: 0,
    // Barbaren haben keinen Paladin (19-14).
    statue: 0,
    academy: 0,
    // Barbaren handeln nicht — ein Marktplatz wäre nutzloser Ballast.
    market: 0,
};

/** Womit sich ein Barbarendorf verteidigt — Infanterie, sonst nichts. */
const RECRUITABLE: readonly UnitType[] = ['spear', 'sword'];

const RECRUIT_BATCH = 5;
/** Anteil des Lagers, den ein Dorf für Truppen ausgeben mag. */
const RECRUIT_BUDGET = 0.4;
/** Ab dieser Auslastung des Lagers gilt der Speicher als Engpass. */
const STORAGE_TIGHT = 0.8;
/** Ab dieser Auslastung des Bauernhofs gilt die Bevölkerung als Engpass. */
const FARM_TIGHT = 0.9;

/**
 * Kandidaten werden **vorher gefiltert**, nicht per try/catch ausgesiebt.
 *
 * Wenn hier nur Bezahlbares herauskommt, ist ein `GameError` aus einem
 * Barbaren-Tick ein *echter* Fehler und keine Alltagsmeldung. Sonst gewöhnt
 * man sich an rote Logzeilen und übersieht die eine, die zählt.
 */
function affordableBuildings(
    snapshot: BarbarianSnapshot,
): { building: BuildingType; weight: number }[] {
    const { levels, resources, popInUse } = snapshot;
    const capacity = warehouseCapacity(levels.warehouse);
    const farmMax = farmCapacity(levels.farm);
    const storageTight =
        Math.min(resources.wood, resources.clay, resources.iron) >=
        capacity * STORAGE_TIGHT;
    const farmTight = popInUse >= farmMax * FARM_TIGHT;

    const candidates: { building: BuildingType; weight: number }[] = [];
    for (const [building, baseWeight] of entriesOf(BUILD_WEIGHTS)) {
        if (baseWeight <= 0) continue;
        const level = levels[building] + 1;
        if (level > BUILDINGS[building].maxLevel) continue;
        if (!requirementsMet(building, levels)) continue;

        const cost = buildCost(building, level);
        // Ein Ziel, das nie ins Lager passt, ist unerreichbar — erst Speicher.
        if (
            cost.wood > capacity ||
            cost.clay > capacity ||
            cost.iron > capacity
        )
            continue;
        if (!canAfford(resources, cost)) continue;

        let weight = baseWeight;
        // Engpässe hochgewichten, statt sie als Sonderfall vorzuziehen: So
        // bleibt die Wahl zufällig, drängt aber in die richtige Richtung.
        if (building === 'warehouse' && storageTight) weight *= 6;
        if (building === 'farm' && farmTight) weight *= 8;
        candidates.push({ building, weight });
    }
    return candidates;
}

/** Zieht gewichtet aus einer nichtleeren Liste. */
function weightedPick<T>(
    rng: Rng,
    items: readonly { value: T; weight: number }[],
): T | null {
    const total = items.reduce((sum, i) => sum + i.weight, 0);
    if (total <= 0) return null;
    let roll = rng() * total;
    for (const item of items) {
        roll -= item.weight;
        if (roll < 0) return item.value;
    }
    return items[items.length - 1]?.value ?? null;
}

function affordableUnits(
    snapshot: BarbarianSnapshot,
): { unit: UnitType; count: number }[] {
    const { levels, resources, popInUse } = snapshot;
    if (levels.barracks < 1) return [];
    const popLeft = farmCapacity(levels.farm) - popInUse;
    if (popLeft <= 0) return [];

    const budget: Resources = {
        wood: resources.wood * RECRUIT_BUDGET,
        clay: resources.clay * RECRUIT_BUDGET,
        iron: resources.iron * RECRUIT_BUDGET,
    };
    const options: { unit: UnitType; count: number }[] = [];
    for (const unit of RECRUITABLE) {
        const perUnit = UNITS[unit].pop;
        const count = Math.min(
            RECRUIT_BATCH,
            Math.floor(popLeft / perUnit),
        );
        if (count < 1) continue;
        if (!canAfford(budget, unitCost(unit, count))) continue;
        options.push({ unit, count });
    }
    return options;
}

/**
 * Wählt die nächste Handlung. `idle` ist ein vollwertiges Ergebnis: Ein Dorf,
 * das nichts bezahlen kann, tut nichts und versucht es beim nächsten Tick.
 */
export function decideBarbarianAction(
    snapshot: BarbarianSnapshot,
    rng: Rng,
): BarbarianAction {
    const atCap = snapshot.points >= snapshot.maxPoints;

    // Über dem Deckel wird nicht mehr gebaut, aber weiter rekrutiert — sonst
    // wäre ein ausgewachsenes Dorf mit der Zeit ein wehrloses Ziel.
    const builds =
        atCap || snapshot.building ? [] : affordableBuildings(snapshot);
    const recruits = snapshot.recruiting
        ? []
        : affordableUnits(snapshot);

    const options: { value: BarbarianAction; weight: number }[] = [
        ...builds.map((b) => ({
            value: { kind: 'build' as const, building: b.building },
            weight: b.weight,
        })),
        ...recruits.map((r) => ({
            value: {
                kind: 'recruit' as const,
                unit: r.unit,
                count: r.count,
            },
            weight: 6,
        })),
    ];
    if (options.length === 0) return { kind: 'idle' };

    // Auch mit bezahlbaren Möglichkeiten passiert manchmal nichts: Barbaren
    // sollen träge wirken, nicht wie ein optimierender Spieler.
    const total = options.reduce((sum, o) => sum + o.weight, 0);
    options.push({ value: { kind: 'idle' }, weight: total * 0.25 });

    return weightedPick(rng, options) ?? { kind: 'idle' };
}

/** Nur für Tests und Diagnose — welche Gebäude ein Barbar überhaupt anfasst. */
export const BARBARIAN_BUILDINGS: BuildingType[] = entriesOf(
    BUILD_WEIGHTS,
)
    .filter(([, weight]) => weight > 0)
    .map(([building]) => building);
