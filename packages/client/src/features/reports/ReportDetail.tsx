import type { Report } from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { ResourceCost } from '../../components/ResourceCost.js';
import { UnitLossTable } from './UnitLossTable.js';

export function ReportDetail({ report }: { report: Report }) {
    const { t } = useTranslation();
    const p = report.payload;
    return (
        <div className="mt-1.5 mb-3 rounded-md border border-oak bg-parchment-dark/40 p-2.5">
            <p>
                {t('reports.headline', {
                    attacker: p.attackerVillage.name,
                    ax: p.attackerVillage.x,
                    ay: p.attackerVillage.y,
                    defender: p.defenderVillage.name,
                    dx: p.defenderVillage.x,
                    dy: p.defenderVillage.y,
                    outcome: p.attackerWon
                        ? t('reports.attackerWins')
                        : t('reports.defenderHolds'),
                    luck: p.luck > 0 ? `+${p.luck}` : p.luck,
                })}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <h3>{t('reports.attacker')}</h3>
                    <UnitLossTable
                        units={p.attacker}
                        losses={p.attackerLosses}
                    />
                </div>
                <div>
                    <h3>{t('reports.defender')}</h3>
                    <UnitLossTable
                        units={p.defender}
                        losses={p.defenderLosses}
                    />
                </div>
            </div>
            {p.wallBefore !== p.wallAfter && (
                <p>
                    {t('reports.wallDamaged', {
                        before: p.wallBefore,
                        after: p.wallAfter,
                    })}
                </p>
            )}
            {p.loyaltyBefore !== p.loyaltyAfter && (
                <p>
                    {t('reports.loyalty', {
                        before: p.loyaltyBefore,
                        after: p.loyaltyAfter,
                    })}
                    {p.conquered && (
                        <strong>{t('reports.conquered')}</strong>
                    )}
                </p>
            )}
            {p.attackerWon && (
                <p>
                    {t('reports.loot')}{' '}
                    <ResourceCost resources={p.loot} />
                </p>
            )}
        </div>
    );
}
