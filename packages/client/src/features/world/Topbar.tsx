import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { formatGameTime } from '../../lib/format.js';
import { useStores } from '../../stores/StoreContext.js';
import { SoundControl } from './SoundControl.js';

export const Topbar = observer(function Topbar({
    onExit,
}: {
    onExit: () => void;
}) {
    const { t } = useTranslation();
    const { world, village } = useStores();
    const summary = world.summary;
    if (!summary) return null;

    return (
        <header className="mb-4 flex items-center gap-3">
            <Button onClick={onExit}>{t('world.backToLobby')}</Button>
            <h1 className="my-0 text-xl">{summary.name}</h1>
            <span className="text-ink-light">
                {formatGameTime(world.gameTime)}
            </span>
            <Button onClick={() => void world.togglePause()}>
                <span className="inline-flex items-center gap-1.5">
                    <Icon
                        name={
                            world.isRunning ? 'icon.pause' : 'icon.play'
                        }
                    />
                    {world.isRunning
                        ? t('world.pause')
                        : t('world.resume')}
                </span>
            </Button>
            <span className="flex-1" />
            <SoundControl />
            {world.playerVillages.length > 1 && (
                <select
                    value={village.villageId ?? undefined}
                    onChange={(e) =>
                        void village.select(
                            summary.id,
                            Number(e.target.value),
                        )
                    }
                >
                    {world.playerVillages.map((v) => (
                        <option key={v.id} value={v.id}>
                            {v.name} ({v.x}|{v.y})
                        </option>
                    ))}
                </select>
            )}
            {world.actionError && (
                <span className="text-seal">{world.actionError}</span>
            )}
        </header>
    );
});
