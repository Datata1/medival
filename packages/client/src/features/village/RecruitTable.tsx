import type { UnitSpec, VillageView } from '@medival/shared';
import {
    isResearched,
    type Resources,
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
    enabledUnits,
    busy,
    error,
    onRecruit,
}: {
    /** Was es in dieser Welt gibt (`world.enabledUnits`, 19-12). */
    enabledUnits: readonly UnitType[];
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
    // Der Paladin (19-14) steht nur zur Wahl, wenn er weder lebt noch schon
    // ernannt wird; nach seinem Tod ist die Wiederbelebung kostenlos.
    const paladin = village.paladin?.state;
    const paladinOpen = paladin === 'none' || paladin === 'dead';
    const available = enabledUnits.filter(
        (type) =>
            UNITS[type].recruitedAt === building &&
            (type !== 'paladin' || paladinOpen),
    );
    const maxOf = (type: UnitType) =>
        type !== 'paladin'
            ? maxRecruitable(type, live, popFree)
            : Math.min(
                  1,
                  paladin === 'dead'
                      ? Math.floor(popFree / UNITS.paladin.pop)
                      : maxRecruitable(type, live, popFree),
              );

    // Nichts auszubilden (etwa in der Statue, solange der Paladin lebt):
    // keine leere Karte.
    if (available.length === 0 && !error) return null;

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
                                researched={isResearched(
                                    type,
                                    village.researched,
                                )}
                                max={maxOf(type)}
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
