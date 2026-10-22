import type { MovementInfo, Units } from '@medival/shared';
import { entriesOf, MOVEMENT_KINDS } from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Arrival } from '../../components/Arrival.js';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';
import { Table, Td, Th } from '../../components/Table.js';
import { useStores } from '../../stores/StoreContext.js';
import { movementRows } from './derive.js';
import { KIND_ICONS } from './VillageMovementsCard.js';

function MovementRow({
    movement,
    incoming,
}: {
    movement: MovementInfo;
    incoming: boolean;
}) {
    const { t } = useTranslation();
    const other = incoming ? movement.origin : movement.target;

    // Eingehende Feindbewegungen tragen `units: null` — der Server verrät die
    // Zusammensetzung bewusst nicht (server/src/api/routes.ts).
    const describe = (units: Units | null) =>
        units
            ? entriesOf(units)
                  .map(([type, n]) => `${n} ${t(`units.${type}`)}`)
                  .join(', ')
            : t('map.unknownUnits');

    return (
        <tr
            className={
                incoming && movement.kind === 'attack'
                    ? 'font-semibold text-seal'
                    : ''
            }
        >
            <Td className="whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5">
                    <Icon name={KIND_ICONS[movement.kind]} />
                    {t(`village.rally.kind.${movement.kind}`)}
                </span>
            </Td>
            <Td className="whitespace-nowrap">
                {other
                    ? `${other.name} (${other.x}|${other.y})`
                    : '???'}
            </Td>
            <Td>{describe(movement.units)}</Td>
            <Td className="whitespace-nowrap tabular-nums">
                <Arrival at={movement.arrivalGameTime} />
            </Td>
        </tr>
    );
}

/**
 * Der Versammlungsplatz (plans/18-ux/18-2-dorfuebersicht.md).
 *
 * Kein Gebäude, sondern ein Ort: immer da, immer Stufe 1, nichts zu bauen.
 * Hier laufen **alle** Bewegungen dieses Dorfes zusammen — Angriffe,
 * Unterstützung, Rückkehr und Lieferungen, ein- und ausgehend. Die Übersicht
 * zeigt davon nur, ob etwas kommt, und verweist hierher.
 */
export const RallyView = observer(function RallyView({
    villageId,
}: {
    villageId: number;
}) {
    const { t } = useTranslation();
    const { movements } = useStores();

    const rows = movementRows(movements, villageId, MOVEMENT_KINDS);
    const incoming = rows.filter((r) => r.incoming);
    const outgoing = rows.filter((r) => !r.incoming);

    return (
        <Card>
            <h1 className="flex items-center gap-2">
                <Icon name="yard.rally" size={32} />
                {t('buildings.rally')}
            </h1>
            <p className="text-ink-light">{t('village.rally.intro')}</p>

            {rows.length === 0 && (
                <p className="text-ink-light">
                    {t('village.rally.nothing')}
                </p>
            )}

            {incoming.length > 0 && (
                <>
                    {/*
                     * Das Warnzeichen nur, wenn wirklich ein Angriff dabei
                     * ist. Eine rote Überschrift über sechs Lieferungen eines
                     * befreundeten Bots ist ein Fehlalarm, und wer den zweimal
                     * gesehen hat, schaut beim dritten Mal nicht mehr hin.
                     */}
                    {incoming.some(
                        (r) => r.movement.kind === 'attack',
                    ) ? (
                        <h2 className="mt-4 flex items-center gap-1.5 text-seal">
                            <Icon name="icon.warning" />{' '}
                            {t('village.rally.incoming')}
                        </h2>
                    ) : (
                        <h2 className="mt-4">
                            {t('village.rally.incoming')}
                        </h2>
                    )}
                    <MovementTable rows={incoming} incoming />
                </>
            )}

            {outgoing.length > 0 && (
                <>
                    <h2 className="mt-4">
                        {t('village.rally.outgoing')}
                    </h2>
                    <MovementTable rows={outgoing} incoming={false} />
                </>
            )}
        </Card>
    );
});

function MovementTable({
    rows,
    incoming,
}: {
    rows: { movement: MovementInfo }[];
    incoming: boolean;
}) {
    const { t } = useTranslation();
    return (
        <Table>
            <thead>
                <tr>
                    <Th>{t('village.rally.colKind')}</Th>
                    <Th>{t('village.rally.colWhere')}</Th>
                    <Th>{t('village.rally.colUnits')}</Th>
                    <Th>{t('village.rally.colArrival')}</Th>
                </tr>
            </thead>
            <tbody>
                {rows.map(({ movement }) => (
                    <MovementRow
                        key={movement.id}
                        movement={movement}
                        incoming={incoming}
                    />
                ))}
            </tbody>
        </Table>
    );
}
