import type { Report } from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { ClockTime } from '../../components/ClockTime.js';
import { Icon } from '../../components/Icon.js';

export function ReportRow({
    report,
    open,
    onToggle,
}: {
    report: Report;
    open: boolean;
    onToggle: () => void;
}) {
    const { t } = useTranslation();
    const p = report.payload;
    const won =
        report.type === 'attack' ? p.attackerWon : !p.attackerWon;
    const title = t(
        report.type === 'attack'
            ? 'reports.attackOn'
            : 'reports.defenseOf',
        {
            name: p.defenderVillage.name,
            x: p.defenderVillage.x,
            y: p.defenderVillage.y,
        },
    );
    return (
        <button
            type="button"
            aria-expanded={open}
            className="flex w-full items-baseline gap-3 border-oak border-b px-1 py-2 text-left text-ink hover:bg-parchment-dark/60"
            onClick={onToggle}
        >
            <Icon name={won ? 'icon.victory' : 'icon.defeat'} />
            <span>
                {title}
                {p.conquered && (
                    <Icon name="icon.conquered" className="ml-1" />
                )}
            </span>
            <span className="text-ink-light">
                <ClockTime at={report.createdGameTime} />
            </span>
        </button>
    );
}
