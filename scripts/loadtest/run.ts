/**
 * Lastprobe des Prototyps (plans/19-prototyp/19-15).
 *
 * Startet den **echten** Server als eigenen Prozess, legt eine Welt an und
 * erzeugt Last von außen: Skriptspieler über HTTP und WebSocket, dazu die
 * Bots und Barbaren der Welt selbst. Gemessen wird beim Server
 * (`/api/health`: Event-Loop, Rückstand, Events, Bot-Ticks), beim Client
 * (Antwortzeiten je Route, WebSocket-Verzögerung) und am Prozess (Speicher,
 * CPU, Datenbankgröße). Danach prüft `report.ts` die Invarianten und
 * schreibt den Bericht.
 *
 *   pnpm loadtest          60 min, 300 Bots, 2 000 Barbaren, 50 Menschen
 *   pnpm loadtest:smoke     5 min,  50 Bots,   300 Barbaren, 10 Menschen
 */
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type HumanOptions, runHuman } from './human.js';
import { type RunResult, writeReport } from './report.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const serverDir = path.join(root, 'packages/server');
const require = createRequire(path.join(serverDir, 'package.json'));
const WebSocket: HumanOptions['WebSocket'] = require('ws');

const args = new Map(
    process.argv
        .slice(2)
        .map(
            (a) => a.replace(/^--/, '').split('=') as [string, string],
        ),
);
const smoke = args.has('smoke');
const config = {
    minutes: Number(args.get('minutes') ?? (smoke ? 5 : 60)),
    bots: Number(args.get('bots') ?? (smoke ? 50 : 300)),
    barbarians: Number(args.get('barbarians') ?? (smoke ? 300 : 2000)),
    humans: Number(args.get('humans') ?? (smoke ? 10 : 50)),
    speed: Number(args.get('speed') ?? 10),
    /*
     * Aufwärmen vor der Messung: In den ersten Sekunden einer frischen Welt
     * denken alle Bots zugleich, und der JIT ist kalt. Im Probelauf stammten
     * die langsamsten Bot-Ticks fast alle aus den ersten 10 s; danach lagen
     * die Fenster bei 1–3 ms. Die Werte dieser Phase stehen getrennt im
     * Bericht.
     */
    warmupS: Number(args.get('warmup') ?? (smoke ? 60 : 120)),
    mapSize: 1000,
    out:
        args.get('out') ??
        path.join(
            root,
            smoke
                ? 'data/loadtest-smoke.md'
                : 'plans/19-prototyp/lastprobe-ergebnis.md',
        ),
};

