import { entriesOf, type Units } from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';

export function UnitsCard({ units }: { units: Units }) {
    const { t } = useTranslation();
    const list = entriesOf(units).filter(([, n]) => n > 0);
    return (
        <Card>
            <h2>{t('village.unitsHome')}</h2>
            {list.length === 0 ? (
                <p className="text-ink-light">{t('village.noUnits')}</p>
            ) : (
                <ul className="m-0 flex list-none flex-wrap gap-5 p-0">
                    {list.map(([type, n]) => (
                        <li
                            key={type}
                            className="inline-flex items-center gap-1.5"
                        >
                            <Icon name={`unit.${type}`} />
                            {t(`units.${type}`)}: <strong>{n}</strong>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
