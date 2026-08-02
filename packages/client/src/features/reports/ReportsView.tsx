import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { useStores } from '../../stores/StoreContext.js';
import { ReportDetail } from './ReportDetail.js';
import { ReportRow } from './ReportRow.js';

export const ReportsView = observer(function ReportsView() {
    const { t } = useTranslation();
    const { reports } = useStores();

    if (!reports.reports.hasValue && reports.reports.isLoading)
        return <p className="text-ink-light">{t('reports.loading')}</p>;
    if (reports.list.length === 0)
        return (
            <Card>
                <p className="text-ink-light">{t('reports.empty')}</p>
            </Card>
        );

    return (
        <Card>
            <h2>{t('reports.title')}</h2>
            <ul className="m-0 list-none p-0">
                {reports.list.map((report) => (
                    <li key={report.id}>
                        <ReportRow
                            report={report}
                            open={reports.openReportId === report.id}
                            onToggle={() =>
                                reports.toggleOpen(report.id)
                            }
                        />
                        {reports.openReportId === report.id && (
                            <ReportDetail report={report} />
                        )}
                    </li>
                ))}
            </ul>
        </Card>
    );
});
