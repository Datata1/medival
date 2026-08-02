import type { MovementKind } from '@medival/shared';
import { MOVEMENT_KINDS, RALLY_POINT } from '@medival/shared';
import { Link } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import type { SpriteId } from '../../assets/registry.js';
import { Card } from '../../components/Card.js';
import { Countdown } from '../../components/Countdown.js';
import { Icon } from '../../components/Icon.js';
import { useStores } from '../../stores/StoreContext.js';
import { movementRows } from './derive.js';

/**
 * So viele eingehende Zeilen zeigt die Übersicht. Der Rest steht auf dem
 * Versammlungsplatz — die Übersicht beantwortet nur die Frage „kommt etwas?".
 */
const MAX_ROWS = 3;

/** Dieselben Zeichen wie im Bewegungspanel der Karte. */
export const KIND_ICONS = {
    attack: 'icon.attack',
    support: 'icon.support',
    return: 'icon.return',
    trade: 'icon.trade',
} as const satisfies Record<MovementKind, SpriteId>;

/**
 * Was auf dieses Dorf zuhält — die kurze Antwort.
 *
 * Ein- und ausgehende Bewegungen standen zuerst als zwei volle Listen auf der
 * Übersicht. Das war zweimal dieselbe Tabelle wie auf dem Versammlungsplatz,
 * nur enger. Hier steht jetzt, **ob** und **was** kommt; die ganze Liste ist
 * einen Klick entfernt.
 */
export const VillageMovementsCard = observer(
    function VillageMovementsCard({
        villageId,
        worldId,
    }: {
        villageId: number;
        worldId: number;
    }) {
        const { t } = useTranslation();
        const { movements } = useStores();

        const rows = movementRows(movements, villageId, MOVEMENT_KINDS);
        const incoming = rows.filter((r) => r.incoming);
        const outgoing = rows.length - incoming.length;
        const shown = incoming.slice(0, MAX_ROWS);

        return (
            <Card tight>
                <h2>{t('village.overview.movements')}</h2>
                {incoming.length === 0 ? (
                    <p className="m-0 text-ink-light">
                        {t('village.overview.nothingIncoming')}
                    </p>
                ) : (
                    <ul className="m-0 list-none p-0">
                        {shown.map(({ movement }) => (
                            <li
                                key={movement.id}
                                className={`flex justify-between gap-2 py-0.5 tabular-nums${
                                    // Die eine Zeile, die zum Handeln zwingt.
                                    movement.kind === 'attack'
                                        ? ' font-semibold text-seal'
                                        : ''
                                }`}
                            >
                                <span className="inline-flex items-center gap-1.5 truncate">
                                    <Icon
                                        name={KIND_ICONS[movement.kind]}
                                    />
                                    {t(
                                        `village.rally.kind.${movement.kind}`,
                                    )}{' '}
                                    {movement.origin
                                        ? `(${movement.origin.x}|${movement.origin.y})`
                                        : ''}
                                </span>
                                <Countdown
                                    until={movement.arrivalGameTime}
                                />
                            </li>
                        ))}
                        {incoming.length > shown.length && (
                            <li className="text-ink-light">
                                {t('village.overview.more', {
                                    count:
                                        incoming.length - shown.length,
                                })}
                            </li>
                        )}
                    </ul>
                )}
                {outgoing > 0 && (
                    <p className="m-0 text-ink-light">
                        {t('village.overview.outgoingCount', {
                            count: outgoing,
                        })}
                    </p>
                )}
                <p className="m-0 mt-1">
                    <Link
                        to="/worlds/$worldId/village/$villageId/$building"
                        params={{
                            worldId: String(worldId),
                            villageId: String(villageId),
                            building: RALLY_POINT,
                        }}
                        className="text-seal underline underline-offset-2"
                    >
                        {t('village.overview.toRally')}
                    </Link>
                </p>
            </Card>
        );
    },
);
