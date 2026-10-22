import type { WebSocket } from '@fastify/websocket';
import {
    AcceptInvitationRequestSchema,
    attitudeOf,
    BattleReportPayloadSchema,
    BuildRequestSchema,
    CreateWorldRequestSchema,
    DevSkipRequestSchema,
    Duration,
    distance,
    FoundTribeRequestSchema,
    InvitePlayerRequestSchema,
    MapPointQuerySchema,
    MapTilesQuerySchema,
    NumericIdSchema,
    PLAYER_ID,
    RecruitRequestSchema,
    SendResourcesRequestSchema,
    SendUnitsRequestSchema,
    TILE_SIZE,
    tileKey,
    tileOf,
    UnitsSchema,
} from '@medival/shared';
import { and, asc, between, desc, eq, inArray, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
    firstOrThrow,
    parseInput,
    parseJsonColumn,
} from '../db/parse.js';
import {
    movements,
    players,
    reports,
    tribeInvitations,
    tribes,
    villages,
} from '../db/schema.js';
import { recruitUnits, sendUnits } from '../engine/military.js';
import { sendResources } from '../engine/trade.js';
import {
    acceptInvitation,
    foundTribe,
    invitePlayer,
    leaveTribe,
    pruneInvitations,
    tribeInfo,
    tribeOf,
    tribeTags,
} from '../engine/tribes.js';
import { GameError, type World } from '../engine/world.js';
import type { WorldManager } from '../engine/worldManager.js';

/**
 * Die Welt einer Anfrage — **nachgeholt bis jetzt** (plans/19-prototyp/19-2).
 *
 * Jede Route, die eine Welt liest oder ändert, kommt hier vorbei. Deshalb
 * steht das Nachholen genau hier: Kein Befehl und keine Ansicht sieht einen
 * Zustand, in dem ein schon fälliges Event noch fehlt.
 */
function requireWorld(manager: WorldManager, id: string): World {
    const world = manager.getWorld(Number(id));
    if (!world) throw new GameError('world_not_found');
    world.catchUp();
    return world;
}

export interface RouteOptions {
    /** Entwicklermodus: Pause und Vorspulen (19-3). */
    devMode: boolean;
}

