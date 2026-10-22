import type { GameTime } from '@medival/shared';
import { ClockTime } from './ClockTime.js';
import { Countdown } from './Countdown.js';

/**
 * Ankunft einer Bewegung: Uhrzeit auf die Millisekunde und Restzeit
 * (plans/19-prototyp/19-3). Die Uhrzeit ist das, was Spieler sich notieren;
 * der Countdown das, worauf sie warten.
 */
export function Arrival({ at }: { at: GameTime }) {
    return (
        <span className="inline-flex items-baseline gap-2">
            <span className="text-ink-light text-sm">
                <ClockTime at={at} withMs />
            </span>
            <Countdown until={at} />
        </span>
    );
}
