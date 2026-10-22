import { type MapVillage, PLAYER_ID } from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStores } from '../../stores/StoreContext.js';

/**
 * Wählt ein Zieldorf über seine Koordinaten.
 *
 * Auf der Karte gibt es dafür den Klick; auf einer Gebäudeseite gibt es keine
 * Karte, also die Zahlen. Was zuletzt auf der Karte angeklickt wurde, steht
 * beim Öffnen schon da — der übliche Weg ist „Ziel auf der Karte suchen, dann
 * hier verschicken", und ihn zweimal einzugeben wäre Arbeit ohne Gewinn.
 *
 * Das Ziel wird gegen die geladene Kartenliste aufgelöst, damit Name und Dorf-ID
 * feststehen, bevor irgendetwas abgeschickt wird.
 */
export const TargetPicker = observer(function TargetPicker({
    children,
}: {
    children: (
        target: MapVillage,
        home: MapVillage | undefined,
    ) => ReactNode;
}) {
    const { t } = useTranslation();
    const { map, village, world } = useStores();

    const [coords, setCoords] = useState(() => {
        const selected = map.selected;
        return selected && selected.id !== village.villageId
            ? { x: String(selected.x), y: String(selected.y) }
            : { x: '', y: '' };
    });

    /*
     * Seit 19-7 kennt der Store nur die Kacheln, die schon gezeigt wurden.
     * Wer Koordinaten eintippt, lädt die Kachel des Feldes nach — im
     * Ereignis, nicht beim Rendern.
     */
    const changeCoords = (next: { x: string; y: string }) => {
        setCoords(next);
        const nx = Number(next.x);
        const ny = Number(next.y);
        if (
            next.x.trim() !== '' &&
            next.y.trim() !== '' &&
            Number.isInteger(nx) &&
            Number.isInteger(ny)
        )
            void map.ensurePoint(nx, ny);
    };

    const x = Number(coords.x);
    const y = Number(coords.y);
    const complete =
        coords.x.trim() !== '' &&
        coords.y.trim() !== '' &&
        Number.isFinite(x) &&
        Number.isFinite(y);
    // Nur geladene Kacheln sind bekannt; eine fehlende lädt `setCoords`.
    const target = complete ? map.villageAt(x, y) : null;
    // Ohne geladene Kachel aus der Weltzusammenfassung (19-7).
    const own = world.playerVillages.find(
        (v) => v.id === village.villageId,
    );
    const home: MapVillage | undefined =
        village.villageId === null
            ? undefined
            : (map.villageById(village.villageId) ??
              (own ? { ...own, playerId: PLAYER_ID } : undefined));
    const isHome = target !== null && target.id === village.villageId;

    return (
        <>
            <div className="flex flex-wrap items-center gap-2 py-0.5">
                <span className="min-w-40">
                    {t('village.building.target')}
                </span>
                <input
                    className="w-22"
                    type="number"
                    aria-label="X"
                    placeholder="X"
                    value={coords.x}
                    onChange={(e) =>
                        changeCoords({ ...coords, x: e.target.value })
                    }
                />
                <input
                    className="w-22"
                    type="number"
                    aria-label="Y"
                    placeholder="Y"
                    value={coords.y}
                    onChange={(e) =>
                        changeCoords({ ...coords, y: e.target.value })
                    }
                />
                {target && !isHome && (
                    <strong>
                        {target.name} ({target.x}|{target.y})
                    </strong>
                )}
            </div>
            {!complete && (
                <p className="text-ink-light">
                    {t('village.building.targetHint')}
                </p>
            )}
            {complete && target === null && (
                <p className="text-seal">
                    {t('village.building.targetMissing', { x, y })}
                </p>
            )}
            {isHome && (
                <p className="text-ink-light">
                    {t('village.building.targetIsHome')}
                </p>
            )}
            {target && !isHome && children(target, home)}
        </>
    );
});
