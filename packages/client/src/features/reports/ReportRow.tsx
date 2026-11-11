import type { Report } from '@medival/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { ClockTime } from '../../components/ClockTime.js';
import { Icon } from '../../components/Icon.js';
import { Td } from '../../components/Table.js';
import { summarize } from './derive.js';

/** Ungelesen: halbfett mit Siegelkante links. */
const UNREAD = 'font-semibold shadow-[inset_4px_0_0_var(--color-seal)]';

/** Eine Zeile der Berichtsliste (plans/18-ux/18-4-berichte.md). */
export function ReportRow({
    report,
    worldId,
    selected,
    onToggle,
    onDelete,
}: {
    report: Report;
    worldId: string;
    selected: boolean;
    onToggle: () => void;
    onDelete: () => void;
}) {
    const { t } = useTranslation();
    const summary = summarize(report, t);
    const subject = summary.subject;
    return (
        <tr className={report.read ? undefined : UNREAD}>
            <Td className="w-8">
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={onToggle}
                    aria-label={t('reports.select', { subject })}
                />
            </Td>
            <Td className="w-8">
                <Icon name={summary.icon} />
            </Td>
            <Td>
                <Link
                    to="/worlds/$worldId/reports/$reportId"
                    params={{ worldId, reportId: String(report.id) }}
                    className="text-seal underline"
                >
                    {subject}
                </Link>
                {summary.conquered && (
                    <Icon name="icon.conquered" className="ml-1" />
                )}
                {!report.read && (
                    <span className="sr-only">
                        {' '}
                        ({t('reports.unread')})
                    </span>
                )}
            </Td>
            <Td className="whitespace-nowrap text-ink-light">
                <ClockTime at={report.createdGameTime} />
            </Td>
            <Td className="w-8 text-right!">
                <Button variant="link" onClick={onDelete}>
                    {t('reports.delete')}
                </Button>
            </Td>
        </tr>
    );
}
