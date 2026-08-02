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
    const { player } = useStores();
    const profile = player.view;

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
                    {profile.isBot
                        ? t('player.bot')
                        : t('player.human')}
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
                            </tr>
                        </thead>
                        <tbody>
                            {profile.villages.map((village) => (
                                <tr key={village.id}>
                                    <Td>{village.name}</Td>
                                    <Td>
                                        {village.x}|{village.y}
                                    </Td>
                                    <Td>
                                        {formatNumber(village.points)}
                                    </Td>
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
