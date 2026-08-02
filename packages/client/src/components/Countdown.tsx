import type { GameTime } from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { formatDuration } from '../lib/format.js';
import { useStores } from '../stores/StoreContext.js';

/** Goldener Countdown bis zu einem Spielzeitpunkt; tickt über den WorldStore. */
export const Countdown = observer(function Countdown({
    until,
}: {
    until: GameTime;
}) {
    const { world } = useStores();
    return (
        <span className="font-semibold text-seal">
            {formatDuration(until - world.gameTime)}
        </span>
    );
});
