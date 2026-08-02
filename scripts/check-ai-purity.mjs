#!/usr/bin/env node
/**
 * Hält die Entscheidungsschicht der KI rein (plans/15-bot-grundgeruest.md).
 *
 * Idiom: **Wahrnehmung → Entscheidung → Ausführung.** Die mittlere Schicht
 * (`server/src/ai/decide/`) besteht aus puren Funktionen
 * `(snapshot, rng) → Ergebnis`: kein Datenbankzugriff, keine Uhr, kein Zufall
 * außer dem hereingereichten. Nur so lässt sie sich testen, indem man einen
 * Snapshot als Literal hinschreibt — ohne SQLite, ohne Scheduler, ohne Welt.
 *
 * Warum als Skript und nicht als Konvention: Ohne Prüfung wandert beim ersten
 * Zeitdruck ein `world.db.select()` in eine Entscheidungsfunktion („nur diese
 * eine Abfrage"), und der gesamte Testgewinn ist weg. Dieselbe Überlegung wie
 * bei check-layering.mjs (Plan 09) und check-no-casts.mjs (Plan 08).
 *
 * Selbsttest: `node scripts/check-ai-purity.mjs --self-test`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DECIDE_DIR = join(ROOT, 'packages/server/src/ai/decide');

/**
 * Verbotene Importe. Jeder davon zöge Zustand in eine Funktion, die per
 * Definition nur aus ihren Argumenten schließen darf.
 */
const FORBIDDEN_IMPORTS = [
    { pattern: /from\s+'[^']*\/db\//, what: 'Datenbank-Schema' },
    { pattern: /from\s+'drizzle-orm/, what: 'Drizzle' },
    { pattern: /from\s+'better-sqlite3/, what: 'SQLite' },
    { pattern: /from\s+'[^']*world\.js'/, what: 'World' },
    {
        pattern: /from\s+'[^']*military\.js'/,
        what: 'Militär-Kommandos',
    },
    { pattern: /from\s+'[^']*worldManager\.js'/, what: 'WorldManager' },
    { pattern: /from\s+'[^']*scheduler\.js'/, what: 'Scheduler' },
    { pattern: /from\s+'node:/, what: 'Node-Kernmodul' },
];

/**
 * Verbotene Ausdrücke: nichtdeterministische Quellen. Eine Entscheidung, die
 * `Date.now()` oder `Math.random()` benutzt, ist bei gleichem Snapshot nicht
 * mehr reproduzierbar — und damit ist kein Spielstand mehr reproduzierbar.
 */
const FORBIDDEN_CALLS = [
    {
        pattern: /\bMath\.random\s*\(/,
        what: 'Math.random (RNG wird injiziert)',
    },
    {
        pattern: /\bDate\.now\s*\(/,
        what: 'Date.now (Zeit gehört in den Snapshot)',
    },
    {
        pattern: /\bnew\s+Date\s*\(/,
        what: 'new Date (Zeit gehört in den Snapshot)',
    },
    { pattern: /\bperformance\.now\s*\(/, what: 'performance.now' },
    { pattern: /\bprocess\./, what: 'process (Umgebung)' },
];

export function violationsIn(rel, source) {
    const found = [];
    for (const { pattern, what } of FORBIDDEN_IMPORTS) {
        if (pattern.test(source))
            found.push({ rel, what: `Import: ${what}` });
    }
    for (const { pattern, what } of FORBIDDEN_CALLS) {
        if (pattern.test(stripComments(source)))
            found.push({ rel, what: `Aufruf: ${what}` });
    }
    return found;
}

/** Kommentare ausblenden — ein erklärender Hinweis auf Date.now ist kein Verstoß. */
function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

function* sourceFiles(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) yield* sourceFiles(full);
        else if (/\.ts$/.test(entry)) yield full;
    }
}

if (process.argv.includes('--self-test')) {
    const cases = [
        // [Inhalt, soll beanstandet werden, Beschreibung]
        [
            "import { villages } from '../../db/schema.js';",
            true,
            'DB-Schema',
        ],
        ["import { eq } from 'drizzle-orm';", true, 'Drizzle'],
        [
            "import type { World } from '../../engine/world.js';",
            true,
            'World',
        ],
        ['const roll = Math.random();', true, 'Math.random'],
        ['const now = Date.now();', true, 'Date.now'],
        [
            "import { canAfford, type Rng } from '@medival/shared';",
            false,
            'shared-Regeln sind erlaubt',
        ],
        [
            "import { PERSONALITIES } from '../personalities.js';",
            false,
            'Daten aus dem KI-Paket',
        ],
        ['const roll = rng();', false, 'injizierter Zufall'],
        [
            '// Date.now() wäre hier falsch — die Zeit steht im Snapshot.',
            false,
            'Erwähnung im Kommentar',
        ],
        [
            '/* Kein Math.random hier. */\nconst x = rng();',
            false,
            'Erwähnung im Blockkommentar',
        ],
    ];

    let failed = 0;
    for (const [source, shouldFlag, label] of cases) {
        const flagged = violationsIn('probe.ts', source).length > 0;
        if (flagged !== shouldFlag) {
            console.error(
                `  Selbsttest: ${label} — erwartet ${shouldFlag ? 'Verstoß' : 'in Ordnung'}, war ${flagged ? 'Verstoß' : 'in Ordnung'}`,
            );
            failed++;
        }
    }
    if (failed > 0) {
        console.error(`✗ Selbsttest fehlgeschlagen (${failed})`);
        process.exit(1);
    }
    console.log(
        '✓ Selbsttest bestanden: erkennt Datenbank, Uhr und Zufall, lässt reine Logik durch',
    );
    process.exit(0);
}

let files = [];
try {
    files = [...sourceFiles(DECIDE_DIR)];
} catch {
    console.log(
        'ℹ Kein Verzeichnis ai/decide/ — nichts zu prüfen (Plan 15 noch offen)',
    );
    process.exit(0);
}

const violations = files.flatMap((file) =>
    violationsIn(relative(ROOT, file), readFileSync(file, 'utf8')),
);

if (violations.length > 0) {
    console.error(
        `\n✗ ${violations.length} Verstoß/Verstöße gegen die Reinheit der Entscheidungsschicht:\n`,
    );
    for (const v of violations) console.error(`  ${v.rel}  ${v.what}`);
    console.error(
        '\nEntscheidungen erhalten alles über den Snapshot. Datenbankzugriff gehört nach',
    );
    console.error(
        'ai/perceive.ts, Ausführung nach ai/execute.ts. Siehe plans/15-bot-grundgeruest.md.',
    );
    process.exit(1);
}

console.log(
    `✓ Entscheidungsschicht rein: ${files.length} Datei(en) ohne Datenbank, Uhr oder freien Zufall`,
);
