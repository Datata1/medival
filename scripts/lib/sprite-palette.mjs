/**
 * Die verbindliche Sprite-Palette (siehe plans/12-assets-und-sprites.md).
 *
 * Sie baut auf den Theme-Farben aus Plan 11 auf und ergänzt Materialtöne für
 * Holz, Lehm, Eisen und Vegetation. Assets aus einer gemeinsamen Palette wirken
 * zusammengehörig, selbst wenn sie unterschiedlich gut gezeichnet sind — das ist
 * der größte Hebel für ein stimmiges Gesamtbild.
 *
 * Wird von `generate-placeholder-assets.mjs` genutzt und als `.gpl` für
 * LibreSprite/Aseprite exportiert.
 */
export const PALETTE = {
    // Aus dem Theme (Plan 11)
    parchment: '#f2e6d0',
    parchmentDark: '#e3d3b3',
    ink: '#3b2b1a',
    inkLight: '#63523f',
    seal: '#8b2f22',
    goldLeaf: '#c8973f',
    moss: '#3d5636',
    oak: '#755d3c',
    timber: '#241a10',

    // Materialtöne für Sprites
    woodLight: '#a8763f',
    woodDark: '#6b4423',
    clayLight: '#c06a4a',
    clayDark: '#8a4530',
    ironLight: '#9aa3ab',
    ironDark: '#5c646c',
    stoneLight: '#b8ab93',
    stoneDark: '#7d7160',
    roofLight: '#a63f2e',
    roofDark: '#6e2a1f',
    grassLight: '#5c7a4a',
    grassDark: '#3d5636',
    // Gewässer für das Kartengelände (Plan 18-3). Die Palette hatte bis dahin
    // kein Blau — es kam auf keinem Gebäude und keiner Einheit vor.
    waterLight: '#4a7a9c',
    waterDark: '#2f5a78',
    skin: '#d9a678',
    steel: '#c3cad1',
    blood: '#8b2f22',
};

/** Kurzzeichen für die Sprite-Definitionen — `.` ist immer transparent. */
export const KEYS = {
    '.': null,
    // Umrisse und Grundtöne
    o: PALETTE.timber,
    i: PALETTE.ink,
    l: PALETTE.inkLight,
    // Holz
    w: PALETTE.woodLight,
    W: PALETTE.woodDark,
    // Lehm / Dach
    c: PALETTE.clayLight,
    C: PALETTE.clayDark,
    r: PALETTE.roofLight,
    R: PALETTE.roofDark,
    // Eisen / Stahl
    n: PALETTE.ironLight,
    N: PALETTE.ironDark,
    s: PALETTE.steel,
    // Stein
    t: PALETTE.stoneLight,
    T: PALETTE.stoneDark,
    // Vegetation
    g: PALETTE.grassLight,
    G: PALETTE.grassDark,
    // Wasser
    a: PALETTE.waterLight,
    A: PALETTE.waterDark,
    // Akzente
    y: PALETTE.goldLeaf,
    e: PALETTE.seal,
    m: PALETTE.moss,
    p: PALETTE.parchment,
    P: PALETTE.parchmentDark,
    k: PALETTE.skin,
};

/** Exportiert die Palette im GIMP-Format, das LibreSprite und Aseprite lesen. */
export function toGimpPalette() {
    const lines = ['GIMP Palette', 'Name: Medival', 'Columns: 8', '#'];
    for (const [name, hex] of Object.entries(PALETTE)) {
        const r = Number.parseInt(hex.slice(1, 3), 16);
        const g = Number.parseInt(hex.slice(3, 5), 16);
        const b = Number.parseInt(hex.slice(5, 7), 16);
        lines.push(
            `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${name}`,
        );
    }
    return `${lines.join('\n')}\n`;
}
