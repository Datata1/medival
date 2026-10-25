/**
 * Auswertung der Lastprobe (plans/19-prototyp/19-15): Invarianten in der
 * Welt-DB nach dem Lauf und der Markdown-Bericht mit allen Grenzen.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    type BUILDING_ORDER,
    type BuildingLevels,
    EMPTY_BUILDING_LEVELS,
    farmCapacity,
    totalBuildingPop,
    type UNITS,
    type Units,
    UnitsSchema,
    unitPop,
} from '../../packages/shared/src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
    path.resolve(here, '../../packages/server/package.json'),
);
const Database: typeof import('better-sqlite3') = require('better-sqlite3');

interface Hist {
    count: number;
    p50Ms: number;
    p99Ms: number;
    maxMs: number;
}

export interface RunResult {
    config: {
        minutes: number;
        bots: number;
        barbarians: number;
        humans: number;
        speed: number;
        mapSize: number;
        out: string;
        warmupS: number;
    };
    setupMs: number;
    durationS: number;
    requests: Map<string, number[]>;
    statuses: { ok: number; client: number; server: number };
    wsLags: number[];
    samples: {
        atS: number;
        rssMb: number;
        cpuPercent: number;
        dbMb: number;
        loopP99Ms: number;
        /** Bot-Tick p99 im laufenden 15-s-Fenster des Servers. */
        botTickP99Ms: number;
        botTicks: number;
        backlogMs: number;
    }[];
    finalHealth: {
        eventLoop: { p99Ms: number };
        botTick: { count: number; p99Ms: number };
        worlds: { eventBacklogMs: number }[];
        totals: {
            eventLoop: { p50Ms: number; p99Ms: number; maxMs: number };
            botTick: Hist;
            eventLag: Hist;
            events: Record<string, Hist>;
            botIntents: { done: number; rejected: number };
            checkpoint: Hist;
        };
    };
    /** Gesamtwerte am Ende der Aufwärmphase, vor dem Zurücksetzen. */
    warmupHealth: RunResult['finalHealth'] | null;
    serverLog: string[];
    dataDir: string;
    worldId: number;
    out: string;
}

function percentile(values: number[], q: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return (
        sorted[
            Math.min(sorted.length - 1, Math.floor(sorted.length * q))
        ] ?? 0
    );
}

const ms = (n: number) => `${n.toFixed(n < 10 ? 2 : 1)} ms`;

