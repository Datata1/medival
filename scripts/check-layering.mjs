#!/usr/bin/env node
/**
 * Setzt die Schichtung des Clients durch (plans/09-mobx-state-management.md).
 *
 * Idiom: **Stores besitzen Daten, React zeigt sie an.**
 *   1. Der API-Client wird nur von Stores benutzt.
 *   2. `fetch(` steht nur in der API-Schicht.
 *   3. Präsentationskomponenten (`components/`) kennen keine Stores.
 *
 * Selbsttest: `node scripts/check-layering.mjs --self-test`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_SRC = join(ROOT, 'packages/client/src');

const RULES = [
    {
        name: 'API-Client nur in Stores',
        test: (rel, source) =>
            /from\s+'[^']*api\/client(\.js)?'/.test(source) &&
            !rel.includes('/stores/'),
        hint: 'Datenbeschaffung gehört in einen Store unter src/stores/.',
    },
    {
        name: 'fetch nur in der API-Schicht',
        test: (rel, source) =>
            /\bfetch\s*\(/.test(source) &&
            !rel.includes('/api/') &&
            // Die AudioEngine holt eine gebündelte Klangdatei, keine Spieldaten
            // — dokumentierte Ausnahme (plans/13-sounds.md).
            !rel.endsWith('audio/AudioEngine.ts'),
        hint: 'HTTP-Aufrufe gehören nach src/api/ und werden von Stores benutzt.',
    },
    {
        name: 'Präsentation kennt keine Stores',
        test: (rel, source) =>
            rel.includes('/components/') &&
            /from\s+'[^']*stores\//.test(source) &&
            // Countdown liest bewusst die Weltzeit — dokumentierte Ausnahme.
            !rel.endsWith('components/Countdown.tsx'),
        hint: 'Komponenten unter components/ bekommen alles über Props (Plan 05).',
    },
];

function* sourceFiles(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) yield* sourceFiles(full);
        else if (/\.tsx?$/.test(entry)) yield full;
    }
}

function violationsIn(rel, source) {
    return RULES.filter((rule) => rule.test(rel, source)).map(
        (rule) => ({
            rel,
            rule: rule.name,
            hint: rule.hint,
        }),
    );
}

if (process.argv.includes('--self-test')) {
    const cases = [
        // [Pfad, Inhalt, soll beanstandet werden]
        [
            'packages/client/src/features/map/MapView.tsx',
            "import { api } from '../../api/client.js';",
            true,
        ],
        [
            'packages/client/src/stores/MapStore.ts',
            "import { api } from '../api/client.js';",
            false,
        ],
        [
            'packages/client/src/features/x/Y.tsx',
            'const r = await fetch("/api/x");',
            true,
        ],
        [
            'packages/client/src/api/client.ts',
            'const r = await fetch(url);',
            false,
        ],
        [
            'packages/client/src/components/Card.tsx',
            "import { useStores } from '../stores/StoreContext.js';",
            true,
        ],
        [
            'packages/client/src/components/Countdown.tsx',
            "import { useStores } from '../stores/StoreContext.js';",
            false,
        ],
        [
            'packages/client/src/features/world/Topbar.tsx',
            "import { useStores } from '../../stores/StoreContext.js';",
            false,
        ],
    ];
    let failed = 0;
    for (const [rel, source, shouldFlag] of cases) {
        const flagged = violationsIn(rel, source).length > 0;
        if (flagged !== shouldFlag) {
            console.error(
                `  Selbsttest: ${rel} — erwartet ${shouldFlag ? 'Verstoß' : 'in Ordnung'}, war ${flagged ? 'Verstoß' : 'in Ordnung'}`,
            );
            failed++;
        }
    }
    if (failed > 0) {
        console.error(`\n✗ Selbsttest fehlgeschlagen (${failed})`);
        process.exit(1);
    }
    console.log(
        '✓ Selbsttest bestanden: erkennt Schichtverletzungen, lässt Erlaubtes durch',
    );
    process.exit(0);
}

const violations = [];
for (const file of sourceFiles(CLIENT_SRC)) {
    const rel = relative(ROOT, file);
    if (/\.gen\.tsx?$/.test(rel)) continue; // generierter Routenbaum
    violations.push(...violationsIn(rel, readFileSync(file, 'utf8')));
}

if (violations.length > 0) {
    console.error(`\n✗ ${violations.length} Schichtverletzung(en):\n`);
    for (const v of violations) {
        console.error(`  ${v.rel}\n    [${v.rule}] ${v.hint}`);
    }
    console.error('\nSiehe plans/09-mobx-state-management.md.\n');
    process.exit(1);
}

console.log(
    '✓ Schichtung eingehalten: Stores holen Daten, React zeigt sie an',
);
