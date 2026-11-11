import { REPORT_FILTERS, type ReportFilter } from '@medival/shared';
import { Link } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button, TAB_LINK_CLASS } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { Table, Th } from '../../components/Table.js';
import { useStores } from '../../stores/StoreContext.js';
import { ReportRow } from './ReportRow.js';

/**
 * Die Berichtsliste: Tabelle mit Filterreitern, Auswahl und Blättern
 * (plans/18-ux/18-4-berichte.md).
 */
export const ReportsView = observer(function ReportsView({
    worldId,
    filter,
    page,
}: {
    worldId: string;
    filter: ReportFilter;
    page: number;
}) {
    const { t } = useTranslation();
    const { reports } = useStores();
    const params = { worldId };
    const loading =
        !reports.reports.hasValue && reports.reports.isLoading;

    return (
        <Card>
            <h2>{t('reports.title')}</h2>
            <nav className="mb-3 flex flex-wrap gap-1">
                {REPORT_FILTERS.map((option) => (
                    <Link
                        key={option}
                        to="/worlds/$worldId/reports"
                        params={params}
                        search={{ filter: option, page: 1 }}
                        className={TAB_LINK_CLASS}
                        data-status={
                            option === filter ? 'active' : undefined
                        }
                    >
                        {t(`reports.filter.${option}`)}
                    </Link>
                ))}
            </nav>

            <div className="mb-2 flex flex-wrap items-center gap-3">
                <Button
                    variant="tab"
                    disabled={reports.unreadCount === 0}
                    onClick={() => void reports.markAllRead()}
                >
                    {t('reports.markAllRead')}
                </Button>
                <Button
                    variant="tab"
                    disabled={reports.selected.size === 0}
                    onClick={() => void reports.removeSelected()}
                >
                    {t('reports.deleteSelected', {
                        count: reports.selected.size,
                    })}
                </Button>
                <span className="text-ink-light tabular-nums">
                    {t('reports.count', { count: reports.total })}
                </span>
            </div>
            {reports.actionError && (
                <p className="text-seal">{reports.actionError}</p>
            )}
            {reports.reports.error && (
                <p className="text-seal">{reports.reports.error}</p>
            )}

            {loading ? (
                <p className="text-ink-light">{t('reports.loading')}</p>
            ) : reports.list.length === 0 ? (
                <p className="text-ink-light">
                    {filter === 'all'
                        ? t('reports.empty')
                        : t('reports.emptyFilter')}
                </p>
            ) : (
                <Table>
                    <thead>
                        <tr>
                            <Th className="w-8">
                                <input
                                    type="checkbox"
                                    checked={reports.allSelected}
                                    onChange={() => reports.toggleAll()}
                                    aria-label={t('reports.selectAll')}
                                />
                            </Th>
                            <Th className="w-8" />
                            <Th>{t('reports.colSubject')}</Th>
                            <Th>{t('reports.colTime')}</Th>
                            <Th className="w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {reports.list.map((report) => (
                            <ReportRow
                                key={report.id}
                                report={report}
                                worldId={worldId}
                                selected={reports.selected.has(
                                    report.id,
                                )}
                                onToggle={() =>
                                    reports.toggleSelected(report.id)
                                }
                                onDelete={() =>
                                    void reports.remove([report.id])
                                }
                            />
                        ))}
                    </tbody>
                </Table>
            )}

            {reports.pageCount > 1 && (
                <nav className="mt-3 flex items-center gap-3 tabular-nums">
                    {page > 1 && (
                        <Link
                            to="/worlds/$worldId/reports"
                            params={params}
                            search={{ filter, page: page - 1 }}
                            className="text-seal underline"
                        >
                            {t('reports.previousPage')}
                        </Link>
                    )}
                    <span className="text-ink-light">
                        {t('reports.pageOf', {
                            page,
                            pages: reports.pageCount,
                        })}
                    </span>
                    {page < reports.pageCount && (
                        <Link
                            to="/worlds/$worldId/reports"
                            params={params}
                            search={{ filter, page: page + 1 }}
                            className="text-seal underline"
                        >
                            {t('reports.nextPage')}
                        </Link>
                    )}
                </nav>
            )}
        </Card>
    );
});