const port = 3300 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-load-'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function startServer(): { child: ChildProcess; log: string[] } {
    const log: string[] = [];
    const child = spawn(
        process.execPath,
        [
            // Zusätzliche Node-Schalter für den Server, z. B. `--trace-gc`.
            ...(process.env.LOADTEST_SERVER_FLAGS ?? '')
                .split(' ')
                .filter(Boolean),
            '--import',
            'tsx',
            'src/index.ts',
        ],
        {
            cwd: serverDir,
            env: {
                ...process.env,
                MEDIVAL_DATA_DIR: dataDir,
                PORT: String(port),
                HOST: '127.0.0.1',
                MEDIVAL_DEV: '',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );
    const collect = (chunk: Buffer) => {
        for (const line of String(chunk).split('\n'))
            if (line.trim()) log.push(line);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    return { child, log };
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        try {
            if ((await fetch(url)).ok) return;
        } catch {}
        await sleep(250);
    }
    throw new Error(`Server antwortet nicht: ${url}`);
}

/** CPU-Zeit (ms) und RSS (MB) eines Prozesses aus /proc. */
function processStats(pid: number): { cpuMs: number; rssMb: number } {
    const stat = fs
        .readFileSync(`/proc/${pid}/stat`, 'utf8')
        .split(' ');
    const ticks = Number(stat[13]) + Number(stat[14]);
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const rssKb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
    return { cpuMs: (ticks * 1000) / 100, rssMb: rssKb / 1024 };
}

function dbSizeMb(worldId: number): number {
    let bytes = 0;
    for (const suffix of ['', '-wal', '-shm']) {
        const file = path.join(
            dataDir,
            `world_${worldId}.sqlite${suffix}`,
        );
        if (fs.existsSync(file)) bytes += fs.statSync(file).size;
    }
    return bytes / 1024 / 1024;
}

async function main(): Promise<void> {
    console.log('Lastprobe', config);
    const { child, log } = startServer();
    if (child.pid === undefined) throw new Error('kein Serverprozess');
    const pid = child.pid;
    await waitFor(`${base}/api/health`, 60_000);

    const admin = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            name: 'Lastprobe',
            password: 'lastprobe-geheim',
        }),
    });
    const adminCookie = (admin.headers.get('set-cookie') ?? '').split(
        ';',
    )[0];
    const setupStarted = performance.now();
    const created = await fetch(`${base}/api/worlds`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            cookie: adminCookie ?? '',
        },
        body: JSON.stringify({
            name: 'Lastprobe',
            settings: {
                speed: config.speed,
                unitSpeed: config.speed,
                mapSize: config.mapSize,
                botCount: config.bots,
                barbarianCount: config.barbarians,
                seed: 1915,
            },
        }),
    });
    const world = (await created.json()) as { id: number };
    const setupMs = performance.now() - setupStarted;
    console.log(
        `Welt ${world.id} angelegt in ${Math.round(setupMs)} ms`,
    );
    await fetch(`${base}/api/health/reset`, {
        method: 'POST',
        headers: { cookie: adminCookie ?? '' },
    });

    const requests = new Map<string, number[]>();
    const statuses = { ok: 0, client: 0, server: 0 };
    const wsLags: number[] = [];
    const metrics = {
        request(route: string, ms: number, status: number) {
            const list = requests.get(route) ?? [];
            list.push(ms);
            requests.set(route, list);
            if (status >= 500) statuses.server++;
            else if (status >= 400) statuses.client++;
            else statuses.ok++;
        },
        wsLag(ms: number) {
            wsLags.push(ms);
        },
    };

    const started = Date.now();
    const deadline =
        started + config.warmupS * 1000 + config.minutes * 60_000;
    let seed = 1915;
    const rngFor = () => {
        let s = seed++ * 2654435761;
        return () => {
            s = (s * 1103515245 + 12345) % 2 ** 31;
            return s / 2 ** 31;
        };
    };
    const humans = Array.from({ length: config.humans }, (_, i) =>
        // Beitreten über die erste halbe Minute verteilt.
        sleep((i * 30_000) / config.humans).then(() =>
            runHuman({
                base,
                worldId: world.id,
                name: `Mensch${i + 1}`,
                metrics,
                deadline,
                rng: rngFor(),
                WebSocket,
            }).catch((error: unknown) => {
                console.error(`Mensch${i + 1}:`, error);
            }),
        ),
    );

    // Nach dem Aufwärmen: Stand sichern, Gesamtwerte auf null.
    let warmupHealth: RunResult['finalHealth'] | null = null;
    const warmupDone = sleep(config.warmupS * 1000).then(async () => {
        warmupHealth = (await (
            await fetch(`${base}/api/health`)
        ).json()) as RunResult['finalHealth'];
        await fetch(`${base}/api/health/reset`, {
            method: 'POST',
            headers: { cookie: adminCookie ?? '' },
        });
        console.log('Aufwärmen beendet, Messung beginnt');
    });

    const samples: RunResult['samples'] = [];
    let last = processStats(pid);
    let lastAt = Date.now();
    const sampler = setInterval(async () => {
        const now = Date.now();
        const stats = processStats(pid);
        const health = (await (
            await fetch(`${base}/api/health`)
        ).json()) as RunResult['finalHealth'];
        samples.push({
            atS: Math.round((now - started) / 1000),
            rssMb: stats.rssMb,
            cpuPercent:
                ((stats.cpuMs - last.cpuMs) / (now - lastAt)) * 100,
            dbMb: dbSizeMb(world.id),
            loopP99Ms: health.eventLoop.p99Ms,
            botTickP99Ms: health.botTick.p99Ms,
            botTicks: health.botTick.count,
            backlogMs: Math.max(
                0,
                ...health.worlds.map((w) => w.eventBacklogMs),
            ),
        });
        last = stats;
        lastAt = now;
        const s = samples.at(-1);
        if (s)
            console.log(
                `${s.atS}s rss=${s.rssMb.toFixed(0)}MB cpu=${s.cpuPercent.toFixed(0)}% loopP99=${s.loopP99Ms.toFixed(1)}ms botP99=${s.botTickP99Ms.toFixed(1)}ms/${s.botTicks} backlog=${s.backlogMs}ms db=${s.dbMb.toFixed(1)}MB`,
            );
    }, 10_000);

    await Promise.all(humans);
    await warmupDone;
    clearInterval(sampler);
    const finalHealth = (await (
        await fetch(`${base}/api/health`)
    ).json()) as RunResult['finalHealth'];

    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));

    writeReport({
        config,
        setupMs,
        durationS: Math.round((Date.now() - started) / 1000),
        requests,
        statuses,
        wsLags,
        samples,
        finalHealth,
        warmupHealth,
        serverLog: log,
        dataDir,
        worldId: world.id,
        out: config.out,
    });
    console.log(`Bericht: ${config.out}`);
    fs.rmSync(dataDir, { recursive: true, force: true });
}

await main();
