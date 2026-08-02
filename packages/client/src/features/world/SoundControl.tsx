import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon.js';
import { useStores } from '../../stores/StoreContext.js';

/**
 * Lautsprecher zum Stummschalten plus Schieberegler (siehe plans/13-sounds.md).
 *
 * Beides sind Zustandsänderungen im `SoundStore`, keine Komponentendetails —
 * die Komponente zeigt nur an und meldet Klicks weiter (Plan 09).
 */
export const SoundControl = observer(function SoundControl() {
    const { t } = useTranslation();
    const { sound } = useStores();
    const label = sound.muted ? t('sound.unmute') : t('sound.mute');

    return (
        <span className="flex items-center gap-2">
            <button
                type="button"
                onClick={() => sound.toggleMuted()}
                title={label}
                aria-label={label}
                aria-pressed={sound.muted}
                className="cursor-pointer border-none bg-transparent p-1 leading-none"
            >
                <Icon
                    name={
                        sound.muted ? 'icon.sound.off' : 'icon.sound.on'
                    }
                    size={20}
                />
            </button>
            <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(sound.volume * 100)}
                onChange={(e) =>
                    sound.setVolume(Number(e.target.value) / 100)
                }
                title={t('sound.volume')}
                aria-label={t('sound.volume')}
                className="w-20"
            />
        </span>
    );
});
