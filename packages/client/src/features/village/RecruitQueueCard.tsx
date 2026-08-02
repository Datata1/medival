import type { RecruitQueueItem } from '@medival/shared';
import { GameTime } from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { Countdown } from '../../components/Countdown.js';
import { Icon } from '../../components/Icon.js';

export function RecruitQueueCard({
    queue,
}: {
    queue: RecruitQueueItem[];
}) {
    const { t } = useTranslation();
    if (queue.length === 0) return null;
    return (
        <Card>
            <h2>{t('village.recruiting')}</h2>
            <ul className="m-0 list-none p-0">
                {queue.map((q) => (
                    <li
                        key={q.id}
                        className="flex justify-between py-1 tabular-nums"
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <Icon name={`unit.${q.unitType}`} />
                            {q.count}× {t(`units.${q.unitType}`)}
                        </span>
                        {q.nextUnitDoneAt === 0 ? (
                            // 0 = order is waiting for its building's turn
                            <span className="font-semibold text-seal">
                                {t('village.waiting')}
                            </span>
                        ) : (
                            <Countdown
                                until={GameTime.add(
                                    q.nextUnitDoneAt,
                                    (q.count - 1) * q.perUnitMs,
                                )}
                            />
                        )}
                    </li>
                ))}
            </ul>
        </Card>
    );
}
