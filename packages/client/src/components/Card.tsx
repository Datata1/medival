import type { HTMLAttributes } from 'react';

const FRAME =
    'relative rounded-xs border-2 border-oak bg-parchment shadow-[inset_0_0_0_1px_var(--color-parchment-dark),0_1px_2px_rgb(59_43_26/0.15)]';

/**
 * Pergamentblatt mit geprägtem Rahmen: doppelte Linie in Eiche, abgesetzte
 * Ecken statt runder Box (siehe plans/11-mittelalterliches-design.md).
 *
 * `tight` ist die enge Fassung für die Dorfübersicht (Plan 18-2): dort stehen
 * vier Karten in einer schmalen Spalte, und die Seite muss ohne Bildlaufleiste
 * auskommen. Es ist ein **Schalter statt einer Klasse von außen**, weil zwei
 * Polsterklassen am selben Element gleich stark sind — dann entschiede die
 * Reihenfolge im erzeugten Stylesheet, nicht die Absicht des Aufrufers.
 */
export function Card({
    tight = false,
    className,
    ...props
}: HTMLAttributes<HTMLElement> & { tight?: boolean }) {
    const spacing = tight ? 'mb-2.5 p-2.5 [&>h2]:mb-1' : 'mb-4 p-4';
    return (
        <section
            className={`${FRAME} ${spacing}${
                className ? ` ${className}` : ''
            }`}
            {...props}
        />
    );
}
