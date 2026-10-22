import { entriesOf, type Units } from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { Table, Td, Th } from '../../components/Table.js';

export function UnitLossTable({
    units,
    losses,
}: {
    units: Units;
    /** Ohne Verluste (Spähbericht, 19-10) entfällt die Spalte. */
    losses?: Units;
}) {
    const { t } = useTranslation();
    const rows = entriesOf(units).filter(([, n]) => n > 0);
    if (rows.length === 0)
        return (
            <p className="text-ink-light">{t('reports.noTroops')}</p>
        );
    return (
        <Table>
            <thead>
                <tr>
                    <Th>{t('reports.colUnit')}</Th>
                    <Th>{t('reports.colCount')}</Th>
                    {losses && <Th>{t('reports.colLosses')}</Th>}
                </tr>
            </thead>
            <tbody>
                {rows.map(([type, n]) => (
                    <tr key={type}>
                        <Td>{t(`units.${type}`)}</Td>
                        <Td>{n}</Td>
                        {losses && <Td>{losses[type] ?? 0}</Td>}
                    </tr>
                ))}
            </tbody>
        </Table>
    );
}
