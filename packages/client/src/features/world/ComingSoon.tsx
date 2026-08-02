import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';

/**
 * Platzhalter für die Reiter, deren Seiten noch entstehen (Rangliste,
 * Nachrichten, Einstellungen).
 *
 * Sie stehen bewusst schon in der Kopfzeile: Ein Reiter, der ins Leere führt,
 * ist ärgerlich — einer, der fehlt, verschiebt beim Nachrüsten alle anderen und
 * lässt niemanden erkennen, wohin die Oberfläche will.
 */
export function ComingSoon({ title }: { title: string }) {
    const { t } = useTranslation();
    return (
        <Card>
            <h2>{title}</h2>
            <p>{t('nav.comingSoon')}</p>
            <p className="text-ink-light">{t('nav.comingSoonHint')}</p>
        </Card>
    );
}
