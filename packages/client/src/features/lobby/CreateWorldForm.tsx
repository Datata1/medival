import { keysOf, WORLD_LIMITS } from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { useStores } from '../../stores/StoreContext.js';
import {
    type AdvancedWorldForm,
    advancedSettings,
    defaultAdvancedForm,
    NUMERIC_FIELDS,
} from './worldForm.js';

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
    const [advanced, setAdvanced] = useState<AdvancedWorldForm>(
        defaultAdvancedForm,
    );

    const submit = async () => {
        const chosen = SPEED_PRESETS[preset];
        const id = await lobby.createWorld(
            name || t('lobby.newWorld'),
            {
                speed: chosen.speed,
                unitSpeed: chosen.unitSpeed,
                barbarianAttemptsPerHour:
                    BARBARIAN_PRESETS[barbarians].rate,
                ...advancedSettings(advanced),
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
                <Button
                    onClick={() => void submit()}
                    disabled={lobby.isSubmitting}
                >
                    {t('lobby.create')}
                </Button>
            </div>
            <details className="mt-2">
                <summary className="cursor-pointer">
                    {t('lobby.advanced')}
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {NUMERIC_FIELDS.map((field) => (
                        <label
                            key={field}
                            className="flex flex-col gap-0.5"
                        >
                            <span className="text-ink-light text-sm">
                                {t(`lobby.field.${field}`, {
                                    min: WORLD_LIMITS[field].min,
                                    max: WORLD_LIMITS[field].max,
                                })}
                            </span>
                            <input
                                type="number"
                                min={WORLD_LIMITS[field].min}
                                max={WORLD_LIMITS[field].max}
                                step={
                                    field === 'settlementDensity'
                                        ? 0.01
                                        : 1
                                }
                                value={advanced[field]}
                                onChange={(e) =>
                                    setAdvanced((a) => ({
                                        ...a,
                                        [field]: e.target.value,
                                    }))
                                }
                            />
                        </label>
                    ))}
                    {(['archers', 'paladin'] as const).map((option) => (
                        <label
                            key={option}
                            className="flex items-center gap-1"
                        >
                            <input
                                type="checkbox"
                                checked={advanced[option]}
                                onChange={(e) =>
                                    setAdvanced((a) => ({
                                        ...a,
                                        [option]: e.target.checked,
                                    }))
                                }
                            />
                            {t(`lobby.${option}`)}
                        </label>
                    ))}
                </div>
            </details>
            {lobby.submitError && (
                <p className="text-seal">{lobby.submitError}</p>
            )}
        </Card>
    );
});
