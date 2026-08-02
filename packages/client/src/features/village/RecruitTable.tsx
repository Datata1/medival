import type { UnitSpec, VillageView } from '@medival/shared';
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

/**
 * Die Ausbildung — seit Plan 18-2 auf der Seite des ausbildenden Gebäudes
 * statt einmal für alles auf der Dorfübersicht. Der Aufbau der Tabelle ist
 * derselbe geblieben, nur der Ort hat gewechselt.
 */
export function RecruitTable({
    building,
    village,
    live,
    speed,
    busy,
    error,
    onRecruit,
}: {
    /** Zeigt nur die Einheiten, die hier ausgebildet werden. */
    building: UnitSpec['recruitedAt'];
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
        (type) => UNITS[type].recruitedAt === building,
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
            {error && <p className="text-seal">{error}</p>}
        </Card>
    );
}
