import type { Resources, VillageView } from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';
import { formatNumber } from '../../lib/format.js';

export function ResourceBar({
    village,
    live,
}: {
    village: VillageView;
    live: Resources;
}) {
    const { t } = useTranslation();
    return (
        <Card className="flex flex-wrap items-center gap-5 border-x-8 border-x-oak tabular-nums">
            <span
                className="inline-flex items-center gap-1.5"
                title={t('village.wood')}
            >
                <Icon name="icon.wood" /> {formatNumber(live.wood)}
            </span>
            <span
                className="inline-flex items-center gap-1.5"
                title={t('village.clay')}
            >
                <Icon name="icon.clay" /> {formatNumber(live.clay)}
            </span>
            <span
                className="inline-flex items-center gap-1.5"
                title={t('village.iron')}
            >
                <Icon name="icon.iron" /> {formatNumber(live.iron)}
            </span>
            <span className="text-ink-light">
                {t('village.storage', {
                    amount: formatNumber(village.capacity),
                })}
            </span>
            <span
                className="inline-flex items-center gap-1.5"
                title={t('village.population')}
            >
                <Icon name="icon.population" /> {village.popUsed}/
                {village.popMax}
            </span>
            <span className="text-ink-light">
                {t('village.nameAndPoints', {
                    name: village.name,
                    x: village.x,
                    y: village.y,
                    points: village.points,
                })}
            </span>
        </Card>
    );
}
