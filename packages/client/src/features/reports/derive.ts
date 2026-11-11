import {
    entriesOf,
    isScoutReport,
    type Report,
    type Units,
} from '@medival/shared';
import type { TFunction } from 'i18next';
import type { SpriteId } from '../../assets/registry.js';

/** Was Liste und Detailseite über einen Bericht gleich sagen. */
export interface ReportSummary {
    icon: SpriteId;
    subject: string;
    /** Aus Sicht dessen, der den Bericht liest. */
    won: boolean;
    conquered: boolean;
}

/**
 * Symbol und Betreff eines Berichts. Stand vorher in der Listenzeile; die
 * Detailseite braucht dasselbe, und zwei Fassungen wären auseinandergelaufen.
 */
export function summarize(report: Report, t: TFunction): ReportSummary {
    const p = report.payload;
    if (isScoutReport(report)) {
        // Spähen (19-10): Ein Spähbericht ist ein Erfolg, ein abgewehrter
        // Spähversuch ebenfalls, aus Sicht des Verteidigers.
        return {
            icon: 'unit.spy',
            subject:
                report.type === 'scout'
                    ? t('reports.scoutOf', {
                          name: p.defenderVillage.name,
                          x: p.defenderVillage.x,
                          y: p.defenderVillage.y,
                      })
                    : t('reports.scoutRepelled', {
                          name: p.attackerVillage.name,
                          x: p.attackerVillage.x,
                          y: p.attackerVillage.y,
                      }),
            won: true,
            conquered: false,
        };
    }
    const won =
        report.type === 'attack'
            ? report.payload.attackerWon
            : !report.payload.attackerWon;
    return {
        icon: won ? 'icon.victory' : 'icon.defeat',
        subject: t('reports.subjectAttack', {
            attacker: p.attackerVillage.name,
            defender: p.defenderVillage.name,
            x: p.defenderVillage.x,
            y: p.defenderVillage.y,
        }),
        won,
        conquered: report.payload.conquered,
    };
}

/** `units − losses`, ohne Einträge mit null. */
export function survivors(units: Units, losses: Units): Units {
    const left: Units = {};
    for (const [type, n] of entriesOf(units)) {
        const rest = n - (losses[type] ?? 0);
        if (rest > 0) left[type] = rest;
    }
    return left;
}
