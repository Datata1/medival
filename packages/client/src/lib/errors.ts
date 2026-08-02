import i18next from 'i18next';
import de from '../i18n/de.js';

/** Fehlercodes, die der Server liefern kann — der Katalog ist die Quelle. */
type ErrorCode = keyof typeof de.errors;

function isKnownCode(code: string): code is ErrorCode {
    return Object.hasOwn(de.errors, code);
}

/**
 * Der Server liefert Fehler-Codes (z. B. "not_enough_resources");
 * hier werden sie übersetzt. Unbekannte Codes werden roh angezeigt, statt
 * eine leere Meldung zu rendern.
 */
export function apiErrorMessage(error: unknown): string {
    const message =
        error instanceof Error ? error.message : String(error);
    return isKnownCode(message)
        ? i18next.t(`errors.${message}`)
        : message;
}
