import { SPRITES, type SpriteId } from '../assets/registry.js';

/**
 * Ein Sprite als Bild. Bleibt pure (Plan 05) und trägt `aria-hidden`, weil
 * daneben immer der übersetzte Text steht — ein Icon soll nichts doppelt
 * vorlesen lassen (siehe plans/12-assets-und-sprites.md).
 */
export function Icon({
    name,
    size = 16,
    className,
}: {
    name: SpriteId;
    size?: number;
    className?: string;
}) {
    return (
        <img
            src={SPRITES[name]}
            alt=""
            aria-hidden="true"
            width={size}
            height={size}
            // Pixel-Art muss scharf bleiben, auch wenn sie skaliert wird.
            className={`pixelated inline-block shrink-0 align-text-bottom${
                className ? ` ${className}` : ''
            }`}
        />
    );
}
