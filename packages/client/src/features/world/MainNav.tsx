import { PLAYER_ID } from '@medival/shared';
import { Link } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SpriteId } from '../../assets/registry.js';
import { NAV_LINK_CLASS } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { formatNumber } from '../../lib/format.js';
import { useStores } from '../../stores/StoreContext.js';

/**
 * Kleine Zahl am Reiter für Ungelesenes.
 *
 * Sie ist absolut positioniert und schiebt den Reiter deshalb nicht breiter,
 * wenn sie auftaucht — sonst rückt beim ersten ungelesenen Bericht die halbe
 * Kopfzeile zur Seite.
 */
function Badge({ count, label }: { count: number; label: string }) {
    if (count <= 0) return null;
    return (
        <span
            className="-top-1 -right-1 absolute rounded-full border border-timber bg-parchment px-1.5 font-body text-timber text-xs leading-tight"
            title={label}
        >
            {count}
        </span>
    );
}

/**
 * Die Hauptkopfzeile (plans/18-ux/18-1-rahmen-und-kopfzeile.md).
 *
 * Sie trägt **nur** Reiter: vier links, die Rangliste als breiterer Anker in
 * der Mitte, vier rechts. Uhr, Pause, Lautstärke und der Weg zurück in die
 * Lobby standen hier zunächst mit — das brach die Symmetrie und ließ die
 * Leiste zappeln. Sie stehen jetzt in der Dorfleiste bzw. in den Einstellungen.
 *
 * Die Reiter sind echte `<Link>`, keine Knöpfe mit `navigate()`: Damit gibt es
 * Mittelklick, Ankersemantik und Vorladen geschenkt. Den aktiven Zustand setzt
 * der Router selbst als `data-status="active"` — vorher wurde dafür das globale
 * `window.location` gelesen, was nur zufällig funktionierte.
 */
export const MainNav = observer(function MainNav() {
    const { t } = useTranslation();
    const { world, reports, village, sound } = useStores();
    const summary = world.summary;
    if (!summary) return null;

    const worldId = String(summary.id);
    const params = { worldId };
    const villageId = village.villageId;
    const ownPoints = world.playerVillages.reduce(
        (sum, v) => sum + v.points,
        0,
    );

    const tab = (icon: SpriteId, label: string, extra?: ReactNode) => (
        <>
            <Icon name={icon} /> {label}
            {extra}
        </>
    );

    return (
        <header className="nav-dark flex flex-wrap items-center justify-center gap-1.5 border-parchment-dark border-b-2 bg-timber px-3 py-1.5">
            {villageId === null ? (
                <span
                    className={`${NAV_LINK_CLASS} cursor-not-allowed opacity-40`}
                >
                    {tab('icon.village', t('nav.overview'))}
                </span>
            ) : (
                <Link
                    to="/worlds/$worldId/village/$villageId"
                    params={{ worldId, villageId: String(villageId) }}
                    onClick={() => sound.click()}
                    className={NAV_LINK_CLASS}
                >
                    {tab('icon.village', t('nav.overview'))}
                </Link>
            )}

            <Link
                to="/worlds/$worldId/map"
                params={params}
                onClick={() => sound.click()}
                className={NAV_LINK_CLASS}
            >
                {tab('icon.map', t('nav.map'))}
            </Link>

            <Link
                to="/worlds/$worldId/reports"
                params={params}
                onClick={() => sound.click()}
                className={`${NAV_LINK_CLASS} relative`}
            >
                {tab(
                    'icon.report',
                    t('nav.reports'),
                    <Badge
                        count={reports.unreadCount}
                        label={t('nav.unreadCount', {
                            count: reports.unreadCount,
                        })}
                    />,
                )}
            </Link>

            <Link
                to="/worlds/$worldId/messages"
                params={params}
                onClick={() => sound.click()}
                className={NAV_LINK_CLASS}
            >
                {tab('icon.message', t('nav.messages'))}
            </Link>

            {/*
             * Der Anker in der Mitte: wie in der Vorlage breiter und
             * zweizeilig. Die Punkte lassen sich aus den eigenen Dörfern
             * summieren; der Rang braucht den Endpunkt aus Ticket 18-5.
             */}
            <Link
                to="/worlds/$worldId/ranking"
                params={params}
                onClick={() => sound.click()}
                className={`${NAV_LINK_CLASS} flex-col gap-0 leading-tight`}
            >
                <span className="inline-flex items-center gap-1.5">
                    <Icon name="icon.ranking" /> {t('nav.ranking')}
                </span>
                <span className="font-body text-parchment-dark text-xs tabular-nums">
                    {t('nav.points', {
                        points: formatNumber(ownPoints),
                    })}
                </span>
            </Link>

            <Link
                to="/worlds/$worldId/diplomacy"
                params={params}
                onClick={() => sound.click()}
                className={NAV_LINK_CLASS}
            >
                {tab('icon.tribe', t('nav.tribe'))}
            </Link>

            <Link
                to="/worlds/$worldId/players/$playerId"
                params={{ worldId, playerId: String(PLAYER_ID) }}
                onClick={() => sound.click()}
                className={NAV_LINK_CLASS}
            >
                {tab('icon.profile', t('nav.profile'))}
            </Link>

            <Link
                to="/worlds/$worldId/settings"
                params={params}
                onClick={() => sound.click()}
                className={NAV_LINK_CLASS}
            >
                {tab('icon.settings', t('nav.settings'))}
            </Link>

            <Link
                to="/worlds/$worldId/handbook"
                params={params}
                onClick={() => sound.click()}
                className={NAV_LINK_CLASS}
            >
                {tab('icon.handbook', t('nav.handbook'))}
            </Link>
        </header>
    );
});
