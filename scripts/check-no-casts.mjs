#!/usr/bin/env node
/**
 * Setzt das Idiom „keine Type-Casts" durch (plans/08-no-typecasting.md).
 *
 * Ein Cast (`x as T`) und eine Non-Null-Assertion (`x!`) behaupten etwas zur
 * Compile-Zeit, prüfen zur Laufzeit aber nichts. An Systemgrenzen gehört
 * stattdessen ein Schema-Parse (siehe packages/shared/src/schema/).
 *
 * Erlaubt bleiben: `as const`, `satisfies`, Import-/Export-Aliase sowie die
 * beiden Framework-Dateien, in denen die Brands und die typisierten
 * Object-Helfer entstehen — dort steht jeder Cast hinter einer Laufzeitprüfung.
 *
 * Selbsttest: `node scripts/check-no-casts.mjs --self-test`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** Dateien, die casten dürfen — jede mit Begründung im Dateikopf. */
const ALLOWED_FILES = [
    'packages/shared/src/time.ts', // Brand-Konstruktoren, validieren vor dem Cast
    'packages/shared/src/lib/objects.ts', // typisierte Object-Helfer
];

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'data', '.git']);

/** Generierte Dateien werden nicht von Hand gepflegt. */
const isGenerated = (path) => /\.gen\.tsx?$/.test(path);

/** Tests dürfen casten (Fixtures). */
const isTestFile = (path) =>
    /(^|\/)test\//.test(path) || /\.test\.tsx?$/.test(path);

function* sourceFiles(dir) {
    for (const entry of readdirSync(dir)) {
        if (IGNORED_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) yield* sourceFiles(full);
        else if (/\.tsx?$/.test(entry)) yield full;
    }
}

/** Ersetzt einen Treffer durch Leerzeichen, damit Zeilennummern stimmen bleiben. */
const blank = (match) => match.replace(/[^\n]/g, ' ');

/**
 * Neutralisiert alles, was kein prüfbarer Code ist: Kommentare, String-Inhalte
 * und Import-/Export-Statements (dort ist `as` ein Alias, kein Cast).
 */
function stripNonCode(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, blank)
        .replace(/\/\/[^\n]*/g, blank)
        .replace(/`(?:[^`\\]|\\.)*`/g, blank)
        .replace(/'(?:[^'\\\n]|\\.)*'/g, blank)
        .replace(/"(?:[^"\\\n]|\\.)*"/g, blank)
        .replace(/^[ \t]*(?:import|export)\b[\s\S]*?;/gm, blank);
}

/** `as T`, `as {`, `as (`, `as [` — alles außer `as const`. */
const CAST = /\bas\s+(?!const\b)[A-Za-z_$({[]/;
/** `x!` gefolgt von Zugriff/Trenner oder Zeilenende — aber nicht `!=`/`!==`. */
const NON_NULL = /[\w)\]]!(?:[.,;)\]]|\s*$)/;

function findViolations(source) {
    const found = [];
    stripNonCode(source)
        .split('\n')
        .forEach((line, index) => {
            if (CAST.test(line)) {
                found.push({
                    line: index + 1,
                    kind: 'Cast',
                    text: line.trim(),
                });
            }
            if (NON_NULL.test(line)) {
                found.push({
                    line: index + 1,
                    kind: 'Non-Null-Assertion',
                    text: line.trim(),
                });
            }
        });
    return found;
}

// ── Selbsttest: der Prüfer muss beweisen, dass er greift ──────────────
if (process.argv.includes('--self-test')) {
    const mustFlag = [
        'const a = raw as { x: number };',
        'const b = raw as string;',
        'const c = raw as Promise<number>;',
        'const d = list[0]!;',
        'const e = ref.current!.value;',
        'const f = raw as (() => void);',
        'const g = raw as string[];',
    ];
    const mustPass = [
        "const h = 'x' as const;",
        'const i = obj satisfies Shape;',
        "import { Database as Db } from 'better-sqlite3';",
        "import {\n    foo as bar,\n} from './x.js';",
        'if (a !== b) return;',
        '// erklärt, warum wir hier nicht casten: x as T wäre falsch',
        "const j = 'text mit as Type darin';",
    ];
    let failed = 0;
    for (const snippet of mustFlag) {
        if (findViolations(snippet).length === 0) {
            console.error(`  Selbsttest: NICHT erkannt → ${snippet}`);
            failed++;
        }
    }
    for (const snippet of mustPass) {
        if (findViolations(snippet).length > 0) {
            console.error(
                `  Selbsttest: falsch beanstandet → ${snippet}`,
            );
            failed++;
        }
    }
    if (failed > 0) {
        console.error(`\n✗ Selbsttest fehlgeschlagen (${failed})`);
        process.exit(1);
    }
    console.log(
        '✓ Selbsttest bestanden: erkennt Casts und Assertions, ignoriert Aliase',
    );
    process.exit(0);
}

// ── regulärer Lauf ────────────────────────────────────────────────────
const violations = [];
for (const file of sourceFiles(join(ROOT, 'packages'))) {
    const rel = relative(ROOT, file);
    if (
        ALLOWED_FILES.includes(rel) ||
        isTestFile(rel) ||
        isGenerated(rel)
    )
        continue;
    for (const v of findViolations(readFileSync(file, 'utf8'))) {
        violations.push({ ...v, rel });
    }
}

if (violations.length > 0) {
    console.error(
        `\n✗ ${violations.length} Verstoß/Verstöße gegen das Cast-Verbot:\n`,
    );
    for (const v of violations) {
        console.error(`  ${v.rel}:${v.line}  [${v.kind}]  ${v.text}`);
    }
    console.error(
        '\nStatt zu casten: an Systemgrenzen mit einem Schema parsen ' +
            '(packages/shared/src/schema/), intern die Typen ehrlich machen.\n' +
            'Siehe plans/08-no-typecasting.md.\n',
    );
    process.exit(1);
}

console.log(
    '✓ Keine Type-Casts oder Non-Null-Assertions in Produktionscode',
);
