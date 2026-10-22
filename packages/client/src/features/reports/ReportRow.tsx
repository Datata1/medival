import { isScoutReport, type Report } from '@medival/shared';
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
    const place = {
        name: p.defenderVillage.name,
        x: p.defenderVillage.x,
        y: p.defenderVillage.y,
    };
    const scouting = isScoutReport(report);
    // Spähen (19-10): Ein Spähbericht ist ein Erfolg, ein abgewehrter
    // Spähversuch ebenfalls — aus Sicht des Verteidigers.
    let won = true;
    let conquered = false;
    let title: string;
    if (isScoutReport(report)) {
        title =
            report.type === 'scout'
                ? t('reports.scoutOf', place)
                : t('reports.scoutRepelled', {
                      name: p.attackerVillage.name,
                      x: p.attackerVillage.x,
                      y: p.attackerVillage.y,
                  });
    } else {
        won =
            report.type === 'attack'
                ? report.payload.attackerWon
                : !report.payload.attackerWon;
        conquered = report.payload.conquered;
        title = t(
            report.type === 'attack'
                ? 'reports.attackOn'
                : 'reports.defenseOf',
            place,
        );
    }
    return (
        <button
            type="button"
            aria-expanded={open}
            className="flex w-full items-baseline gap-3 border-oak border-b px-1 py-2 text-left text-ink hover:bg-parchment-dark/60"
            onClick={onToggle}
        >
            <Icon
                name={
                    scouting
                        ? 'unit.spy'
                        : won
                          ? 'icon.victory'
                          : 'icon.defeat'
                }
            />
            <span>
                {title}
                {conquered && (
                    <Icon name="icon.conquered" className="ml-1" />
                )}
            </span>
            <span className="text-ink-light">
                <ClockTime at={report.createdGameTime} />
            </span>
        </button>
    );
}
