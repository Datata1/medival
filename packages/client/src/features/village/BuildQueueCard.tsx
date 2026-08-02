import type { BuildQueueItem } from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { Countdown } from '../../components/Countdown.js';
import { Icon } from '../../components/Icon.js';

export function BuildQueueCard({ queue }: { queue: BuildQueueItem[] }) {
    const { t } = useTranslation();
    if (queue.length === 0) return null;
    return (
        <Card tight>
            <h2>{t('village.buildQueue')}</h2>
            <ul className="m-0 list-none p-0">
                {queue.map((q) => (
                    <li
                        key={q.id}
                        className="flex justify-between py-1 tabular-nums"
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <Icon name={`building.${q.buildingType}`} />
                            {t(`buildings.${q.buildingType}`)}{' '}
                            {t('village.toLevel', {
                                level: q.targetLevel,
                            })}
                        </span>
                        <Countdown until={q.completesAt} />
                    </li>
                ))}
            </ul>
        </Card>
    );
}
