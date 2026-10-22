import type { GameTimeLike } from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { formatClock } from '../lib/format.js';
import { useStores } from '../stores/StoreContext.js';

/**
 * Ein Spielzeitpunkt als Uhrzeit (plans/19-prototyp/19-3). Gerechnet mit dem
 * Nullpunkt des Servers, nicht mit der Uhr des Browsers — eine falsch
 * gestellte Rechneruhr verschiebt keine Ankunft.
 */
export const ClockTime = observer(function ClockTime({
    at,
    withMs = false,
}: {
    at: GameTimeLike;
    withMs?: boolean;
}) {
    const { world } = useStores();
    return (
        <time className="tabular-nums">
            {formatClock(world.clockOf(at), withMs)}
        </time>
    );
});
