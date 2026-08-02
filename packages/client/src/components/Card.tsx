import type { HTMLAttributes } from 'react';

/**
 * Pergamentblatt mit geprägtem Rahmen: doppelte Linie in Eiche, abgesetzte
 * Ecken statt runder Box (siehe plans/11-mittelalterliches-design.md).
 */
export function Card({
    className,
    ...props
}: HTMLAttributes<HTMLElement>) {
    return (
        <section
            className={`relative mb-4 rounded-xs border-2 border-oak bg-parchment p-4 shadow-[inset_0_0_0_1px_var(--color-parchment-dark),0_1px_2px_rgb(59_43_26/0.15)]${
                className ? ` ${className}` : ''
            }`}
            {...props}
        />
    );
}
