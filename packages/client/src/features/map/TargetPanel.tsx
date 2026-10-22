import { type MapVillage, PLAYER_ID } from '@medival/shared';
import { Link } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { SendResourcesForm } from './SendResourcesForm.js';
import { SendUnitsForm } from './SendUnitsForm.js';

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
            {/*
             * Der dritte Bedienweg zum Dorfwechsel neben Dorfleiste und
             * Übersicht (plans/18-ux/18-1-rahmen-und-kopfzeile.md): Wer sein
             * zweites Dorf auf der Karte sieht, will es von dort aus öffnen
             * können. Ein `<Link>` und kein `village.select()`, damit die
             * Adresszeile mitwandert.
             */}
            {isOwn && !isSelf && (
                <p>
                    <Link
                        to="/worlds/$worldId/village/$villageId"
                        params={{
                            worldId: String(worldId),
                            villageId: String(target.id),
                        }}
                        className="text-seal underline"
                    >
                        {t('map.switchToVillage')}
                    </Link>
                </p>
            )}
            {isSelf ? (
                <p className="text-ink-light">
                    {t('map.isActiveVillage')}
                </p>
            ) : (
                <>
                    <SendUnitsForm
                        originVillageId={activeVillageId}
                        home={home}
                        target={target}
                        targetIsOwn={isOwn}
                    />
                    {target.playerId !== null && (
                        <>
                            <h3>{t('map.shipTitle')}</h3>
                            <SendResourcesForm
                                originVillageId={activeVillageId}
                                home={home}
                                target={target}
                            />
                        </>
                    )}
                </>
            )}
        </Card>
    );
});
