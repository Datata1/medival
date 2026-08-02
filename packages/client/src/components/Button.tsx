import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'danger' | 'tab' | 'nav' | 'link';

/** Gemeinsam: Kapitalis, gedrückter Zustand, deutlicher Fokus. */
const BASE =
    'rounded-xs border-2 px-3.5 py-1 font-display font-semibold text-sm tracking-wide transition-[background-color,box-shadow] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50';

/** Wie BASE, aber rund und enger — die Kopfzeile trägt acht davon nebeneinander. */
const NAV_BASE =
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-3 py-1 font-display font-semibold text-sm tracking-wide transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40';

const VARIANTS: Record<Variant, string> = {
    // Siegel: die Hauptaktion trägt das Rot des Wachssiegels.
    primary: `${BASE} border-seal bg-seal text-parchment hover:brightness-110`,
    danger: `${BASE} border-timber bg-timber text-parchment hover:brightness-125`,
    // Registerlasche: unten offen, damit sie am Inhalt „klebt".
    tab: `${BASE} border-oak border-b-parchment bg-parchment-dark text-ink hover:bg-parchment`,
    // Kopfzeile: helle Schrift auf dunklem Holz, umlaufender Beschlagrand.
    // Der Rand ist hell, nicht in Eiche — Eiche auf Holz erreicht nur 2.75:1.
    nav: `${NAV_BASE} border-parchment-dark bg-timber text-parchment hover:bg-oak`,
    link: 'font-body text-seal text-sm underline underline-offset-2 hover:text-ink',
};

const TAB_ACTIVE = `${BASE} border-oak border-b-parchment bg-parchment text-ink shadow-[inset_0_2px_0_var(--color-gold-leaf)]`;

/**
 * Dieselbe Optik für die Reiter der Kopfzeile, die `<Link>` sind und keine
 * Knöpfe. Den aktiven Zustand markiert der Router selbst mit
 * `data-status="active"` — deshalb genügt eine einzige Klassenliste, und es
 * gibt keine zwei Hintergrundklassen, die um dieselbe Regel streiten.
 */
export const NAV_LINK_CLASS = `${VARIANTS.nav} data-[status=active]:bg-seal data-[status=active]:hover:bg-seal`;

/**
 * Dasselbe für die Unternavigation innerhalb einer Seite (Plan 18-2: die
 * Gebäude eines Dorfes). Auch hier sind es `<Link>`, damit Mittelklick und
 * Ankersemantik erhalten bleiben; den aktiven Reiter erkennt der Router.
 *
 * Der aktive Zustand unterscheidet sich vom Ruhezustand nur durch die hellere
 * Fläche und die Goldkante oben — dieselbe Optik wie `TAB_ACTIVE` unten.
 *
 * `inline-flex`, weil ein Reiter Symbol und Beschriftung nebeneinander trägt;
 * als Anker wäre er sonst eine Zeile Text mit einem Bild darin.
 */
export const TAB_LINK_CLASS =
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs border-2 border-oak border-b-parchment bg-parchment-dark px-3 py-1 font-display font-semibold text-ink text-sm tracking-wide transition-[background-color,box-shadow] active:translate-y-px hover:bg-parchment data-[status=active]:bg-parchment data-[status=active]:shadow-[inset_0_2px_0_var(--color-gold-leaf)]';

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
