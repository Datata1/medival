import type { Attitude } from '@medival/shared';
import { Link } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { Table } from '../../components/Table.js';
import { formatNumber } from '../../lib/format.js';
import { useStores } from '../../stores/StoreContext.js';

/** Feindlich rot, verbündet moosgrün, alles dazwischen in Tinte. */
const ATTITUDE_CLASS: Record<Attitude, string> = {
    hostile: 'text-seal',
    wary: 'text-seal',
    neutral: 'text-ink-light',
    friendly: 'text-moss',
    allied: 'text-moss',
};

/**
 * Stämme, Haltungen und Einladungen (siehe plans/17-staemme-und-krieg.md).
 */
export const DiplomacyView = observer(function DiplomacyView({
    worldId,
}: {
    worldId: string;
}) {
    const { t } = useTranslation();
    const { tribe } = useStores();
    const [name, setName] = useState('');
    const [tag, setTag] = useState('');

    if (tribe.diplomacy.error)
        return (
            <Card>
                <p className="text-seal">{tribe.diplomacy.error}</p>
            </Card>
        );
    const view = tribe.view;
    if (!view)
        return <p className="text-ink-light">{t('tribe.loading')}</p>;

    return (
        <div>
            <Card>
                <h2>{t('tribe.ownTribe')}</h2>
                {view.tribe ? (
                    <>
                        <p>
                            <strong>
                                [{view.tribe.tag}] {view.tribe.name}
                            </strong>
                        </p>
                        <Table>
                            <thead>
                                <tr>
                                    <th>{t('tribe.member')}</th>
                                    <th>{t('tribe.points')}</th>
                                    <th>{t('tribe.villages')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {view.tribe.members.map((m) => (
                                    <tr key={m.id}>
                                        <td>{m.name}</td>
                                        <td className="tabular-nums">
                                            {formatNumber(m.points)}
                                        </td>
                                        <td className="tabular-nums">
                                            {m.villageCount}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        <Button
                            onClick={() => void tribe.leave()}
                            disabled={tribe.isSubmitting}
                        >
                            {t('tribe.leave')}
                        </Button>
                    </>
                ) : (
                    <>
                        <p className="text-ink-light">
                            {t('tribe.noTribe')}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                placeholder={t('tribe.name')}
                                value={name}
                                onChange={(e) =>
                                    setName(e.target.value)
                                }
                            />
                            <input
                                className="w-20"
                                placeholder={t('tribe.tag')}
                                maxLength={5}
                                value={tag}
                                onChange={(e) => setTag(e.target.value)}
                            />
                            <Button
                                disabled={
                                    !name.trim() ||
                                    !tag.trim() ||
                                    tribe.isSubmitting
                                }
                                onClick={() =>
                                    void tribe.foundTribe(name, tag)
                                }
                            >
                                {t('tribe.found')}
                            </Button>
                        </div>
                    </>
                )}
                {tribe.submitError && (
                    <p className="text-seal">{tribe.submitError}</p>
                )}
            </Card>

            {view.invitations.length > 0 && (
                <Card>
                    <h2>{t('tribe.invitations')}</h2>
                    <ul className="list-none p-0">
                        {view.invitations.map((inv) => (
                            <li
                                key={inv.tribeId}
                                className="flex items-center gap-3 py-1"
                            >
                                <span>
                                    [{inv.tribeTag}] {inv.tribeName}
                                </span>
                                <Button
                                    disabled={tribe.isSubmitting}
                                    onClick={() =>
                                        void tribe.accept(inv.tribeId)
                                    }
                                >
                                    {t('tribe.accept')}
                                </Button>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            <Card>
                <h2>{t('tribe.players')}</h2>
                <Table>
                    <thead>
                        <tr>
                            <th>{t('tribe.player')}</th>
                            <th>{t('tribe.tribeColumn')}</th>
                            <th>{t('tribe.attitudeColumn')}</th>
                            <th>{t('tribe.distance')}</th>
                            <th>{t('tribe.points')}</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {view.players.map((p) => (
                            <tr key={p.id}>
                                <td>
                                    <Link
                                        to="/worlds/$worldId/players/$playerId"
                                        params={{
                                            worldId,
                                            playerId: String(p.id),
                                        }}
                                        className="text-seal underline"
                                    >
                                        {p.name}
                                    </Link>
                                </td>
                                <td>
                                    {p.tribeTag
                                        ? `[${p.tribeTag}]`
                                        : '—'}
                                </td>
                                <td
                                    className={
                                        ATTITUDE_CLASS[p.attitude]
                                    }
                                >
                                    {t(`player.attitude.${p.attitude}`)}{' '}
                                    <span className="text-ink-light tabular-nums">
                                        ({Math.round(p.standing)})
                                    </span>
                                </td>
                                <td className="tabular-nums">
                                    {p.distance}
                                </td>
                                <td className="tabular-nums">
                                    {formatNumber(p.points)}
                                </td>
                                <td>
                                    {view.tribe &&
                                        !p.tribeTag &&
                                        view.tribe.founderId === 1 && (
                                            <Button
                                                variant="link"
                                                disabled={
                                                    tribe.isSubmitting
                                                }
                                                onClick={() =>
                                                    void tribe.invite(
                                                        p.id,
                                                    )
                                                }
                                            >
                                                {t('tribe.invite')}
                                            </Button>
                                        )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </Card>
        </div>
    );
});
