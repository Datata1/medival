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
    onDelete: () => void;
}) {
    const { t } = useTranslation();
    const status =
        world.status === 'running'
            ? t('lobby.statusRunning')
            : world.status === 'paused'
              ? t('lobby.statusPaused')
              : world.status;
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
                <Button onClick={onOpen}>{t('lobby.open')}</Button>
                <Button variant="danger" onClick={onDelete}>
                    {t('lobby.delete')}
                </Button>
            </div>
        </li>
    );
}
