import type { MapVillage } from '@medival/shared';
import { Link } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { SendUnitsForm } from './SendUnitsForm.js';

const PLAYER_ID = 1;

export const TargetPanel = observer(function TargetPanel({
    target,
    home,
    activeVillageId,
    worldId,
}: {
    target: MapVillage;
    home: MapVillage | undefined;
    activeVillageId: number;
    worldId: number;
}) {
    const { t } = useTranslation();
    const isOwn = target.playerId === PLAYER_ID;
    const isSelf = target.id === activeVillageId;

    const kind =
        target.playerId === null
            ? t('map.barbarianVillage')
            : isOwn
              ? t('map.ownVillage')
              : t('map.enemyVillage');

    return (
        <Card>
            <h2>
                {target.name} ({target.x}|{target.y})
            </h2>
            <p className="text-ink-light">
                {kind} · {t('map.points', { points: target.points })}
            </p>
            {target.playerId !== null && !isOwn && (
                <p>
                    <Link
                        to="/worlds/$worldId/players/$playerId"
                        params={{
                            worldId: String(worldId),
                            playerId: String(target.playerId),
                        }}
                        className="text-seal underline"
                    >
                        {t('player.profileLink')}
                    </Link>
                </p>
            )}
            {isSelf ? (
                <p className="text-ink-light">
                    {t('map.isActiveVillage')}
                </p>
            ) : (
                <SendUnitsForm
                    originVillageId={activeVillageId}
                    home={home}
                    target={target}
                    targetIsOwn={isOwn}
                />
            )}
        </Card>
    );
});
