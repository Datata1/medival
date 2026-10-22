import {
    BUILDING_ORDER,
    type BuildingType,
    DEFAULT_CATAPULT_TARGET,
    type MapVillage,
    travelTime,
    UNIT_ORDER,
    type Units,
} from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { formatDuration } from '../../lib/format.js';
import { useStores } from '../../stores/StoreContext.js';

export const SendUnitsForm = observer(function SendUnitsForm({
    originVillageId,
    home,
    target,
    targetIsOwn,
}: {
    originVillageId: number;
    home: MapVillage | undefined;
    target: MapVillage;
    targetIsOwn: boolean;
}) {
    const { t } = useTranslation();
    const { map, village, world } = useStores();
    const [counts, setCounts] = useState<Record<string, string>>({});
    const [catapultTarget, setCatapultTarget] = useState<BuildingType>(
        DEFAULT_CATAPULT_TARGET,
    );

    const homeUnits: Units = village.view?.units ?? {};
    const unitSpeed = world.summary?.settings.unitSpeed ?? 1;

    const chosen: Units = {};
    for (const type of UNIT_ORDER) {
        const n = Math.floor(Number(counts[type] ?? '') || 0);
        if (n > 0) chosen[type] = n;
    }
    const anyChosen = Object.keys(chosen).length > 0;
    const travel =
        home && anyChosen
            ? travelTime(
                  home.x,
                  home.y,
                  target.x,
                  target.y,
                  chosen,
                  unitSpeed,
              )
            : null;
    const available = UNIT_ORDER.filter(
        (type) => (homeUnits[type] ?? 0) > 0,
    );

    const submit = async (kind: 'attack' | 'support') => {
        const sent = await map.sendUnits(
            originVillageId,
            target.id,
            kind,
            chosen,
            kind === 'attack' && chosen.catapult
                ? catapultTarget
                : undefined,
        );
        if (sent) {
            setCounts({});
            await village.reload();
        }
    };

    return (
        <>
            {available.length === 0 && (
                <p className="text-ink-light">{t('map.noUnitsHome')}</p>
            )}
            {available.map((type) => (
                <div
                    className="flex flex-wrap items-center gap-2 py-0.5"
                    key={type}
                >
                    <label
                        className="min-w-40"
                        htmlFor={`send-${type}`}
                    >
                        {t(`units.${type}`)}
                    </label>
                    <input
                        id={`send-${type}`}
                        className="w-22"
                        type="number"
                        min={0}
                        max={homeUnits[type] ?? 0}
                        placeholder="0"
                        value={counts[type] ?? ''}
                        onChange={(e) =>
                            setCounts((c) => ({
                                ...c,
                                [type]: e.target.value,
                            }))
                        }
                    />
                    <Button
                        variant="link"
                        onClick={() =>
                            setCounts((c) => ({
                                ...c,
                                [type]: String(homeUnits[type] ?? 0),
                            }))
                        }
                    >
                        ({homeUnits[type]})
                    </Button>
                </div>
            ))}
            {!targetIsOwn && (chosen.catapult ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-2 py-0.5">
                    <label
                        className="min-w-40"
                        htmlFor="send-catapult-target"
                    >
                        {t('map.catapultTarget')}
                    </label>
                    <select
                        id="send-catapult-target"
                        value={catapultTarget}
                        onChange={(e) => {
                            const picked = BUILDING_ORDER.find(
                                (b) => b === e.target.value,
                            );
                            if (picked) setCatapultTarget(picked);
                        }}
                    >
                        {BUILDING_ORDER.map((b) => (
                            <option key={b} value={b}>
                                {t(`buildings.${b}`)}
                            </option>
                        ))}
                    </select>
                </div>
            )}
            {travel !== null && (
                <p className="text-ink-light">
                    {t('map.travelTime', {
                        duration: formatDuration(travel),
                    })}
                </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
                {!targetIsOwn && (
                    <Button
                        disabled={!anyChosen || map.isSending}
                        onClick={() => void submit('attack')}
                    >
                        <Icon name="icon.attack" /> {t('map.attack')}
                    </Button>
                )}
                {targetIsOwn && (
                    <Button
                        disabled={!anyChosen || map.isSending}
                        onClick={() => void submit('support')}
                    >
                        <Icon name="icon.support" /> {t('map.support')}
                    </Button>
                )}
            </div>
            {map.sendError && (
                <p className="text-seal">{map.sendError}</p>
            )}
        </>
    );
});
