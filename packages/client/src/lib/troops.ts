import { UNIT_ORDER, type Units } from '@medival/shared';

/**
 * Truppen als Suchparameter der Kartenroute: `spear:10,sword:3`.
 * Kurz und lesbar, weil die Adresse beim erneuten Angriff sichtbar ist.
 */
export function encodeTroops(units: Units): string {
    return UNIT_ORDER.filter((type) => (units[type] ?? 0) > 0)
        .map((type) => `${type}:${units[type]}`)
        .join(',');
}

/** Gegenstück zu `encodeTroops`; Unbekanntes und Unsinn fallen weg. */
export function decodeTroops(text: string): Units {
    const units: Units = {};
    for (const part of text.split(',')) {
        const [name, count] = part.split(':');
        const type = UNIT_ORDER.find((t) => t === name);
        const n = Math.floor(Number(count));
        if (type && Number.isFinite(n) && n > 0) units[type] = n;
    }
    return units;
}