export function registerRoutes(
    app: FastifyInstance,
    manager: WorldManager,
    options: RouteOptions = { devMode: false },
): void {
    app.setErrorHandler((err, _req, reply) => {
        if (err instanceof GameError) {
            // Die Welt arbeitet einen großen Rückstand ab (19-2): später
            // wiederkommen, nicht „fehlerhafter Aufruf".
            if (err.message === 'catching_up')
                return reply
                    .status(503)
                    .header('Retry-After', '1')
                    .send({ error: err.message });
            // „Nicht gefunden" ist semantisch ein 404, alles andere ein
            // fehlerhafter Aufruf (400).
            const status = err.message.endsWith('_not_found')
                ? 404
                : 400;
            return reply.status(status).send({ error: err.message });
        }
        app.log.error(err);
        return reply.status(500).send({ error: 'internal' });
    });

    app.get('/api/worlds', () => manager.listWorlds());

    app.get('/api/health', () =>
        manager.health.snapshot(manager.loadedWorlds()),
    );

    app.post('/api/worlds', (req) => {
        // Geparst statt gecastet: vorher lief {"speed":"schnell"} bis in
        // buildTime() durch und schrieb NaN-Zeitstempel in die Welt-Datei
        // (plans/08-no-typecasting.md).
        const body = parseInput(
            CreateWorldRequestSchema,
            req.body ?? {},
        );
        const world = manager.createWorld(
            body.name ?? 'Neue Welt',
            body.settings ?? {},
        );
        return worldSummary(world, options.devMode);
    });

    app.get<{ Params: { id: string } }>('/api/worlds/:id', (req) => {
        const world = requireWorld(manager, req.params.id);
        return worldSummary(world, options.devMode);
    });

    /*
     * Pause und Vorspulen gibt es nur im Entwicklermodus (19-3). In einer
     * Mehrspielerwelt hielte eine Pause die Welt für alle an — und jede
     * verabredete Ankunftszeit wäre hinfällig. Ohne Entwicklermodus
     * existieren die Routen nicht (404). Ab 19-8 zusätzlich nur für Admins.
     */
    if (options.devMode) {
        app.post<{ Params: { id: string } }>(
            '/api/worlds/:id/pause',
            (req) => {
                const world = requireWorld(manager, req.params.id);
                world.pause();
                return worldSummary(world, true);
            },
        );

        app.post<{ Params: { id: string } }>(
            '/api/worlds/:id/resume',
            (req) => {
                const world = requireWorld(manager, req.params.id);
                world.resume();
                return worldSummary(world, true);
            },
        );

        app.post<{ Params: { id: string } }>(
            '/api/worlds/:id/dev/skip',
            (req) => {
                const world = requireWorld(manager, req.params.id);
                const body = parseInput(DevSkipRequestSchema, req.body);
                world.devSkip(Duration.ms(body.ms));
                return worldSummary(world, true);
            },
        );
    }

    app.delete<{ Params: { id: string } }>('/api/worlds/:id', (req) => {
        return { deleted: manager.deleteWorld(Number(req.params.id)) };
    });

    /*
     * Karte in Kacheln (plans/19-prototyp/19-7). Vorher lieferte `/map` alle
     * Dörfer der Welt in einer Antwort; auf 1000×1000 mit zehntausenden
     * Dörfern wären das Megabytes je Abruf.
     */
    app.get<{ Params: { id: string } }>(
        '/api/worlds/:id/map/tiles',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const q = parseInput(MapTilesQuerySchema, req.query);
            const x0 = q.tx0 * TILE_SIZE;
            const y0 = q.ty0 * TILE_SIZE;
            const rows = mapVillagesInBox(
                world,
                x0,
                y0,
                (q.tx1 + 1) * TILE_SIZE - 1,
                (q.ty1 + 1) * TILE_SIZE - 1,
            );
            const byTile = new Map<string, typeof rows>();
            for (const v of rows) {
                const { tx, ty } = tileOf(v.x, v.y);
                const key = tileKey(tx, ty);
                byTile.set(key, [...(byTile.get(key) ?? []), v]);
            }
            // Auch leere Kacheln: Der Client merkt sich, dass dort nichts ist.
            const tiles = [];
            for (let tx = q.tx0; tx <= q.tx1; tx++)
                for (let ty = q.ty0; ty <= q.ty1; ty++)
                    tiles.push({
                        tx,
                        ty,
                        villages: byTile.get(tileKey(tx, ty)) ?? [],
                    });
            return { tiles };
        },
    );

    // Das Dorf auf einem Feld — für die Zielauswahl nach Koordinaten.
    app.get<{ Params: { id: string } }>(
        '/api/worlds/:id/map/at',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const { x, y } = parseInput(MapPointQuerySchema, req.query);
            return {
                village: mapVillagesInBox(world, x, y, x, y)[0] ?? null,
            };
        },
    );

    // ── Stämme (Plan 17) ──────────────────────────────────────────────

    app.get<{ Params: { id: string } }>(
        '/api/worlds/:id/diplomacy',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            pruneInvitations(world);
            const now = world.now();
            const tags = tribeTags(world);

            const own = tribeOf(world, PLAYER_ID);
            const homes = world.db
                .select({ x: villages.x, y: villages.y })
                .from(villages)
                .where(eq(villages.playerId, PLAYER_ID))
                .all();
            const allVillages = world.db
                .select({
                    playerId: villages.playerId,
                    x: villages.x,
                    y: villages.y,
                    points: villages.points,
                })
                .from(villages)
                .all();

            const list = world.db
                .select()
                .from(players)
                .all()
                .filter((p) => p.id !== PLAYER_ID)
                .map((p) => {
                    const mine = allVillages.filter(
                        (v) => v.playerId === p.id,
                    );
                    let dist = Number.POSITIVE_INFINITY;
                    for (const home of homes)
                        for (const v of mine)
                            dist = Math.min(
                                dist,
                                distance(home.x, home.y, v.x, v.y),
                            );
                    const standing = world.effectiveStanding(
                        p.id,
                        PLAYER_ID,
                        now,
                    );
                    return {
                        id: p.id,
                        name: p.name,
                        isBot: p.isBot,
                        points: mine.reduce((s, v) => s + v.points, 0),
                        tribeTag: tags.get(p.id) ?? null,
                        standing,
                        attitude: attitudeOf(standing),
                        distance: Number.isFinite(dist)
                            ? Math.round(dist * 10) / 10
                            : 0,
                    };
                })
                // Ohne Dörfer ist ein Spieler aus dem Spiel.
                .filter((p) => p.points > 0 || p.tribeTag !== null)
                .sort((a, b) => a.distance - b.distance);

            const invitations = world.db
                .select()
                .from(tribeInvitations)
                .where(eq(tribeInvitations.playerId, PLAYER_ID))
                .all()
                .map((row) => {
                    const tribe = world.db
                        .select()
                        .from(tribes)
                        .where(eq(tribes.id, row.tribeId))
                        .all()[0];
                    return {
                        tribeId: row.tribeId,
                        tribeName: tribe?.name ?? '?',
                        tribeTag: tribe?.tag ?? '?',
                        expiresGameTime: row.expiresGameTime,
                    };
                });

            return {
                tribe: own === null ? null : tribeInfo(world, own),
                players: list,
                invitations,
                gameTime: now,
            };
        },
    );

    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/tribe',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const body = parseInput(FoundTribeRequestSchema, req.body);
            foundTribe(world, PLAYER_ID, body.name, body.tag);
            return { ok: true };
        },
    );

    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/tribe/invite',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const body = parseInput(
                InvitePlayerRequestSchema,
                req.body,
            );
            invitePlayer(world, PLAYER_ID, body.playerId);
            return { ok: true };
        },
    );

    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/tribe/accept',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const body = parseInput(
                AcceptInvitationRequestSchema,
                req.body,
            );
            acceptInvitation(world, PLAYER_ID, body.tribeId);
            return { ok: true };
        },
    );

    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/tribe/leave',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            leaveTribe(world, PLAYER_ID);
            return { ok: true };
        },
    );

    app.get<{ Params: { id: string; playerId: string } }>(
        '/api/worlds/:id/players/:playerId',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const playerId = parseInput(
                NumericIdSchema,
                req.params.playerId,
            );

            const player = firstOrThrow(
                world.db
                    .select()
                    .from(players)
                    .where(eq(players.id, playerId))
                    .all(),
                'player_not_found',
            );

            const owned = world.db
                .select({
                    id: villages.id,
                    name: villages.name,
                    x: villages.x,
                    y: villages.y,
                    points: villages.points,
                })
                .from(villages)
                .where(eq(villages.playerId, playerId))
                .all();
            const totalPoints = owned.reduce(
                (sum, v) => sum + v.points,
                0,
            );

            // Rang: wie viele Spieler mehr Punkte haben, plus eins.
            const pointsByPlayer = new Map<number, number>();
            for (const row of world.db
                .select({
                    playerId: villages.playerId,
                    points: villages.points,
                })
                .from(villages)
                .all()) {
                if (row.playerId === null) continue; // Barbaren zählen nicht mit
                pointsByPlayer.set(
                    row.playerId,
                    (pointsByPlayer.get(row.playerId) ?? 0) +
                        row.points,
                );
            }
            const ahead = [...pointsByPlayer.values()].filter(
                (points) => points > totalPoints,
            ).length;

            // Asymmetrisch: die Sicht *dieses* Spielers auf uns, nicht
            // umgekehrt (plans/16-ansehen-und-handel.md).
            const standing =
                playerId === PLAYER_ID
                    ? null
                    : world.effectiveStanding(playerId, PLAYER_ID);

            return {
                id: player.id,
                name: player.name,
                isBot: player.isBot,
                personality: player.isBot ? player.personality : null,
                villageCount: owned.length,
                totalPoints,
                rank: ahead + 1,
                villages: owned,
                standing,
                attitude:
                    standing === null ? null : attitudeOf(standing),
                tribeTag: tribeTags(world).get(playerId) ?? null,
            };
        },
    );

    app.post<{ Params: { id: string; vid: string } }>(
        '/api/worlds/:id/villages/:vid/ship',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const villageId = parseInput(
                NumericIdSchema,
                req.params.vid,
            );
            const body = parseInput(
                SendResourcesRequestSchema,
                req.body,
            );
            const result = sendResources(
                world,
                villageId,
                body.target,
                body.resources,
            );
            return { ...result, gameTime: world.now() };
        },
    );

    app.get<{ Params: { id: string; vid: string } }>(
        '/api/worlds/:id/villages/:vid',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            return world.villageView(Number(req.params.vid));
        },
    );

    app.post<{ Params: { id: string; vid: string } }>(
        '/api/worlds/:id/villages/:vid/build',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const villageId = parseInput(
                NumericIdSchema,
                req.params.vid,
            );
            const body = parseInput(BuildRequestSchema, req.body);
            world.upgradeBuilding(villageId, body.building);
            return world.villageView(villageId);
        },
    );

    app.post<{ Params: { id: string; vid: string } }>(
        '/api/worlds/:id/villages/:vid/recruit',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const villageId = parseInput(
                NumericIdSchema,
                req.params.vid,
            );
            const body = parseInput(RecruitRequestSchema, req.body);
            recruitUnits(world, villageId, body.unit, body.count);
            return world.villageView(villageId);
        },
    );

    app.post<{ Params: { id: string; vid: string } }>(
        '/api/worlds/:id/villages/:vid/send',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const villageId = parseInput(
                NumericIdSchema,
                req.params.vid,
            );
            const body = parseInput(SendUnitsRequestSchema, req.body);
            const result = sendUnits(
                world,
                villageId,
                body.target,
                body.kind,
                body.units,
            );
            return { ...result, gameTime: world.now() };
        },
    );

    app.get<{ Params: { id: string } }>(
        '/api/worlds/:id/movements',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const own = world.db
                .select({ id: villages.id })
                .from(villages)
                .where(eq(villages.playerId, PLAYER_ID))
                .all()
                .map((v) => v.id);
            if (own.length === 0)
                return {
                    gameTime: world.now(),
                    incoming: [],
                    outgoing: [],
                };
            const rows = world.db
                .select()
                .from(movements)
                .where(
                    or(
                        inArray(movements.originVillageId, own),
                        inArray(movements.targetVillageId, own),
                    ),
                )
                .all();
            const names = new Map(
                world.db
                    .select({
                        id: villages.id,
                        name: villages.name,
                        x: villages.x,
                        y: villages.y,
                    })
                    .from(villages)
                    .all()
                    .map((v) => [v.id, v]),
            );
            const describe = (
                m: (typeof rows)[number],
                hideUnits: boolean,
            ) => ({
                id: m.id,
                kind: m.kind,
                origin: names.get(m.originVillageId),
                target: names.get(m.targetVillageId),
                departureGameTime: m.departureGameTime,
                arrivalGameTime: m.arrivalGameTime,
                units: hideUnits
                    ? null
                    : parseJsonColumn(
                          UnitsSchema,
                          m.unitsJson,
                          'movement.units',
                      ),
            });
            return {
                gameTime: world.now(),
                outgoing: rows
                    .filter((m) => own.includes(m.originVillageId))
                    .map((m) => describe(m, false)),
                incoming: rows
                    .filter(
                        (m) =>
                            own.includes(m.targetVillageId) &&
                            !own.includes(m.originVillageId),
                    )
                    .map((m) => describe(m, true)), // enemy army composition stays hidden
            };
        },
    );

    app.get<{ Params: { id: string } }>(
        '/api/worlds/:id/reports',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            const rows = world.db
                .select()
                .from(reports)
                .where(eq(reports.playerId, PLAYER_ID))
                .orderBy(desc(reports.id))
                .limit(50)
                .all();
            return rows.map((r) => ({
                id: r.id,
                type: r.type,
                createdGameTime: r.createdGameTime,
                read: r.read,
                payload: parseJsonColumn(
                    BattleReportPayloadSchema,
                    r.payload,
                    'report.payload',
                ),
            }));
        },
    );

    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/reports/read',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            world.db
                .update(reports)
                .set({ read: true })
                .where(eq(reports.playerId, PLAYER_ID))
                .run();
            return { ok: true };
        },
    );

    app.get<{ Params: { id: string } }>(
        '/api/worlds/:id/ws',
        { websocket: true },
        (socket: WebSocket, req) => {
            const world = manager.getWorld(Number(req.params.id));
            if (!world) {
                socket.close();
                return;
            }
            const unsubscribe = world.subscribe((msg) => {
                if (socket.readyState === socket.OPEN)
                    socket.send(JSON.stringify(msg));
            });
            socket.on('close', unsubscribe);
        },
    );
}

/** Kartendörfer im Rechteck, samt Stammeskürzel des Besitzers (19-7). */
function mapVillagesInBox(
    world: World,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
) {
    return world.db
        .select({
            id: villages.id,
            playerId: villages.playerId,
            x: villages.x,
            y: villages.y,
            name: villages.name,
            points: villages.points,
            tribeTag: tribes.tag,
        })
        .from(villages)
        .leftJoin(players, eq(players.id, villages.playerId))
        .leftJoin(tribes, eq(tribes.id, players.tribeId))
        .where(
            and(
                between(villages.x, x0, x1),
                between(villages.y, y0, y1),
            ),
        )
        .orderBy(asc(villages.id))
        .all();
}

function worldSummary(world: World, devMode: boolean) {
    const playerVillages = world.db
        .select({
            id: villages.id,
            name: villages.name,
            x: villages.x,
            y: villages.y,
            points: villages.points,
        })
        .from(villages)
        .where(eq(villages.playerId, PLAYER_ID))
        .all();
    return {
        id: world.id,
        name: world.name,
        status: world.status,
        settings: world.settings,
        gameTime: world.now(),
        epochZeroMs: world.clock.epochZeroMs,
        devMode,
        playerVillages,
    };
}
