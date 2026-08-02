import { entriesOf, type Units } from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';

export function UnitsCard({ units }: { units: Units }) {
    const { t } = useTranslation();
    const list = entriesOf(units).filter(([, n]) => n > 0);
    return (
        <Card tight>
            <h2>{t('village.unitsHome')}</h2>
            {list.length === 0 ? (
                <p className="m-0 text-ink-light">
                    {t('village.noUnits')}
                </p>
            ) : (
                // Eine Zeile je Einheit statt einer umbrechenden Reihe: In der
                // schmalen Spalte der Übersicht brach ohnehin jede Angabe um,
                // nur mit dem großen Abstand einer Reihe dazwischen.
                <ul className="m-0 list-none p-0">
                    {list.map(([type, n]) => (
                        <li
                            key={type}
                            className="flex justify-between py-0.5 tabular-nums"
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <Icon name={`unit.${type}`} />
                                {t(`units.${type}`)}
                            </span>
                            <strong>{n}</strong>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
