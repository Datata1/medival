/**
 * Ein Skriptspieler für die Lastprobe (plans/19-prototyp/19-15).
 *
 * Er benutzt nur die öffentliche API, genau wie der Client: anmelden,
 * beitreten, WebSocket öffnen, dann alle 5–30 s (exponentialverteilt) eine
 * Handlung. Spielfehler (4xx wie `not_enough_resources`) sind erwartet und
 * zählen getrennt; 5xx sind Serverfehler.
 */
import type WebSocketType from 'ws';

export interface Metrics {
    request(route: string, ms: number, status: number): void;
    wsLag(ms: number): void;
}

export interface HumanOptions {
    base: string;
    worldId: number;
    name: string;
    metrics: Metrics;
    deadline: number;
    rng: () => number;
    WebSocket: typeof WebSocketType;
}

const BUILDINGS = [
    'timber_camp',
    'clay_pit',
    'iron_mine',
    'farm',
    'warehouse',
    'headquarters',
    'barracks',
    'smithy',
    'wall',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runHuman(o: HumanOptions): Promise<void> {
    let cookie = '';
    const call = async (
        route: string,
        method: string,
        path: string,
        body?: unknown,
    ): Promise<unknown> => {
        const started = performance.now();
        const res = await fetch(o.base + path, {
            method,
            headers: {
                ...(body === undefined
                    ? {}
                    : { 'content-type': 'application/json' }),
                ...(cookie ? { cookie } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        o.metrics.request(
            route,
            performance.now() - started,
            res.status,
        );
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0] ?? '';
        return text ? JSON.parse(text) : null;
    };

    await call('register', 'POST', '/api/auth/register', {
        name: o.name,
        password: 'lastprobe-geheim',
    });
    const joined = (await call(
        'join',
        'POST',
        `/api/worlds/${o.worldId}/join`,
    )) as { playerVillages?: { id: number; x: number; y: number }[] };
    const home = joined.playerVillages?.[0];
    if (!home) throw new Error(`${o.name}: kein Dorf`);

    const ws = new o.WebSocket(
        `${o.base.replace('http', 'ws')}/api/worlds/${o.worldId}/ws`,
        { headers: { cookie } },
    );
    ws.on('message', (data) => {
        const msg = JSON.parse(String(data)) as { sentAt?: number };
        if (typeof msg.sentAt === 'number')
            o.metrics.wsLag(Date.now() - msg.sentAt);
    });
    ws.on('error', () => {});

    const village = `/api/worlds/${o.worldId}/villages/${home.id}`;
    const tile = (v: number) => Math.floor(v / 20);
    while (Date.now() < o.deadline) {
        const wait = Math.min(30, 5 + -Math.log(1 - o.rng()) * 8);
        await sleep(wait * 1000);
        if (Date.now() >= o.deadline) break;
        const roll = o.rng();
        if (roll < 0.3) {
            await call('village', 'GET', village);
        } else if (roll < 0.5) {
            const building =
                BUILDINGS[Math.floor(o.rng() * BUILDINGS.length)];
            await call('build', 'POST', `${village}/build`, {
                building,
            });
        } else if (roll < 0.65) {
            await call('recruit', 'POST', `${village}/recruit`, {
                unit: 'spear',
                count: 1 + Math.floor(o.rng() * 5),
            });
        } else if (roll < 0.85) {
            const tx = tile(home.x);
            const ty = tile(home.y);
            await call(
                'map/tiles',
                'GET',
                `/api/worlds/${o.worldId}/map/tiles?tx0=${tx - 2}&ty0=${ty - 2}&tx1=${tx + 2}&ty1=${ty + 2}`,
            );
        } else if (roll < 0.95) {
            await call(
                'reports',
                'GET',
                `/api/worlds/${o.worldId}/reports`,
            );
        } else {
            await attackNearestBarbarian(
                call,
                o.worldId,
                home,
                village,
            );
        }
    }
    ws.close();
}

async function attackNearestBarbarian(
    call: (
        route: string,
        method: string,
        path: string,
        body?: unknown,
    ) => Promise<unknown>,
    worldId: number,
    home: { x: number; y: number },
    village: string,
): Promise<void> {
    const view = (await call('village', 'GET', village)) as {
        units?: { spear?: number };
    };
    const spears = view.units?.spear ?? 0;
    if (spears < 5) return;
    const tx = Math.floor(home.x / 20);
    const ty = Math.floor(home.y / 20);
    const tiles = (await call(
        'map/tiles',
        'GET',
        `/api/worlds/${worldId}/map/tiles?tx0=${tx - 1}&ty0=${ty - 1}&tx1=${tx + 1}&ty1=${ty + 1}`,
    )) as {
        tiles?: {
            villages: {
                id: number;
                x: number;
                y: number;
                playerId: number | null;
            }[];
        }[];
    } | null;
    const barbarians = (tiles?.tiles ?? [])
        .flatMap((t) => t.villages)
        .filter((v) => v.playerId === null)
        .sort(
            (a, b) =>
                Math.hypot(a.x - home.x, a.y - home.y) -
                Math.hypot(b.x - home.x, b.y - home.y),
        );
    const target = barbarians[0];
    if (!target) return;
    await call('send', 'POST', `${village}/send`, {
        target: target.id,
        kind: 'attack',
        units: { spear: spears },
    });
}
