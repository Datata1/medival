import {
    isScoutReport,
    type Report,
    type Units,
} from '@medival/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { ClockTime } from '../../components/ClockTime.js';
import { Icon } from '../../components/Icon.js';
import { encodeTroops } from '../../lib/troops.js';
import { useStores } from '../../stores/StoreContext.js';
import { summarize, survivors } from './derive.js';
import { ReportDetail } from './ReportDetail.js';

/**
 * Wohin die Aktionslinks zeigen: auf das Dorf des Gegners. Im eigenen
 * Angriffs- oder Spähbericht ist das der Verteidiger, im Verteidigungsbericht
 * der Angreifer (der Gegenschlag).
 */
function opponent(report: Report) {
    const mine = report.type === 'attack' || report.type === 'scout';
    return mine
        ? report.payload.defenderVillage
        : report.payload.attackerVillage;
}

/**
 * Die Seite eines einzelnen Berichts (plans/18-ux/18-4-berichte.md):
 * Blättern am Kopf, der Bericht, unten die Aktionen.
 */
export const ReportPage = observer(function ReportPage({
    worldId,
}: {
    worldId: string;
}) {
    const { t } = useTranslation();
    const { reports } = useStores();
    const navigate = useNavigate();
    const params = { worldId };
    const detail = reports.detail.value;

    const backToList = (
        <Link
            to="/worlds/$worldId/reports"
            params={params}
            search={{ filter: reports.filter, page: 1 }}
            className="text-seal underline"
        >
            {t('reports.backToList')}
        </Link>
    );

    if (reports.detail.error)
        return (
            <Card>
                <p className="text-seal">{reports.detail.error}</p>
                {backToList}
            </Card>
        );
    if (!detail)
        return <p className="text-ink-light">{t('reports.loading')}</p>;

    const { report, newerId, olderId } = detail;
    const summary = summarize(report, t);
    const target = opponent(report);
    const attackLink = (label: string, troops?: Units) => (
        <Link
            to="/worlds/$worldId/map"
            params={params}
            search={{
                x: target.x,
                y: target.y,
                ...(troops ? { troops: encodeTroops(troops) } : {}),
            }}
            className="text-seal underline"
        >
            {label}
        </Link>
    );
    const sibling = (id: number | null, label: string) =>
        id === null ? (
            <span className="text-ink-light">{label}</span>
        ) : (
            <Link
                to="/worlds/$worldId/reports/$reportId"
                params={{ worldId, reportId: String(id) }}
                className="text-seal underline"
            >
                {label}
            </Link>
        );

    return (
        <Card>
            {/* Blättern, damit sich eine Angriffswelle durchsehen lässt,
                ohne jedes Mal in die Liste zurückzugehen. */}
            <nav className="mb-3 flex flex-wrap items-center gap-4">
                {backToList}
                <span className="ml-auto flex gap-4">
                    {sibling(newerId, t('reports.newer'))}
                    {sibling(olderId, t('reports.older'))}
                </span>
            </nav>

            <h2 className="flex items-center gap-2">
                <Icon name={summary.icon} size={24} />
                {summary.subject}
            </h2>
            <p className="text-ink-light">
                {t('reports.foughtAt')}{' '}
                <ClockTime at={report.createdGameTime} withMs />
            </p>

            <ReportDetail report={report} worldId={worldId} />

            <nav className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-oak/40 border-t pt-3">
                {attackLink(t('reports.attackVillage'))}
                {!isScoutReport(report) && report.type === 'attack' && (
                    <>
                        {attackLink(
                            t('reports.attackSame'),
                            report.payload.attacker,
                        )}
                        {attackLink(
                            t('reports.attackSurvivors'),
                            survivors(
                                report.payload.attacker,
                                report.payload.attackerLosses,
                            ),
                        )}
                    </>
                )}
                <Button
                    variant="link"
                    className="ml-auto"
                    onClick={() =>
                        void reports
                            .remove([report.id])
                            .then((removed) => {
                                if (!removed) return;
                                void navigate({
                                    to: '/worlds/$worldId/reports',
                                    params,
                                    search: {
                                        filter: reports.filter,
                                        page: 1,
                                    },
                                });
                            })
                    }
                >
                    {t('reports.delete')}
                </Button>
            </nav>
            {reports.actionError && (
                <p className="text-seal">{reports.actionError}</p>
            )}
        </Card>
    );
});
