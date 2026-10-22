#!/usr/bin/env node
/**
 * Prüft die Farbpalette gegen WCAG AA (plans/11-mittelalterliches-design.md).
 *
 * Ein hübsches Pergament, auf dem man Zahlen schlecht liest, hat sein Ziel
 * verfehlt. Kontrast wird deshalb gemessen, nicht geschätzt: Jede Kombination,
 * die in der Oberfläche tatsächlich vorkommt, muss mindestens 4.5:1 erreichen
 * (3:1 genügt für große Schrift ab 24 px und für Rahmen/Bedienelemente).
 *
 * Selbsttest: `node scripts/check-contrast.mjs --self-test`
 */
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const THEME_FILE = 'packages/client/src/styles.css';
const MAP_FILE = 'packages/client/src/features/map/colors.ts';

/**
 * Liest die `--color-*`-Token aus dem @theme-Block und die Kartenfarben aus
 * `MAP_COLORS`.
 *
 * Die Karte hat eine eigene Quelle, weil Canvas keine CSS-Variablen kennt.
 * Sie hier mitzulesen ist der ganze Punkt der Prüfung: Kartenfarben, die
 * niemand misst, driften genau so weit ab wie die Kopfzeile es vor Plan 18-1
 * tat. Kartenfarben tragen das Präfix `map.`, damit sie in den Meldungen von
 * den Theme-Farben zu unterscheiden sind.
 */
