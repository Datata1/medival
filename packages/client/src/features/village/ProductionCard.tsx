import type { Resources } from '@medival/shared';
import { RESOURCE_KEYS } from '@medival/shared';
import { useTranslation } from 'react-i18next';
import type { SpriteId } from '../../assets/registry.js';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';
import { formatNumber } from '../../lib/format.js';

const RESOURCE_ICONS = {
    wood: 'icon.wood',
    clay: 'icon.clay',
    iron: 'icon.iron',
} as const satisfies Record<keyof Resources, SpriteId>;

/**
 * Was das Dorf je Stunde erwirtschaftet.
 *
 * `rates` kommt fertig mit der Weltgeschwindigkeit verrechnet vom Server
 * (`resourceRatePerHour`) — hier wird nichts nachmultipliziert, sonst stünde
 * die Zahl bei Geschwindigkeit 200 quadriert da.
 */
export function ProductionCard({ rates }: { rates: Resources }) {
    const { t } = useTranslation();
    return (
        <Card tight>
            <h2>{t('village.overview.production')}</h2>
            <ul className="m-0 list-none p-0">
                {RESOURCE_KEYS.map((key) => (
                    <li
                        key={key}
                        className="flex justify-between py-0.5 tabular-nums"
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <Icon name={RESOURCE_ICONS[key]} />
                            {t(`village.${key}`)}
                        </span>
                        <strong>
                            {t('village.overview.perHour', {
                                amount: formatNumber(rates[key]),
                            })}
                        </strong>
                    </li>
                ))}
            </ul>
        </Card>
    );
}
