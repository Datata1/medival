import {
    type BattleReport,
    isScoutReport,
    LUCK_RANGE,
    type Report,
} from '@medival/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Gauge } from '../../components/Gauge.js';
import { ResourceCost } from '../../components/ResourceCost.js';
import { BuildingLevelList, ScoutDetail } from './ScoutDetail.js';
import { UnitLossTable } from './UnitLossTable.js';

/** Ein Bericht — Kampf oder Spähen (19-10). */
export function ReportDetail({
    report,
    worldId,
}: {
    report: Report;
    worldId: string;
}) {
    return isScoutReport(report) ? (
        <ScoutDetail report={report} />
    ) : (
        <BattleDetail report={report} worldId={worldId} />
    );
}

/** Dorfname mit Koordinaten, verlinkt auf die Karte an dieser Stelle. */
function VillageLink({
    worldId,
    village,
}: {
    worldId: string;
    village: { name: string; x: number; y: number };
}) {
    return (
        <Link
            to="/worlds/$worldId/map"
            params={{ worldId }}
            search={{ x: village.x, y: village.y }}
            className="text-seal underline"
        >
            {village.name} ({village.x}|{village.y})
        </Link>
    );
}

/**
 * Kampfbericht nach der Vorlage `ideas/assets/bericht_beispiel.png`
 * (plans/18-ux/18-4-berichte.md): Ergebnis groß, Glück als Balken, Angreifer
 * und Verteidiger je als Block mit den Einheiten nebeneinander.
 */
function BattleDetail({
    report,
    worldId,
}: {
    report: BattleReport;
    worldId: string;
}) {
    const { t } = useTranslation();
    const p = report.payload;
    const luckLimit = Math.round(LUCK_RANGE * 100);
    return (
        <div>
            <p className="font-display font-semibold text-xl">
                {p.attackerWon
                    ? t('reports.attackerWon', {
                          name: p.attackerVillage.name,
                      })
                    : t('reports.defenderWon', {
                          name: p.defenderVillage.name,
                      })}
                {p.conquered && (
                    <span className="text-seal">
                        {t('reports.conquered')}
                    </span>
                )}
            </p>

            <h3>{t('reports.luck')}</h3>
            <Gauge
                value={p.luck}
                limit={luckLimit}
                label={t('reports.luckLabel')}
                text={t('reports.luckValue', {
                    luck: p.luck > 0 ? `+${p.luck}` : p.luck,
                })}
            />

            <section className="mt-4 border-oak/40 border-t pt-3">
                <h3>{t('reports.attacker')}</h3>
                <p>
                    {t('reports.origin')}{' '}
                    <VillageLink
                        worldId={worldId}
                        village={p.attackerVillage}
                    />
                </p>
                <UnitLossTable
                    units={p.attacker}
                    losses={p.attackerLosses}
                />
            </section>

            <section className="mt-4 border-oak/40 border-t pt-3">
                <h3>{t('reports.defender')}</h3>
                <p>
                    {t('reports.target')}{' '}
                    <VillageLink
                        worldId={worldId}
                        village={p.defenderVillage}
                    />
                </p>
                <UnitLossTable
                    units={p.defender}
                    losses={p.defenderLosses}
                />
                {p.wallBefore !== p.wallAfter && (
                    <p className="mt-2">
                        {t('reports.wallDamaged', {
                            before: p.wallBefore,
                            after: p.wallAfter,
                        })}
                    </p>
                )}
                {p.buildingDamage &&
                    p.buildingDamage.from !== p.buildingDamage.to && (
                        <p className="mt-2">
                            {t('reports.buildingDamaged', {
                                building: t(
                                    `buildings.${p.buildingDamage.building}`,
                                ),
                                before: p.buildingDamage.from,
                                after: p.buildingDamage.to,
                            })}
                        </p>
                    )}
                {p.loyaltyBefore !== p.loyaltyAfter && (
                    <p className="mt-2">
                        {t('reports.loyalty', {
                            before: Math.round(p.loyaltyBefore),
                            after: Math.round(p.loyaltyAfter),
                        })}
                    </p>
                )}
            </section>

            {(p.attackerWon || p.scouted) && (
                <section className="mt-4 border-oak/40 border-t pt-3">
                    {p.attackerWon && (
                        <p>
                            {t('reports.loot')}{' '}
                            <ResourceCost resources={p.loot} />
                        </p>
                    )}
                    {p.scouted && (
                        <div>
                            <p className="mb-0">
                                {t('reports.scoutedInBattle')}{' '}
                                <ResourceCost
                                    resources={p.scouted.resources}
                                />
                            </p>
                            <BuildingLevelList
                                levels={p.scouted.buildings}
                            />
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