function readPalette() {
    const palette = {};
    const css = readFileSync(
        new URL(`../${THEME_FILE}`, import.meta.url),
        'utf8',
    );
    for (const [, name, value] of css.matchAll(
        /--color-([\w-]+):\s*(#[0-9a-fA-F]{6});/g,
    )) {
        palette[name] = value;
    }
    const map = readFileSync(
        new URL(`../${MAP_FILE}`, import.meta.url),
        'utf8',
    );
    for (const [, name, value] of map.matchAll(
        /^\s{4}(\w+):\s*'(#[0-9a-fA-F]{6})',/gm,
    )) {
        palette[`map.${name}`] = value;
    }
    return palette;
}

function luminance(hex) {
    const channels = [1, 3, 5].map(
        (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
    );
    const [r, g, b] = channels.map((c) =>
        c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
    const [light, dark] = [luminance(a), luminance(b)].sort(
        (x, y) => y - x,
    );
    return (light + 0.05) / (dark + 0.05);
}

/**
 * Die Kombinationen, die in der Oberfläche wirklich vorkommen.
 * `min: 3` gilt für große Überschriften und für Rahmen/Flächen von
 * Bedienelementen — dort erlaubt WCAG den niedrigeren Wert.
 */
const COMBINATIONS = [
    { fg: 'ink', bg: 'parchment', what: 'Fließtext auf Pergament' },
    { fg: 'ink', bg: 'parchment-dark', what: 'Text auf Zebrastreifen' },
    {
        fg: 'ink-light',
        bg: 'parchment',
        what: 'Nebentext auf Pergament',
    },
    {
        fg: 'ink-light',
        bg: 'parchment-dark',
        what: 'Nebentext auf Zebrastreifen',
    },
    {
        fg: 'gold-leaf',
        bg: 'parchment',
        what: 'Überschrift auf Pergament',
    },
    {
        fg: 'seal',
        bg: 'parchment',
        what: 'Warnung/Akzent auf Pergament',
    },
    { fg: 'moss', bg: 'parchment', what: 'Erfolg auf Pergament' },
    { fg: 'parchment', bg: 'seal', what: 'Knopfschrift auf Siegelrot' },
    { fg: 'parchment', bg: 'oak', what: 'Knopfschrift auf Eiche' },
    {
        fg: 'parchment',
        bg: 'timber',
        what: 'Kopfzeilenschrift auf Holz',
    },
    // Plan 18-1: die Kopfzeile ist ein dunkles Band mit acht Reitern.
    {
        fg: 'parchment-dark',
        bg: 'timber',
        what: 'Nebentext in der Kopfzeile (Rang, Punkte)',
    },
    {
        fg: 'parchment',
        bg: 'seal',
        what: 'Aktiver Reiter in der Kopfzeile',
    },
    // Eiche auf Holz erreicht nur 2.75:1 — zu wenig für einen Rahmen. Die
    // Reiter tragen deshalb einen hellen Beschlagrand statt eines dunklen.
    {
        fg: 'parchment-dark',
        bg: 'seal',
        what: 'Reiterrahmen des aktiven Reiters',
        min: 3,
    },
    {
        fg: 'oak',
        bg: 'parchment',
        what: 'Rahmen auf Pergament',
        min: 3,
    },
    {
        fg: 'focus-dark',
        bg: 'timber',
        what: 'Fokusring auf dunklem Grund',
        min: 3,
    },
    {
        fg: 'seal',
        bg: 'parchment',
        what: 'Fokusring auf Pergament',
        min: 3,
    },
    // Plan 18-2: die Stufenplakette am Gebäude auf dem Dorfplatz. Sie steht
    // auf dem Hintergrundbild, also auf keiner der Theme-Flächen — geprüft
    // wird deshalb die Plakette selbst, nicht ihr Untergrund.
    {
        fg: 'parchment',
        bg: 'moss',
        what: 'Stufenplakette auf dem Dorfplatz',
    },
    /*
     * Plan 18-3: Der Kartengrund ist von Holz auf Wiese gewechselt. Damit
     * kippen alle Paarungen der Karte — die Beschriftung in Pergament kam auf
     * dem hellen Grund nur auf 2.2:1 und ist jetzt Tinte.
     *
     * Dörfer, Ringe und Bewegungsstrahlen sind gezeichnete Bedienelemente,
     * keine Schrift: Für sie gilt die 3:1-Schwelle.
     */
    {
        fg: 'map.label',
        bg: 'map.ground',
        what: 'Dorfname auf der Wiese',
    },
    {
        fg: 'map.label',
        bg: 'map.labelHalo',
        what: 'Dorfname in seiner Aura (über Wald und Wasser)',
    },
    { fg: 'map.own', bg: 'map.ground', what: 'Eigenes Dorf', min: 3 },
    {
        fg: 'map.enemy',
        bg: 'map.ground',
        what: 'Fremdes Dorf',
        min: 3,
    },
    {
        fg: 'map.barbarian',
        bg: 'map.ground',
        what: 'Barbarendorf',
        min: 3,
    },
    {
        fg: 'map.activeOutlineEdge',
        bg: 'map.ground',
        what: 'Ring um das aktive Dorf (dunkler Rand)',
        min: 3,
    },
    {
        fg: 'map.activeOutline',
        bg: 'map.activeOutlineEdge',
        what: 'Ring um das aktive Dorf (heller Kern)',
        min: 3,
    },
    {
        fg: 'map.selectedOutline',
        bg: 'map.ground',
        what: 'Ring um das gewählte Dorf',
        min: 3,
    },
    {
        fg: 'map.movementOutgoing',
        bg: 'map.ground',
        what: 'Eigener Bewegungsstrahl',
        min: 3,
    },
    {
        fg: 'map.movementIncoming',
        bg: 'map.ground',
        what: 'Eingehender Bewegungsstrahl',
        min: 3,
    },
    {
        fg: 'map.viewportEdge',
        bg: 'map.ground',
        what: 'Ausschnittrahmen der Übersichtskarte',
        min: 3,
    },
    /*
     * Das Feldraster ist der einzige Eintrag mit einer Untergrenze unter 3:1,
     * und das ist Absicht: Es trägt keine Information, es hilft beim Abzählen
     * von Feldern. Ein Raster, das WCAG für Bedienelemente erfüllt, zerschneidet
     * die Karte in Kacheln. Geprüft wird trotzdem — ein unsichtbares Raster ist
     * genauso falsch wie ein aufdringliches.
     */
    {
        fg: 'map.grid',
        bg: 'map.ground',
        what: 'Feldraster (bewusst leise, keine WCAG-Anforderung)',
        min: 1.2,
    },
    {
        fg: 'map.outside',
        bg: 'map.ground',
        what: 'Weltrand: Fläche jenseits der Karte',
        min: 1.2,
    },
];

function check(palette) {
    const failures = [];
    const results = [];
    for (const { fg, bg, what, min = 4.5 } of COMBINATIONS) {
        if (!palette[fg] || !palette[bg]) {
            failures.push({
                what,
                message: `Farbe ${!palette[fg] ? fg : bg} fehlt im Theme`,
            });
            continue;
        }
        const ratio = contrast(palette[fg], palette[bg]);
        results.push({ what, ratio, min, fg, bg });
        if (ratio < min) {
            failures.push({
                what,
                message: `${ratio.toFixed(2)}:1 — mindestens ${min}:1 nötig (${fg} auf ${bg})`,
            });
        }
    }
    return { failures, results };
}

if (process.argv.includes('--self-test')) {
    // Bekannte Werte: Schwarz auf Weiß = 21:1, gleiche Farbe = 1:1.
    const cases = [
        ['#000000', '#ffffff', 21],
        ['#ffffff', '#ffffff', 1],
        ['#767676', '#ffffff', 4.54], // WCAG-Grenzfall für Fließtext
    ];
    let failed = 0;
    for (const [a, b, expected] of cases) {
        const actual = contrast(a, b);
        if (Math.abs(actual - expected) > 0.02) {
            console.error(
                `  Selbsttest: ${a}/${b} → ${actual.toFixed(2)}, erwartet ${expected}`,
            );
            failed++;
        }
    }
    // Eine absichtlich unlesbare Palette muss auffallen.
    const bad = check({ ink: '#eeeeee', parchment: '#f2e6d0' });
    if (bad.failures.length === 0) {
        console.error(
            '  Selbsttest: unlesbare Kombination wurde nicht beanstandet',
        );
        failed++;
    }
    if (failed > 0) {
        console.error(`\n✗ Selbsttest fehlgeschlagen (${failed})`);
        process.exit(1);
    }
    console.log(
        '✓ Selbsttest bestanden: Kontrastformel stimmt, Verstöße werden erkannt',
    );
    process.exit(0);
}

const palette = readPalette();
if (Object.keys(palette).length === 0) {
    console.error(`✗ Keine Farben in ${THEME_FILE} gefunden`);
    process.exit(1);
}

const { failures, results } = check(palette);

if (process.argv.includes('--verbose')) {
    for (const r of results) {
        console.log(
            `  ${r.ratio.toFixed(2).padStart(5)}:1  (min ${r.min})  ${r.what}`,
        );
    }
}

if (failures.length > 0) {
    console.error(
        `\n✗ ${failures.length} Kontrastverstoß/-verstöße:\n`,
    );
    for (const f of failures)
        console.error(`  ${f.what}: ${f.message}`);
    console.error(`\nFarbwerte anpassen in ${ROOT}${THEME_FILE}.\n`);
    process.exit(1);
}

console.log(
    `✓ Alle ${results.length} Farbkombinationen erfüllen WCAG AA`,
);
