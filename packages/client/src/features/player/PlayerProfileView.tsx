import { Link } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { Table, Td, Th } from '../../components/Table.js';
import { formatNumber } from '../../lib/format.js';
import { useStores } from '../../stores/StoreContext.js';

export const PlayerProfileView = observer(function PlayerProfileView({
    worldId,
}: {
    worldId: string;
}) {
    const { t } = useTranslation();
    const { player, world } = useStores();
    const profile = player.view;
    /*
     * Das eigene Profil ist zugleich die Übersicht über alle eigenen Dörfer
     * (18-5): Jede Zeile führt ins Dorf, dazu Bauernhof und Truppen. Bei
     * Fremden bleiben diese Spalten weg, der Server liefert sie nicht.
     */
    const own = profile !== null && profile.id === world.playerId;

    if (player.profile.error)
        return (
            <Card>
                <p className="text-seal">{player.profile.error}</p>
            </Card>
        );
    if (!profile)
        return <p className="text-ink-light">{t('player.loading')}</p>;

    return (
        <div>
            <Card>
                <h2>{profile.name}</h2>
                <p className="text-ink-light">
                    {own
                        ? t('player.you')
                        : profile.isBot
                          ? t('player.bot')
                          : t('player.human')}
                    {profile.tribeTag && ` · [${profile.tribeTag}]`}
                    {profile.personality &&
                        ` · ${t(
                            `player.personality.${profile.personality}`,
                            {
                                defaultValue: profile.personality,
                            },
                        )}`}
                </p>
                <div className="flex flex-wrap gap-5 tabular-nums">
                    <span>
                        {t('player.rank', { rank: profile.rank })}
                    </span>
                    <span>
                        {t('player.points', {
                            points: formatNumber(profile.totalPoints),
                        })}
                    </span>
                    <span>
                        {t('player.villageCount', {
                            count: profile.villageCount,
                        })}
                    </span>
                </div>
                {profile.attitude && (
                    <p>
                        {/*
                          Asymmetrisch: seine Sicht auf uns, nicht unsere auf
                          ihn (plans/16-ansehen-und-handel.md).
                        */}
                        {t('player.attitudeLabel')}{' '}
                        <strong
                            className={
                                profile.standing !== null &&
                                profile.standing < 0
                                    ? 'text-seal'
                                    : 'text-moss'
                            }
                        >
                            {t(`player.attitude.${profile.attitude}`)}
                        </strong>{' '}
                        <span className="text-ink-light tabular-nums">
                            ({Math.round(profile.standing ?? 0)})
                        </span>
                    </p>
                )}
            </Card>

            <Card>
                <h2>{t('player.villages')}</h2>
                {profile.villages.length === 0 ? (
                    <p className="text-ink-light">
                        {t('player.noVillages')}
                    </p>
                ) : (
                    <Table>
                        <thead>
                            <tr>
                                <Th>{t('player.colVillage')}</Th>
                                <Th>{t('player.colCoords')}</Th>
                                <Th>{t('player.colPoints')}</Th>
                                {own && <Th>{t('player.colFarm')}</Th>}
                                {own && (
                                    <Th>{t('player.colTroops')}</Th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {profile.villages.map((village) => (
                                <tr key={village.id}>
                                    <Td>
                                        {own ? (
                                            <Link
                                                to="/worlds/$worldId/village/$villageId"
                                                params={{
                                                    worldId,
                                                    villageId: String(
                                                        village.id,
                                                    ),
                                                }}
                                                className="text-seal underline"
                                            >
                                                {village.name}
                                            </Link>
                                        ) : (
                                            village.name
                                        )}
                                    </Td>
                                    <Td>
                                        {village.x}|{village.y}
                                    </Td>
                                    <Td>
                                        {formatNumber(village.points)}
                                    </Td>
                                    {own && (
                                        <Td className="tabular-nums">
                                            {village.popUsed ?? 0}/
                                            {village.popMax ?? 0}
                                        </Td>
                                    )}
                                    {own && (
                                        <Td className="tabular-nums">
                                            {formatNumber(
                                                village.troops ?? 0,
                                            )}
                                        </Td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                )}
            </Card>

            <Link
                to="/worlds/$worldId/map"
                params={{ worldId }}
                className="text-seal underline"
            >
                {t('player.backToMap')}
            </Link>
        </div>
    );
});
