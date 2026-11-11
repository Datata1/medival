import { Link } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { TAB_LINK_CLASS } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { Table, Td, Th } from '../../components/Table.js';
import { formatNumber } from '../../lib/format.js';
import { useStores } from '../../stores/StoreContext.js';

export type RankingTab = 'players' | 'tribes';

/** Die eigene Zeile: Goldkante links und kräftigere Fläche. */
const OWN_ROW =
    'bg-parchment-dark! font-semibold shadow-[inset_4px_0_0_var(--color-gold-leaf)]';

/**
 * Holt die eigene Zeile beim Erscheinen ins Bild.
 *
 * Erst im nächsten Bild: Der Router setzt nach dem Seitenwechsel die
 * Bildlaufposition zurück und überschriebe ein sofortiges Scrollen.
 */
function scrollIntoView(row: HTMLTableRowElement | null): void {
    if (!row) return;
    requestAnimationFrame(() =>
        row.scrollIntoView({ block: 'center' }),
    );
}

/**
 * Rangliste: Spieler und Stämme nach Punkten
 * (plans/18-ux/18-5-rangliste-profil-einstellungen.md).
 */
export const RankingView = observer(function RankingView({
    worldId,
    tab,
    page,
}: {
    worldId: string;
    tab: RankingTab;
    page: number;
}) {
    const { t } = useTranslation();
    const { ranking, world } = useStores();
    const params = { worldId };

    return (
        <Card>
            <h2>{t('nav.ranking')}</h2>
            <nav className="mb-3 flex gap-1">
                <Link
                    to="/worlds/$worldId/ranking"
                    params={params}
                    search={{ tab: 'players', page: 1 }}
                    className={TAB_LINK_CLASS}
                    data-status={
                        tab === 'players' ? 'active' : undefined
                    }
                >
                    {t('ranking.players')}
                </Link>
                <Link
                    to="/worlds/$worldId/ranking"
                    params={params}
                    search={{ tab: 'tribes', page: 1 }}
                    className={TAB_LINK_CLASS}
                    data-status={
                        tab === 'tribes' ? 'active' : undefined
                    }
                >
                    {t('ranking.tribes')}
                </Link>
            </nav>

            {ranking.page.error && (
                <p className="text-seal">{ranking.page.error}</p>
            )}
            {!ranking.page.hasValue && !ranking.page.error && (
                <p className="text-ink-light">{t('ranking.loading')}</p>
            )}

            {ranking.page.hasValue && tab === 'players' && (
                <>
                    {ranking.own && (
                        <p className="text-ink-light tabular-nums">
                            {t('ranking.ownSummary', {
                                rank: ranking.own.rank,
                                total: ranking.totalPlayers,
                                points: formatNumber(
                                    ranking.own.points,
                                ),
                            })}
                        </p>
                    )}
                    <Table>
                        <thead>
                            <tr>
                                <Th>{t('ranking.colRank')}</Th>
                                <Th>{t('ranking.colPlayer')}</Th>
                                <Th>{t('ranking.colTribe')}</Th>
                                <Th className="text-right!">
                                    {t('ranking.colPoints')}
                                </Th>
                                <Th className="text-right!">
                                    {t('ranking.colVillages')}
                                </Th>
                            </tr>
                        </thead>
                        <tbody>
                            {ranking.players.map((player) => {
                                const own =
                                    player.id === world.playerId;
                                return (
                                    <tr
                                        key={player.id}
                                        ref={
                                            own
                                                ? scrollIntoView
                                                : undefined
                                        }
                                        className={
                                            own ? OWN_ROW : undefined
                                        }
                                        aria-current={
                                            own ? 'true' : undefined
                                        }
                                    >
                                        <Td className="tabular-nums">
                                            {player.rank}
                                        </Td>
                                        <Td>
                                            <Link
                                                to="/worlds/$worldId/players/$playerId"
                                                params={{
                                                    worldId,
                                                    playerId: String(
                                                        player.id,
                                                    ),
                                                }}
                                                className="text-seal underline"
                                            >
                                                {player.name}
                                            </Link>
                                            {player.isBot && (
                                                <span className="ml-1.5 text-ink-light text-sm">
                                                    {t('ranking.bot')}
                                                </span>
                                            )}
                                        </Td>
                                        <Td>
                                            {player.tribeTag && (
                                                <Link
                                                    to="/worlds/$worldId/diplomacy"
                                                    params={params}
                                                    className="text-seal underline"
                                                >
                                                    [{player.tribeTag}]
                                                </Link>
                                            )}
                                        </Td>
                                        <Td className="text-right! tabular-nums">
                                            {formatNumber(
                                                player.points,
                                            )}
                                        </Td>
                                        <Td className="text-right! tabular-nums">
                                            {player.villageCount}
                                        </Td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </Table>
                    {ranking.pageCount > 1 && (
                        <nav className="mt-3 flex items-center gap-3 tabular-nums">
                            {page > 1 && (
                                <Link
                                    to="/worlds/$worldId/ranking"
                                    params={params}
                                    search={{ tab, page: page - 1 }}
                                    className="text-seal underline"
                                >
                                    {t('ranking.previous')}
                                </Link>
                            )}
                            <span className="text-ink-light">
                                {t('ranking.pageOf', {
                                    page,
                                    pages: ranking.pageCount,
                                })}
                            </span>
                            {page < ranking.pageCount && (
                                <Link
                                    to="/worlds/$worldId/ranking"
                                    params={params}
                                    search={{ tab, page: page + 1 }}
                                    className="text-seal underline"
                                >
                                    {t('ranking.next')}
                                </Link>
                            )}
                        </nav>
                    )}
                </>
            )}

            {ranking.page.hasValue &&
                tab === 'tribes' &&
                (ranking.tribes.length === 0 ? (
                    <p className="text-ink-light">
                        {t('ranking.noTribes')}
                    </p>
                ) : (
                    <Table>
                        <thead>
                            <tr>
                                <Th>{t('ranking.colRank')}</Th>
                                <Th>{t('ranking.colTag')}</Th>
                                <Th>{t('ranking.colName')}</Th>
                                <Th className="text-right!">
                                    {t('ranking.colMembers')}
                                </Th>
                                <Th className="text-right!">
                                    {t('ranking.colPoints')}
                                </Th>
                                <Th className="text-right!">
                                    {t('ranking.colPerMember')}
                                </Th>
                            </tr>
                        </thead>
                        <tbody>
                            {ranking.tribes.map((tribe) => {
                                const own =
                                    ranking.own?.tribeTag === tribe.tag;
                                return (
                                    <tr
                                        key={tribe.id}
                                        ref={
                                            own
                                                ? scrollIntoView
                                                : undefined
                                        }
                                        className={
                                            own ? OWN_ROW : undefined
                                        }
                                        aria-current={
                                            own ? 'true' : undefined
                                        }
                                    >
                                        <Td className="tabular-nums">
                                            {tribe.rank}
                                        </Td>
                                        <Td>
                                            <Link
                                                to="/worlds/$worldId/diplomacy"
                                                params={params}
                                                className="text-seal underline"
                                            >
                                                [{tribe.tag}]
                                            </Link>
                                        </Td>
                                        <Td>{tribe.name}</Td>
                                        <Td className="text-right! tabular-nums">
                                            {tribe.members}
                                        </Td>
                                        <Td className="text-right! tabular-nums">
                                            {formatNumber(tribe.points)}
                                        </Td>
                                        <Td className="text-right! tabular-nums">
                                            {formatNumber(
                                                tribe.pointsPerMember,
                                            )}
                                        </Td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </Table>
                ))}
        </Card>
    );
});
