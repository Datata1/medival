import {
    BUILDING_ORDER,
    type BuildingLevels,
    type ScoutReport,
} from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { ResourceCost } from '../../components/ResourceCost.js';
import { UnitLossTable } from './UnitLossTable.js';

/** Gebäudestufen als kurze Liste, nur was gebaut ist. */
export function BuildingLevelList({
    levels,
}: {
    levels: BuildingLevels;
}) {
    const { t } = useTranslation();
    return (
        <p className="m-0">
            {BUILDING_ORDER.filter((b) => levels[b] > 0)
                .map((b) => `${t(`buildings.${b}`)} ${levels[b]}`)
                .join(' · ')}
        </p>
    );
}

/**
 * Ein Spähbericht (plans/19-prototyp/19-10). Wie viel er zeigt, bestimmt die
 * Stufe: Was die Überlebenden nicht sehen konnten, steht als „nicht
 * erkundet" da — fehlendes Wissen soll auffallen, nicht verschwinden.
 */
export function ScoutDetail({ report }: { report: ScoutReport }) {
    const { t } = useTranslation();
    const p = report.payload;
    const place = {
        attacker: p.attackerVillage.name,
        ax: p.attackerVillage.x,
        ay: p.attackerVillage.y,
        defender: p.defenderVillage.name,
        dx: p.defenderVillage.x,
        dy: p.defenderVillage.y,
    };
    if (report.type === 'scout_defense')
        return (
            <div className="mt-1.5 mb-3 rounded-md border border-oak bg-parchment-dark/40 p-2.5">
                <p className="m-0">
                    {t('reports.scoutDefenseHeadline', {
                        ...place,
                        sent: p.sent,
                        lost: p.lost,
                        spies: p.defenderSpies ?? 0,
                    })}
                </p>
            </div>
        );
    const missing = (
        <span className="text-ink-light">
            {t('reports.notScouted')}
        </span>
    );
    return (
        <div className="mt-1.5 mb-3 rounded-md border border-oak bg-parchment-dark/40 p-2.5">
            <p>
                {t('reports.scoutHeadline', {
                    ...place,
                    sent: p.sent,
                    lost: p.lost,
                })}
            </p>
            <p>
                {t('reports.scoutResources')}{' '}
                {p.resources ? (
                    <ResourceCost resources={p.resources} />
                ) : (
                    missing
                )}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <h3>{t('reports.scoutUnits')}</h3>
                    {p.units ? (
                        <UnitLossTable units={p.units} />
                    ) : (
                        missing
                    )}
                </div>
                <div>
                    <h3>{t('reports.scoutUnitsAway')}</h3>
                    {p.unitsAway ? (
                        <UnitLossTable
                            units={p.unitsAway}
                            losses={{}}
                        />
                    ) : (
                        missing
                    )}
                </div>
            </div>
            <h3>{t('reports.scoutBuildings')}</h3>
            {p.buildings ? (
                <BuildingLevelList levels={p.buildings} />
            ) : (
                missing
            )}
        </div>
    );
}
