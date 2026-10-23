import { keysOf } from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { useStores } from '../../stores/StoreContext.js';

const SPEED_PRESETS = {
    relaxed: {
        labelKey: 'lobby.presetRelaxed',
        speed: 100,
        unitSpeed: 20,
    },
    fast: { labelKey: 'lobby.presetFast', speed: 200, unitSpeed: 30 },
    blitz: { labelKey: 'lobby.presetBlitz', speed: 500, unitSpeed: 50 },
} as const;

/**
 * Wie lebhaft Barbarendörfer wachsen (plans/14-barbarendoerfer.md). Angegeben
 * als mittlere Handlungsversuche je Spielstunde; 0 hält sie statisch.
 */
const BARBARIAN_PRESETS = {
    still: { labelKey: 'lobby.barbariansStill', rate: 0 },
    calm: { labelKey: 'lobby.barbariansCalm', rate: 1 },
    lively: { labelKey: 'lobby.barbariansLively', rate: 3 },
} as const;

type PresetKey = keyof typeof SPEED_PRESETS;
type BarbarianKey = keyof typeof BARBARIAN_PRESETS;
const PRESET_KEYS = keysOf(SPEED_PRESETS);
const BARBARIAN_KEYS = keysOf(BARBARIAN_PRESETS);

/** Der Wert eines <select> ist ein String — hier wird er geprüft, nicht behauptet. */
function parsePresetKey(value: string): PresetKey {
    return PRESET_KEYS.find((key) => key === value) ?? 'fast';
}

function parseBarbarianKey(value: string): BarbarianKey {
    return BARBARIAN_KEYS.find((key) => key === value) ?? 'calm';
}

export const CreateWorldForm = observer(function CreateWorldForm({
    onCreated,
}: {
    onCreated: (id: number) => void;
}) {
    const { t } = useTranslation();
    const { lobby } = useStores();
    const [name, setName] = useState('');
    const [preset, setPreset] = useState<PresetKey>('fast');
    const [barbarians, setBarbarians] = useState<BarbarianKey>('calm');
    const [archers, setArchers] = useState(true);

    const submit = async () => {
        const chosen = SPEED_PRESETS[preset];
        const id = await lobby.createWorld(
            name || t('lobby.newWorld'),
            {
                speed: chosen.speed,
                unitSpeed: chosen.unitSpeed,
                barbarianAttemptsPerHour:
                    BARBARIAN_PRESETS[barbarians].rate,
                archers,
            },
        );
        if (id !== null) onCreated(id);
    };

    return (
        <Card>
            <h2>{t('lobby.newWorld')}</h2>
            <div className="flex flex-wrap items-center gap-2">
                <input
                    placeholder={t('lobby.worldName')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <select
                    value={preset}
                    onChange={(e) =>
                        setPreset(parsePresetKey(e.target.value))
                    }
                >
                    {PRESET_KEYS.map((key) => (
                        <option key={key} value={key}>
                            {t(SPEED_PRESETS[key].labelKey)}
                        </option>
                    ))}
                </select>
                <select
                    value={barbarians}
                    onChange={(e) =>
                        setBarbarians(parseBarbarianKey(e.target.value))
                    }
                    title={t('lobby.barbarians')}
                    aria-label={t('lobby.barbarians')}
                >
                    {BARBARIAN_KEYS.map((key) => (
                        <option key={key} value={key}>
                            {t(BARBARIAN_PRESETS[key].labelKey)}
                        </option>
                    ))}
                </select>
                <label className="flex items-center gap-1">
                    <input
                        type="checkbox"
                        checked={archers}
                        onChange={(e) => setArchers(e.target.checked)}
                    />
                    {t('lobby.archers')}
                </label>
                <Button
                    onClick={() => void submit()}
                    disabled={lobby.isSubmitting}
                >
                    {t('lobby.create')}
                </Button>
            </div>
            {lobby.submitError && (
                <p className="text-seal">{lobby.submitError}</p>
            )}
        </Card>
    );
});
