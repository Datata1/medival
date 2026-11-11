import { entriesOf, type Units } from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon.js';
import { formatNumber } from '../../lib/format.js';

/**
 * Truppen als Zeile: je Einheit ein Symbol, darunter Anzahl und Verluste.
 *
 * Vorher standen die Einheiten untereinander, drei Spalten breit. Angreifer
 * und Verteidiger passten so nicht auf einen Bildschirm
 * (plans/18-ux/18-4-berichte.md).
 */
export function UnitLossTable({
    units,
    losses,
}: {
    units: Units;
    /** Ohne Verluste (Spähbericht, 19-10) entfällt die Zeile. */
    losses?: Units;
}) {
    const { t } = useTranslation();
    const columns = entriesOf(units).filter(([, n]) => n > 0);
    if (columns.length === 0)
        return (
            <p className="text-ink-light">{t('reports.noTroops')}</p>
        );
    return (
        <div className="overflow-x-auto">
            <table className="border-collapse text-[0.95rem] tabular-nums">
                <thead>
                    <tr>
                        <td />
                        {columns.map(([type]) => (
                            <th
                                key={type}
                                scope="col"
                                title={t(`units.${type}`)}
                                className="min-w-14 px-2 pb-1 text-center font-normal"
                            >
                                <Icon name={`unit.${type}`} size={24} />
                                <span className="sr-only">
                                    {t(`units.${type}`)}
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th
                            scope="row"
                            className="pr-3 text-left font-normal text-ink-light"
                        >
                            {t('reports.colCount')}
                        </th>
                        {columns.map(([type, n]) => (
                            <td key={type} className="px-2 text-center">
                                {formatNumber(n)}
                            </td>
                        ))}
                    </tr>
                    {losses && (
                        <tr>
                            <th
                                scope="row"
                                className="pr-3 text-left font-normal text-ink-light"
                            >
                                {t('reports.colLosses')}
                            </th>
                            {columns.map(([type]) => {
                                const lost = losses[type] ?? 0;
                                return (
                                    <td
                                        key={type}
                                        className={`px-2 text-center ${
                                            lost > 0
                                                ? 'font-semibold text-seal'
                                                : 'text-ink-light'
                                        }`}
                                    >
                                        {formatNumber(lost)}
                                    </td>
                                );
                            })}
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
