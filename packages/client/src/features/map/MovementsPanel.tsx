import {
    entriesOf,
    type MovementInfo,
    type Units,
} from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import type { SpriteId } from '../../assets/registry.js';
import { Card } from '../../components/Card.js';
import { Countdown } from '../../components/Countdown.js';
import { Icon } from '../../components/Icon.js';
import { useStores } from '../../stores/StoreContext.js';

/** Jede Bewegungsart hat ihr eigenes Zeichen. */
const KIND_ICONS = {
    attack: 'icon.attack',
    support: 'icon.support',
    return: 'icon.return',
} as const satisfies Record<MovementInfo['kind'], SpriteId>;

function MovementRow({
    movement,
    description,
}: {
    movement: MovementInfo;
    description: string;
}) {
    return (
        <li
            title={description}
            className="flex justify-between py-1 tabular-nums"
        >
            <span className="inline-flex items-center gap-1.5">
                <Icon name={KIND_ICONS[movement.kind]} />{' '}
                {movement.origin?.name} → {movement.target?.name}
            </span>
            <Countdown until={movement.arrivalGameTime} />
        </li>
    );
}

export const MovementsPanel = observer(function MovementsPanel() {
    const { t } = useTranslation();
    const { movements } = useStores();
    if (movements.isEmpty) return null;

    const describeUnits = (units: Units | null) =>
        units
            ? entriesOf(units)
                  .map(([type, n]) => `${n} ${t(`units.${type}`)}`)
                  .join(', ')
            : t('map.unknownUnits');

    return (
        <Card>
            <h2>{t('map.movements')}</h2>
            {movements.incoming.length > 0 && (
                <>
                    <h3 className="flex items-center gap-1.5 text-seal">
                        <Icon name="icon.warning" /> {t('map.incoming')}
                    </h3>
                    <ul className="m-0 list-none p-0">
                        {movements.incoming.map((m) => (
                            <MovementRow
                                key={m.id}
                                movement={m}
                                description={describeUnits(m.units)}
                            />
                        ))}
                    </ul>
                </>
            )}
            {movements.outgoing.length > 0 && (
                <>
                    <h3>{t('map.outgoing')}</h3>
                    <ul className="m-0 list-none p-0">
                        {movements.outgoing.map((m) => (
                            <MovementRow
                                key={m.id}
                                movement={m}
                                description={describeUnits(m.units)}
                            />
                        ))}
                    </ul>
                </>
            )}
        </Card>
    );
});