/** Invarianten nach dem Lauf — jede mit Anzahl der Verstöße. */
function checkInvariants(
    dbFile: string,
    metaFile: string,
    worldId: number,
) {
    const db = new Database(dbFile, { readonly: true });
    const meta = new Database(metaFile, { readonly: true });
    const gameTime = (
        meta
            .prepare(
                'SELECT game_time_ms AS t FROM worlds WHERE id = ?',
            )
            .get(worldId) as { t: number }
    ).t;
    meta.close();

    // Bevölkerung ≤ Bauernhof: Gebäude, Truppen zu Hause, unterwegs, in Ausbildung.
    const levels = new Map<number, BuildingLevels>();
    for (const r of db
        .prepare('SELECT village_id AS v, type, level FROM buildings')
        .all() as {
        v: number;
        type: (typeof BUILDING_ORDER)[number];
        level: number;
    }[]) {
        const l = levels.get(r.v) ?? { ...EMPTY_BUILDING_LEVELS };
        l[r.type] = r.level;
        levels.set(r.v, l);
    }
    const pop = new Map<number, number>();
    const addPop = (v: number, units: Units) =>
        pop.set(v, (pop.get(v) ?? 0) + unitPop(units));
    for (const r of db
        .prepare(
            'SELECT village_id AS v, unit_type AS u, count_home AS n FROM units',
        )
        .all() as { v: number; u: keyof typeof UNITS; n: number }[])
        addPop(r.v, { [r.u]: r.n });
    for (const r of db
        .prepare(
            'SELECT village_id AS v, unit_type AS u, count AS n FROM recruit_queue',
        )
        .all() as { v: number; u: keyof typeof UNITS; n: number }[])
        addPop(r.v, { [r.u]: r.n });
    for (const r of db
        .prepare(
            "SELECT origin_village_id AS v, units_json AS j FROM movements WHERE kind <> 'trade'",
        )
        .all() as { v: number; j: string }[])
        addPop(r.v, UnitsSchema.parse(JSON.parse(r.j)));
    let popViolations = 0;
    for (const [v, l] of levels)
        if (
            totalBuildingPop(l) + (pop.get(v) ?? 0) >
            farmCapacity(l.farm)
        )
            popViolations++;

    // Ein Paladin je Spieler.
    const paladins = new Map<number, number>();
    const addPaladin = (p: number | null, n: number) => {
        if (p !== null && n > 0)
            paladins.set(p, (paladins.get(p) ?? 0) + n);
    };
    for (const r of db
        .prepare(
            `SELECT v.player_id AS p, u.count_home AS n FROM units u JOIN villages v ON v.id = u.village_id WHERE u.unit_type = 'paladin'
             UNION ALL SELECT v.player_id, q.count FROM recruit_queue q JOIN villages v ON v.id = q.village_id WHERE q.unit_type = 'paladin'`,
        )
        .all() as { p: number | null; n: number }[])
        addPaladin(r.p, r.n);
    for (const r of db
        .prepare(
            'SELECT v.player_id AS p, m.units_json AS j FROM movements m JOIN villages v ON v.id = m.origin_village_id',
        )
        .all() as { p: number | null; j: string }[])
        addPaladin(
            r.p,
            UnitsSchema.parse(JSON.parse(r.j)).paladin ?? 0,
        );
    const paladinViolations = [...paladins.values()].filter(
        (n) => n > 1,
    ).length;

    // Verwaiste Events: Ihr Gegenstück fehlt.
    const exists = (sql: string, id: unknown) =>
        db.prepare(sql).get(id) !== undefined;
    let orphans = 0;
    for (const e of db
        .prepare('SELECT type, payload_json AS p FROM events')
        .all() as { type: string; p: string }[]) {
        const p = JSON.parse(e.p) as Record<string, number>;
        const ok =
            e.type === 'arrival'
                ? exists(
                      'SELECT 1 FROM movements WHERE id = ?',
                      p.movementId,
                  )
                : e.type === 'build_complete'
                  ? exists(
                        'SELECT 1 FROM build_queue WHERE id = ?',
                        p.queueId,
                    )
                  : e.type === 'recruit_done'
                    ? exists(
                          'SELECT 1 FROM recruit_queue WHERE id = ?',
                          p.queueId,
                      )
                    : e.type === 'research_complete'
                      ? exists(
                            'SELECT 1 FROM research_queue WHERE id = ?',
                            p.queueId,
                        )
                      : e.type === 'barbarian_tick'
                        ? exists(
                              'SELECT 1 FROM villages WHERE id = ? AND player_id IS NULL',
                              p.villageId,
                          )
                        : e.type === 'bot_tick'
                          ? exists(
                                'SELECT 1 FROM players WHERE id = ? AND is_bot = 1',
                                p.playerId,
                            )
                          : true;
        if (!ok) orphans++;
    }

    // Bewegungen, deren Ankunft mehr als 1 s vor dem Spielstand liegt.
    const overdue = (
        db
            .prepare(
                'SELECT COUNT(*) AS n FROM movements WHERE arrival_game_time < ?',
            )
            .get(gameTime - 1000) as { n: number }
    ).n;

    const counts = db
        .prepare(
            `SELECT (SELECT COUNT(*) FROM villages) AS villages,
                    (SELECT COUNT(*) FROM movements) AS movements,
                    (SELECT COUNT(*) FROM events) AS events,
                    (SELECT COUNT(*) FROM reports) AS reports,
                    (SELECT COUNT(*) FROM research) AS research,
                    (SELECT COALESCE(SUM(points), 0) FROM villages WHERE player_id IS NOT NULL) AS points`,
        )
        .get() as Record<string, number>;
    db.close();
    return {
        popViolations,
        paladinViolations,
        paladinPlayers: paladins.size,
        orphans,
        overdue,
        counts,
    };
}

