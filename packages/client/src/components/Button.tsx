import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'danger' | 'tab' | 'link';

/** Gemeinsam: Kapitalis, gedrückter Zustand, deutlicher Fokus. */
const BASE =
    'rounded-xs border-2 px-3.5 py-1 font-display font-semibold text-sm tracking-wide transition-[background-color,box-shadow] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<Variant, string> = {
    // Siegel: die Hauptaktion trägt das Rot des Wachssiegels.
    primary: `${BASE} border-seal bg-seal text-parchment hover:brightness-110`,
    danger: `${BASE} border-timber bg-timber text-parchment hover:brightness-125`,
    // Registerlasche: unten offen, damit sie am Inhalt „klebt".
    tab: `${BASE} border-oak border-b-parchment bg-parchment-dark text-ink hover:bg-parchment`,
    link: 'font-body text-seal text-sm underline underline-offset-2 hover:text-ink',
};

const TAB_ACTIVE = `${BASE} border-oak border-b-parchment bg-parchment text-ink shadow-[inset_0_2px_0_var(--color-gold-leaf)]`;

export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    /** Nur für variant="tab" von Bedeutung. */
    active?: boolean;
}

export function Button({
    variant = 'primary',
    active = false,
    className,
    ...props
}: ButtonProps) {
    const base =
        variant === 'tab' && active ? TAB_ACTIVE : VARIANTS[variant];
    return (
        <button
            type="button"
            className={`${base}${className ? ` ${className}` : ''}`}
            {...props}
        />
    );
}
