import type { Resources } from '@medival/shared';
import { formatNumber } from '../lib/format.js';
import { Icon } from './Icon.js';

/** Holz/Lehm/Eisen als Dreiergruppe — für Kosten und Beute. */
export function ResourceCost({ resources }: { resources: Resources }) {
    return (
        <span className="inline-flex items-center gap-1 tabular-nums">
            <Icon name="icon.wood" /> {formatNumber(resources.wood)}
            <Icon name="icon.clay" className="ml-1.5" />{' '}
            {formatNumber(resources.clay)}
            <Icon name="icon.iron" className="ml-1.5" />{' '}
            {formatNumber(resources.iron)}
        </span>
    );
}