export function writeReport(r: RunResult): void {
    const dbFile = path.join(r.dataDir, `world_${r.worldId}.sqlite`);
    const inv = checkInvariants(
        dbFile,
        path.join(r.dataDir, 'worlds.sqlite'),
        r.worldId,
    );
    const t = r.finalHealth.totals;
    const all = (routes: string[]) =>
        routes.flatMap((route) => r.requests.get(route) ?? []);
    const httpGame = all([
        'village',
        'build',
        'recruit',
        'send',
        'reports',
    ]);
    const tiles = r.requests.get('map/tiles') ?? [];
    const backlogMax = Math.max(
        0,
        ...r.samples
            .filter((s) => s.atS > r.config.warmupS)
            .map((s) => s.backlogMs),
    );
    const w = r.warmupHealth?.totals;
    const intents = t.botIntents.done + t.botIntents.rejected;
    const rejectedShare =
        intents === 0 ? 0 : t.botIntents.rejected / intents;
    const rejectedLines = r.serverLog.filter((l) =>
        l.includes('abgewiesen'),
    );
    const rejectCodes = new Map<string, number>();
    for (const line of rejectedLines) {
        const code = /abgewiesen \(([^)]+)\)/.exec(line)?.[1] ?? '?';
        const kind = /: (\w+) abgewiesen/.exec(line)?.[1] ?? '?';
        const key = `${kind} → ${code}`;
        rejectCodes.set(key, (rejectCodes.get(key) ?? 0) + 1);
    }

    const limits: [string, string, string, boolean][] = [
        [
            'Event-Loop-Latenz p99',
            ms(t.eventLoop.p99Ms),
            '< 50 ms',
            t.eventLoop.p99Ms < 50,
        ],
        [
            'Event-Rückstand max (Health, alle 10 s)',
            ms(backlogMax),
            '< 1 s',
            backlogMax < 1000,
        ],
        [
            'Event-Verspätung max (je Event)',
            ms(t.eventLag.maxMs),
            '< 1 s',
            t.eventLag.maxMs < 1000,
        ],
        [
            'HTTP p99 (Dorfansicht, Kommandos)',
            ms(percentile(httpGame, 0.99)),
            '< 100 ms',
            percentile(httpGame, 0.99) < 100,
        ],
        [
            '`map/tiles` p99',
            ms(percentile(tiles, 0.99)),
            '< 50 ms',
            percentile(tiles, 0.99) < 50,
        ],
        [
            'WS-Verzögerung p99',
            ms(percentile(r.wsLags, 0.99)),
            '< 200 ms',
            percentile(r.wsLags, 0.99) < 200,
        ],
        [
            'Bot-Tick p99',
            ms(t.botTick.p99Ms),
            '< 5 ms',
            t.botTick.p99Ms < 5,
        ],
        [
            'Abgewiesene Bot-Intents',
            `${(rejectedShare * 100).toFixed(2)} % (${t.botIntents.rejected} von ${intents})`,
            '< 1 %',
            rejectedShare < 0.01,
        ],
        [
            'Fehler 5xx',
            String(r.statuses.server),
            '0',
            r.statuses.server === 0,
        ],
        [
            'Bevölkerung > Bauernhof',
            `${inv.popViolations} Dörfer`,
            '0',
            inv.popViolations === 0,
        ],
        [
            'Mehr als ein Paladin je Spieler',
            `${inv.paladinViolations} Spieler`,
            '0',
            inv.paladinViolations === 0,
        ],
        [
            'Verwaiste Events',
            String(inv.orphans),
            '0',
            inv.orphans === 0,
        ],
        [
            'Bewegungen mit Ankunft in der Vergangenheit',
            String(inv.overdue),
            '0',
            inv.overdue === 0,
        ],
    ];
    const passed = limits.every(([, , , ok]) => ok);

    const routeRows = [...r.requests]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
            ([route, list]) =>
                `| \`${route}\` | ${list.length} | ${ms(percentile(list, 0.5))} | ${ms(percentile(list, 0.99))} | ${ms(Math.max(...list))} |`,
        );
    const eventRows = Object.entries(t.events)
        .sort(([, a], [, b]) => b.count - a.count)
        .map(
            ([type, h]) =>
                `| \`${type}\` | ${h.count} | ${(h.count / r.durationS).toFixed(1)} | ${ms(h.p50Ms)} | ${ms(h.p99Ms)} | ${ms(h.maxMs)} |`,
        );
    const last = r.samples.at(-1);
    const peak = (f: (s: RunResult['samples'][number]) => number) =>
        Math.max(0, ...r.samples.map(f));
    const avgCpu =
        r.samples.reduce((s, x) => s + x.cpuPercent, 0) /
        Math.max(1, r.samples.length);

    const md = `# Lastprobe Prototyp — Ergebnis

Erzeugt von \`scripts/loadtest/run.ts\` (plans/19-prototyp/19-15) am ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.

## Szenario

| Größe | Wert |
|---|---|
| Karte | ${r.config.mapSize}×${r.config.mapSize} |
| Bots | ${r.config.bots} |
| Barbarendörfer | ${r.config.barbarians} |
| Simulierte Menschen | ${r.config.humans} (HTTP + WebSocket) |
| Speed | ${r.config.speed} |
| Dauer | ${r.config.minutes} min Messung nach ${r.config.warmupS} s Aufwärmen |
| Weltanlage | ${(r.setupMs / 1000).toFixed(1)} s (nicht in den Messwerten) |
| Rechner | ${process.platform}, ${os.cpus()[0]?.model ?? '?'}, Node ${process.version} |

## Abnahmegrenzen

**Ergebnis: ${passed ? 'alle Grenzen eingehalten' : 'mindestens eine Grenze gerissen'}.**

| Kennzahl | Messwert | Grenze | |
|---|---|---|---|
${limits.map(([name, value, limit, ok]) => `| ${name} | ${value} | ${limit} | ${ok ? '✅' : '❌'} |`).join('\n')}

## Antwortzeiten je Route (Client-Sicht)

| Route | Anfragen | p50 | p99 | max |
|---|---|---|---|---|
${routeRows.join('\n')}

Statuscodes: ${r.statuses.ok} × 2xx, ${r.statuses.client} × 4xx (Spielfehler wie \`not_enough_resources\`, erwartet), ${r.statuses.server} × 5xx. WebSocket: ${r.wsLags.length} Nachrichten, p50 ${ms(percentile(r.wsLags, 0.5))}, p99 ${ms(percentile(r.wsLags, 0.99))}.

## Server

Event-Loop-Latenz über den ganzen Lauf: p50 ${ms(t.eventLoop.p50Ms)}, p99 ${ms(t.eventLoop.p99Ms)}, max ${ms(t.eventLoop.maxMs)}. Bot-Ticks: ${t.botTick.count}, p50 ${ms(t.botTick.p50Ms)}, p99 ${ms(t.botTick.p99Ms)}, max ${ms(t.botTick.maxMs)}. Verspätung der Events gegenüber ihrer Fälligkeit: p50 ${ms(t.eventLag.p50Ms)}, p99 ${ms(t.eventLag.p99Ms)}, max ${ms(t.eventLag.maxMs)}. WAL-Checkpoints im 15-s-Takt: ${t.checkpoint.count}, p50 ${ms(t.checkpoint.p50Ms)}, max ${ms(t.checkpoint.maxMs)} (blockieren den Event-Loop so lange).

| Event-Typ | Anzahl | je s | p50 | p99 | max |
|---|---|---|---|---|---|
${eventRows.join('\n')}

${
    w
        ? `**Aufwärmphase** (erste ${r.config.warmupS} s, nicht in den Grenzen oben): Event-Loop p99 ${ms(w.eventLoop.p99Ms)}, max ${ms(w.eventLoop.maxMs)}; Bot-Ticks ${w.botTick.count}, p99 ${ms(w.botTick.p99Ms)}, max ${ms(w.botTick.maxMs)}; Event-Verspätung max ${ms(w.eventLag.maxMs)}.`
        : ''
}

${
    rejectCodes.size === 0
        ? 'Keine abgewiesenen Bot-Intents.'
        : `Abgewiesene Bot-Intents nach Grund:\n\n${[...rejectCodes]
              .sort(([, a], [, b]) => b - a)
              .map(([k, n]) => `- ${k}: ${n}`)
              .join('\n')}`
}

## Ressourcen (alle 10 s)

RSS am Ende ${last?.rssMb.toFixed(0) ?? '?'} MB (Spitze ${peak((s) => s.rssMb).toFixed(0)} MB). CPU im Mittel ${avgCpu.toFixed(0)} % eines Kerns (Spitze ${peak((s) => s.cpuPercent).toFixed(0)} %). Welt-DB inklusive WAL am Ende ${last?.dbMb.toFixed(1) ?? '?'} MB.

Stand der Welt am Ende: ${inv.counts.villages} Dörfer, ${inv.counts.movements} Bewegungen unterwegs, ${inv.counts.events} ausstehende Events, ${inv.counts.reports} Berichte, ${inv.counts.research} Forschungen, ${inv.counts.points} Punkte bei Spielern, ${inv.paladinPlayers} Spieler mit Paladin.
`;
    fs.mkdirSync(path.dirname(r.out), { recursive: true });
    fs.writeFileSync(r.out, md);
    // Das Serverprotokoll ist groß (jede Anfrage) und gehört nicht ins
    // Repository: Es landet im ignorierten `data/`.
    const logDir = path.resolve(here, '../../data');
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
        path.join(logDir, `${path.basename(r.out, '.md')}.log`),
        `${r.serverLog.join('\n')}\n`,
    );
    fs.writeFileSync(
        r.out.replace(/\.md$/, '.json'),
        `${JSON.stringify(
            {
                config: r.config,
                limits: limits.map(([name, value, limit, ok]) => ({
                    name,
                    value,
                    limit,
                    ok,
                })),
                samples: r.samples,
                totals: t,
                invariants: inv,
            },
            null,
            2,
        )}\n`,
    );
}
