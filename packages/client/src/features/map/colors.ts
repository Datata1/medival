/**
 * Kartenfarben (siehe plans/18-ux/18-3-karte.md).
 *
 * Sie leben hier statt im CSS-Theme, weil Canvas keine CSS-Variablen kennt —
 * und in einer eigenen Datei statt in `MapCanvas.tsx`, weil außer der
 * Nahansicht auch die Übersichtskarte, die Legende und `check-contrast.mjs`
 * sie lesen.
 *
 * **Der Grund ist grün, nicht schwarz.** Plan 11 hatte `timber` gewählt, damit
 * die Dörfer „darauf leuchten"; in der Praxis war es ein schwarzes Feld mit
 * Punkten. Die Entscheidung ist hier umgekehrt: helle Wiese, dunkle Dörfer,
 * dunkle Schrift. Damit kippen alle Paarungen — die Beschriftung in Pergament
 * erreichte auf hellem Grund nur 2.2:1 und ist jetzt Tinte.
 *
 * Alle Werte sind undurchsichtige `#rrggbb`, weil `check-contrast.mjs` sie
 * misst und ein Alphawert dort nichts bedeuten würde.
 */
export const MAP_COLORS = {
    /** Wiese. Hell genug, dass Tinte darauf AA erreicht (6.4:1). */
    ground: '#89a866',
    /**
     * Jenseits des Weltrands. Ohne einen eigenen Ton hört am Rand nur das
     * Raster auf und die Wiese läuft weiter — man sieht nicht, dass die Welt
     * zu Ende ist, sondern glaubt, die Karte sei kaputt.
     */
    outside: '#5f7048',
    /** Feldraster: sichtbar, aber leise — es trägt keine Information. */
    grid: '#6b8a4e',
    /** Dorffarben, zugleich die Punkte der Übersichtskarte. */
    own: '#5c3d0e',
    enemy: '#6e2a1f',
    barbarian: '#3f3a33',
    /**
     * Der Ring um das aktive Dorf ist zweifarbig: außen Tinte, innen
     * Pergament. Ein einfarbig heller Ring erreicht auf der hellen Wiese nur
     * 2.2:1 — der dunkle Rand darunter trägt den Kontrast, der helle Kern die
     * Erkennbarkeit.
     */
    activeOutline: '#f2e6d0',
    activeOutlineEdge: '#241a10',
    /** Das angeklickte Dorf: dasselbe Ringmuster, andere Farbe. */
    selectedOutline: '#123a63',
    /** Dorfnamen: Tinte mit Pergament-Aura, damit sie auch über Wald lesbar bleiben. */
    label: '#241a10',
    labelHalo: '#f2e6d0',
    /** Bewegungsstrahlen — dieselben Töne wie eigene und fremde Dörfer. */
    movementOutgoing: '#5c3d0e',
    movementIncoming: '#6e2a1f',
    /** Der Ausschnittrahmen der Übersichtskarte. */
    viewport: '#f2e6d0',
    viewportEdge: '#241a10',
} as const;
