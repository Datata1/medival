import type { WorldListEntry } from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { formatGameTime } from '../../lib/format.js';

export function WorldListItem({
    world,
    onOpen,
    onDelete,
}: {
    world: WorldListEntry;
    onOpen: () => void;
    /** Fehlt für Nicht-Admins: dann kein Löschknopf (19-8). */
    onDelete?: () => void;
}) {
    const { t } = useTranslation();
    const status =
        world.status === 'running'
            ? t('lobby.statusRunning')
            : world.status === 'paused'
              ? t('lobby.statusPaused')
              : t('lobby.statusEnded');
    return (
        <li className="flex items-center justify-between gap-4 border-oak border-b py-2.5 last:border-b-0">
            <div>
                <strong>{world.name}</strong>
                <span className="text-ink-light">
                    {' '}
                    {t('lobby.meta', {
                        speed: world.settings.speed,
                        time: formatGameTime(world.gameTimeMs),
                        status,
                    })}
                </span>
            </div>
            <div className="flex items-center gap-2">
                {/* Wer noch nicht mitspielt, tritt bei (19-9). */}
                <Button onClick={onOpen}>
                    {world.joined ? t('lobby.open') : t('lobby.join')}
                </Button>
                {onDelete && (
                    <Button variant="danger" onClick={onDelete}>
                        {t('lobby.delete')}
                    </Button>
                )}
            </div>
        </li>
    );
}
