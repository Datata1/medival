import {
    type MapVillage,
    merchantTravelTime,
    RESOURCE_KEYS,
    type Resources,
} from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { formatDuration } from '../../lib/format.js';
import { useStores } from '../../stores/StoreContext.js';

/** Symbol je Rohstoff — dieselben wie in der Ressourcenleiste. */
const RESOURCE_ICONS = {
    wood: 'icon.wood',
    clay: 'icon.clay',
    iron: 'icon.iron',
} as const;

/**
 * Rohstoffe an ein fremdes Dorf liefern (siehe plans/16-ansehen-und-handel.md).
 *
 * Liefern hebt das Ansehen des Empfängers — je näher, desto stärker. Ein
 * ferner Spieler bleibt trotz Dauerlieferung nahe neutral.
 */
export const SendResourcesForm = observer(function SendResourcesForm({
    originVillageId,
    home,
    target,
}: {
    originVillageId: number;
    home: MapVillage | undefined;
    target: MapVillage;
}) {
    const { t } = useTranslation();
    const { map, village, world } = useStores();
    const [amounts, setAmounts] = useState<Record<string, string>>({});

    const view = village.view;
    const free = view?.merchantsFree ?? 0;
    const capacity = view?.merchantCapacity ?? 0;
    const unitSpeed = world.summary?.settings.unitSpeed ?? 1;

    const chosen: Resources = { wood: 0, clay: 0, iron: 0 };
    for (const key of RESOURCE_KEYS) {
        const n = Math.floor(Number(amounts[key] ?? '') || 0);
        if (n > 0) chosen[key] = n;
    }
    const total = chosen.wood + chosen.clay + chosen.iron;
    const overCapacity = total > free;
    const travel =
        home && total > 0
            ? merchantTravelTime(
                  home.x,
                  home.y,
                  target.x,
                  target.y,
                  unitSpeed,
              )
            : null;

    const submit = async () => {
        const sent = await map.sendResources(
            originVillageId,
            target.id,
            chosen,
        );
        if (sent) {
            setAmounts({});
            await village.reload();
        }
    };

    if (capacity <= 0) {
        return (
            <p className="text-ink-light">{t('map.marketMissing')}</p>
        );
    }

    return (
        <>
            <p className="text-ink-light">
                {t('map.merchants', { free, capacity })}
            </p>
            {RESOURCE_KEYS.map((key) => (
                <div
                    className="flex flex-wrap items-center gap-2 py-0.5"
                    key={key}
                >
                    <label
                        className="inline-flex min-w-40 items-center gap-1.5"
                        htmlFor={`ship-${key}`}
                    >
                        <Icon name={RESOURCE_ICONS[key]} />
                        {t(`village.${key}`)}
                    </label>
                    <input
                        id={`ship-${key}`}
                        className="w-22"
                        type="number"
                        min={0}
                        placeholder="0"
                        value={amounts[key] ?? ''}
                        onChange={(e) =>
                            setAmounts((a) => ({
                                ...a,
                                [key]: e.target.value,
                            }))
                        }
                    />
                    <Button
                        variant="link"
                        onClick={() =>
                            setAmounts((a) => ({
                                ...a,
                                [key]: String(
                                    Math.floor(
                                        Math.min(
                                            view?.resources[key] ?? 0,
                                            free,
                                        ),
                                    ),
                                ),
                            }))
                        }
                    >
                        ({Math.floor(view?.resources[key] ?? 0)})
                    </Button>
                </div>
            ))}
            {travel !== null && (
                <p className="text-ink-light">
                    {t('map.travelTime', {
                        duration: formatDuration(travel),
                    })}
                </p>
            )}
            {overCapacity && (
                <p className="text-seal">
                    {t('map.tooManyGoods', { free })}
                </p>
            )}
            <Button
                disabled={total <= 0 || overCapacity || map.isSending}
                onClick={() => void submit()}
            >
                <Icon name="icon.trade" /> {t('map.ship')}
            </Button>
        </>
    );
});
