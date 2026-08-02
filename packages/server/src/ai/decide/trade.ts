import {
    type Attitude,
    attitudeOf,
    distanceInfluence,
    RESOURCE_KEYS,
    type Resources,
} from '@medival/shared';

/**
 * Wem ein Bot Rohstoffe liefert (siehe plans/16-ansehen-und-handel.md).
 *
 * **Pure Funktion** — durchgesetzt von `scripts/check-ai-purity.mjs`.
 *
 * Der Kreislauf ist damit beidseitig: Freundschaft ist nichts, was man nur
 * kauft. Ein Bot, der einen mag, liefert von sich aus zurück.
 */

/** Ein möglicher Empfänger, so wie die Entscheidung ihn sieht. */
export interface TradePartner {
    playerId: number;
    villageId: number;
    /** Wie dieser Bot über den Empfänger denkt. */
    standing: number;
    distance: number;
    /**
     * Woran es dem Empfänger fehlt, soweit bekannt. Fehlt die Angabe, wird
     * gleichmäßig geliefert.
     */
    needs?: Resources;
}

export interface ShipDecision {
    partner: TradePartner;
    resources: Resources;
}

/**
 * Ab dieser Haltung wird geliefert.
 *
 * `neutral` ist ausdrücklich dabei, und das ist keine Nachlässigkeit: Ohne
 * einen ersten Schritt aus dem Nichts hätte das Beziehungssystem zwischen
 * Bots **keinen Anfang**. Liefern ist der einzige Weg, freundlich zu werden —
 * und wenn nur an Freunde geliefert würde, bliebe für immer alles neutral.
 * Genau das ist beim ersten Lauf passiert: eine ganze Spielwoche, kein
 * einziger Stamm.
 *
 * Feindliche und misstrauische Nachbarn bekommen weiterhin nichts.
 */
const GIVING_ATTITUDES: readonly Attitude[] = [
    'neutral',
    'friendly',
    'allied',
];

/**
 * Sockel für die Auswahl unter Neutralen. Ohne ihn wäre die Bewertung bei
 * Ansehen 0 durchweg 0, und die Nähe entschiede nichts mehr.
 */
const GOODWILL_BASE = 20;

/**
 * Was ein Bot als Überschuss ansieht. Unterhalb dieses Füllstands liefert er
 * nichts — sonst verschenkt er, was er selbst zum Ausbauen braucht.
 */
const SURPLUS_THRESHOLD = 0.75;
/** Höchstens so viel des Lagers geht auf eine Reise. */
const SHARE_PER_SHIPMENT = 0.25;

/**
 * Was ein Dorf entbehren kann: alles über der Überschussschwelle, gedeckelt
 * auf einen Anteil des Lagers und auf die freie Händlerkapazität.
 */
export function surplusOf(
    resources: Resources,
    capacity: number,
    merchantsFree: number,
): Resources {
    const floor = capacity * SURPLUS_THRESHOLD;
    const out: Resources = { wood: 0, clay: 0, iron: 0 };
    let budget = Math.min(
        merchantsFree,
        Math.floor(capacity * SHARE_PER_SHIPMENT),
    );
    if (budget <= 0) return out;

    for (const key of RESOURCE_KEYS) {
        if (budget <= 0) break;
        const spare = Math.floor(resources[key] - floor);
        if (spare <= 0) continue;
        const give = Math.min(spare, budget);
        out[key] = give;
        budget -= give;
    }
    return out;
}

function totalOf(r: Resources): number {
    return r.wood + r.clay + r.iron;
}

/**
 * Wählt Empfänger und Menge — oder `null`, wenn nichts zu verschenken ist.
 *
 * Bevorzugt wird, wer nah ist und gut über einen denkt: Beides zusammen macht
 * die Lieferung wirksam, denn die Entfernung dämpft auch die Wirkung aufs
 * Ansehen (`distanceInfluence`). An einen fernen Freund zu liefern kostet
 * dasselbe und bringt fast nichts.
 */
export function decideShipment(
    resources: Resources,
    capacity: number,
    merchantsFree: number,
    partners: readonly TradePartner[],
): ShipDecision | null {
    const surplus = surplusOf(resources, capacity, merchantsFree);
    if (totalOf(surplus) <= 0) return null;

    let best: { partner: TradePartner; score: number } | null = null;
    for (const partner of partners) {
        if (!GIVING_ATTITUDES.includes(attitudeOf(partner.standing)))
            continue;
        const score =
            (partner.standing + GOODWILL_BASE) *
            distanceInfluence(partner.distance);
        if (!best || score > best.score) best = { partner, score };
    }
    if (!best) return null;

    // Wenn bekannt ist, was fehlt, gezielt liefern: Der Empfänger baut damit
    // schneller, und beim Ansehen zählt nur, was im Lager ankommt.
    const needs = best.partner.needs;
    if (!needs) return { partner: best.partner, resources: surplus };

    const budget = totalOf(surplus);
    const missing = RESOURCE_KEYS.map((key) => ({
        key,
        amount: Math.max(0, needs[key]),
    })).filter((n) => n.amount > 0);
    if (missing.length === 0)
        return { partner: best.partner, resources: surplus };

    const targeted: Resources = { wood: 0, clay: 0, iron: 0 };
    let left = budget;
    for (const { key, amount } of missing) {
        if (left <= 0) break;
        // Nicht mehr als vorhanden — der Überschuss ist die harte Grenze.
        const give = Math.min(amount, left, surplus[key] + left);
        targeted[key] = Math.min(give, resources[key]);
        left -= targeted[key];
    }
    return totalOf(targeted) > 0
        ? { partner: best.partner, resources: targeted }
        : { partner: best.partner, resources: surplus };
}
