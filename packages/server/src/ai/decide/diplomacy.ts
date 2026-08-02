import { attitudeOf, distanceInfluence } from '@medival/shared';

/**
 * Beitritt und Stammesgründung (siehe plans/17-staemme-und-krieg.md).
 *
 * **Pure Funktionen** — durchgesetzt von `scripts/check-ai-purity.mjs`.
 */

export interface Invitation {
    tribeId: number;
    /** Wer eingeladen hat — an ihm wird die Haltung gemessen. */
    inviterId: number;
    standing: number;
}

export interface FoundingCandidate {
    playerId: number;
    /** Wie der Bot über ihn denkt. */
    standing: number;
    /** Wie er über den Bot denkt — Zuneigung muss gegenseitig sein. */
    theirStanding: number;
    distance: number;
    inTribe: boolean;
}

/**
 * Nimmt ein Bot eine Einladung an?
 *
 * Ab `friendly` — das ist die direkte Verbindung zu Plan 16: Handel ist der
 * Weg, Bots in den eigenen Stamm zu holen.
 */
export function decideInvitation(
    invitations: readonly Invitation[],
    alreadyInTribe: boolean,
): number | null {
    if (alreadyInTribe) return null;
    let best: Invitation | null = null;
    for (const invitation of invitations) {
        const attitude = attitudeOf(invitation.standing);
        if (attitude !== 'friendly' && attitude !== 'allied') continue;
        if (!best || invitation.standing > best.standing)
            best = invitation;
    }
    return best?.tribeId ?? null;
}

/** Ab dieser **gegenseitigen** Bewertung gründen zwei Bots einen Stamm. */
const FOUNDING_STANDING = 40;
/**
 * Wie selten das passieren soll. Eine Welt, in der sich sofort alle 30 Bots
 * zusammenschließen, hat keine Fronten — deshalb muss zusätzlich ein Wurf
 * gelingen.
 */
export const FOUNDING_CHANCE = 0.15;

/**
 * Mit wem ein Bot einen Stamm gründet — oder `null`.
 *
 * **Gegenseitig** ist die entscheidende Bedingung: Ansehen ist asymmetrisch
 * (Plan 16), und einseitige Zuneigung soll kein Bündnis begründen.
 */
export function decideFounding(
    candidates: readonly FoundingCandidate[],
    alreadyInTribe: boolean,
    roll: number,
): number | null {
    if (alreadyInTribe) return null;
    if (roll > FOUNDING_CHANCE) return null;

    let best: { playerId: number; score: number } | null = null;
    for (const candidate of candidates) {
        if (candidate.inTribe) continue;
        if (candidate.standing < FOUNDING_STANDING) continue;
        if (candidate.theirStanding < FOUNDING_STANDING) continue;
        // Nähe zählt: Ein Bündnis über die halbe Karte hätte keine Wirkung.
        const score =
            (candidate.standing + candidate.theirStanding) *
            distanceInfluence(candidate.distance);
        if (!best || score > best.score)
            best = { playerId: candidate.playerId, score };
    }
    return best?.playerId ?? null;
}
