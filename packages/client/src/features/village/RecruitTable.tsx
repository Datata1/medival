import type { VillageView } from '@medival/shared';
import {
    type Resources,
    UNIT_ORDER,
    UNITS,
    type UnitType,
} from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { Table, Th } from '../../components/Table.js';
import { maxRecruitable } from './derive.js';
import { RecruitRow } from './RecruitRow.js';

export function RecruitTable({
    village,
    live,
    speed,
    busy,
    error,
    onRecruit,
}: {
    village: VillageView;
    live: Resources;
    speed: number;
    busy: boolean;
    error: string | null;
    onRecruit: (unit: UnitType, count: number) => void;
}) {
    const { t } = useTranslation();
    const popFree = village.popMax - village.popUsed;
    const available = UNIT_ORDER.filter(
        (type) => village.buildings[UNITS[type].recruitedAt] >= 1,
    );

    return (
        <Card>
            <h2>{t('village.recruit')}</h2>
            {available.length > 0 && (
                <Table>
                    <thead>
                        <tr>
                            <Th>{t('village.colUnit')}</Th>
                            <Th>{t('village.colUnitCost')}</Th>
                            <Th>{t('village.colPerUnit')}</Th>
                            <Th>{t('village.colCount')}</Th>
                            <Th />
                        </tr>
                    </thead>
                    <tbody>
                        {available.map((type) => (
                            <RecruitRow
                                key={type}
                                type={type}
                                max={maxRecruitable(
                                    type,
                                    live,
                                    popFree,
                                )}
                                speed={speed}
                                busy={busy}
                                onRecruit={(count) =>
                                    onRecruit(type, count)
                                }
                            />
                        ))}
                    </tbody>
                </Table>
            )}
            {village.buildings.barracks < 1 && (
                <p className="text-ink-light">
                    {t('village.needBarracks')}
                </p>
            )}
            {error && <p className="text-seal">{error}</p>}
        </Card>
    );
}
