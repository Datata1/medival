import { useEffect, useState } from 'react';
import { SPRITES, type SpriteId } from '../../assets/registry.js';

export type LoadedSprites = Partial<Record<SpriteId, HTMLImageElement>>;

/**
 * Lädt die Kartensprites einmalig (siehe plans/12-assets-und-sprites.md).
 *
 * Bilder sind ein externes System — sie über einen Effect zu laden ist genau
 * der vorgesehene Anwendungsfall (Plan 06). Ein Sprite, das nicht lädt, fehlt
 * einfach in der Rückgabe; die Karte zeichnet dann ihre Farbfläche, statt leer
 * zu bleiben.
 *
 * `ids` muss eine stabile Referenz sein (Modul-Konstante), sonst lädt der
 * Effect bei jedem Rendern neu.
 */
export function useSpriteAtlas(
    ids: readonly SpriteId[],
): LoadedSprites {
    const [loaded, setLoaded] = useState<LoadedSprites>({});

    useEffect(() => {
        let cancelled = false;
        const result: LoadedSprites = {};
        let remaining = ids.length;
        if (remaining === 0) return;

        const done = () => {
            if (--remaining === 0 && !cancelled) setLoaded(result);
        };

        for (const id of ids) {
            const image = new Image();
            image.onload = () => {
                result[id] = image;
                done();
            };
            image.onerror = () => {
                console.warn(
                    `Sprite ${id} konnte nicht geladen werden — Karte nutzt Farbfläche`,
                );
                done();
            };
            image.src = SPRITES[id];
        }

        return () => {
            cancelled = true;
        };
    }, [ids]);

    return loaded;
}
