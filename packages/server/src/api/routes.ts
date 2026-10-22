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
    RecruitRequestSchema,
    ScoutReportPayloadSchema,
    SendResourcesRequestSchema,
    SendUnitsRequestSchema,
    TILE_SIZE,
    tileKey,
    tileOf,
    UnitsSchema,
} from '@medival/shared';
import { and, asc, between, desc, eq, inArray, or } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAccount, requireAdmin } from '../auth/plugin.js';
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
import { settleNewPlayer } from '../engine/settle.js';
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

/** HTTP-Status der Anmelde- und Rechtefehler (19-8). */
const AUTH_STATUS: Readonly<Record<string, number | undefined>> = {
    not_authenticated: 401,
    invalid_credentials: 401,
    forbidden: 403,
    not_joined: 403,
    village_not_owned: 403,
    already_joined: 409,
    name_taken: 409,
    too_many_attempts: 429,
};

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
            // „Nicht gefunden" ist semantisch ein 404, Anmeldung und Rechte
            // haben eigene Codes (19-8), alles andere ist ein fehlerhafter
            // Aufruf (400).
            const status = err.message.endsWith('_not_found')
                ? 404
                : (AUTH_STATUS[err.message] ?? 400);
            return reply.status(status).send({ error: err.message });
        }
        app.log.error(err);
        return reply.status(500).send({ error: 'internal' });
    });

    /*
     * Wer fragt, in welcher Welt, als welcher Spieler (19-9). Jede Weltroute
     * verlangt einen angemeldeten Account; Spielrouten zusätzlich, dass er
     * in der Welt mitspielt.
     */
    const worldOf = (req: FastifyRequest, id: string): World => {
        requireAccount(req);
        return requireWorld(manager, id);
    };
    const playerIdOf = (
        world: World,
        req: FastifyRequest,
    ): number | null => {
        const account = requireAccount(req);
        return (
            world.db
                .select({ id: players.id })
                .from(players)
                .where(eq(players.accountId, account.id))
                .all()[0]?.id ?? null
        );
    };
    const playerOf = (world: World, req: FastifyRequest): number => {
        const id = playerIdOf(world, req);
        if (id === null) throw new GameError('not_joined');
        return id;
    };
    /** Kommandos auf ein Dorf nur durch seinen Besitzer (19-9). */
    const ownVillage = (
        world: World,
        req: FastifyRequest,
        vid: string,
    ): { me: number; villageId: number } => {
        const me = playerOf(world, req);
        const villageId = parseInput(NumericIdSchema, vid);
        if (world.getVillageRow(villageId).playerId !== me)
            throw new GameError('village_not_owned');
        return { me, villageId };
    };

    app.get('/api/worlds', (req) => {
        const account = requireAccount(req);
        const joined = manager.membershipsOf(account.id);
        return manager
            .listWorlds()
            .map((w) => ({ ...w, joined: joined.has(w.id) }));
    });

    /*
     * Einer Welt beitreten (19-9): ein Spieler für den Account, sein Dorf am
     * Rand des Siedlungskreises (19-6). Je Welt höchstens einmal.
     */
    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/join',
        (req) => {
            const world = worldOf(req, req.params.id);
            const account = requireAccount(req);
            if (playerIdOf(world, req) !== null)
                throw new GameError('already_joined');
            const playerId = firstOrThrow(
                world.db
                    .insert(players)
                    .values({
                        name: account.name,
                        isBot: false,
                        accountId: account.id,
                    })
                    .returning({ id: players.id })
                    .all(),
                'internal',
            ).id;
            settleNewPlayer(world, playerId, `${account.name}s Dorf`);
            manager.recordMembership(world.id, account.id, playerId);
            return worldSummary(world, options.devMode, playerId);
        },
    );

    app.get('/api/health', () =>
        manager.health.snapshot(manager.loadedWorlds()),
    );

    app.post('/api/worlds', (req) => {
        // Welten anlegen ist Verwaltung, nicht Spiel (19-8).
        requireAdmin(req);
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
        return worldSummary(
            world,
            options.devMode,
            playerIdOf(world, req),
        );
    });

    app.get<{ Params: { id: string } }>('/api/worlds/:id', (req) => {
        const world = worldOf(req, req.params.id);
        return worldSummary(
            world,
            options.devMode,
            playerIdOf(world, req),
        );
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
                requireAdmin(req);
                const world = worldOf(req, req.params.id);
                world.pause();
                return worldSummary(
                    world,
                    true,
                    playerIdOf(world, req),
                );
            },
        );

        app.post<{ Params: { id: string } }>(
            '/api/worlds/:id/resume',
            (req) => {
                requireAdmin(req);
                const world = worldOf(req, req.params.id);
                world.resume();
                return worldSummary(
                    world,
                    true,
                    playerIdOf(world, req),
                );
            },
        );

        app.post<{ Params: { id: string } }>(
            '/api/worlds/:id/dev/skip',
            (req) => {
                requireAdmin(req);
                const world = worldOf(req, req.params.id);
                const body = parseInput(DevSkipRequestSchema, req.body);
                world.devSkip(Duration.ms(body.ms));
                return worldSummary(
                    world,
                    true,
                    playerIdOf(world, req),
                );
            },
        );
    }

    app.delete<{ Params: { id: string } }>('/api/worlds/:id', (req) => {
        requireAdmin(req);
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
            const world = worldOf(req, req.params.id);
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
            const world = worldOf(req, req.params.id);
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
            const world = worldOf(req, req.params.id);
            const me = playerOf(world, req);
            pruneInvitations(world);
            const now = world.now();
            const tags = tribeTags(world);

            const own = tribeOf(world, me);
            const homes = world.db
                .select({ x: villages.x, y: villages.y })
                .from(villages)
                .where(eq(villages.playerId, me))
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
                .filter((p) => p.id !== me)
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
                        me,
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
                .where(eq(tribeInvitations.playerId, me))
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
            const world = worldOf(req, req.params.id);
            const me = playerOf(world, req);
            const body = parseInput(FoundTribeRequestSchema, req.body);
            foundTribe(world, me, body.name, body.tag);
            return { ok: true };
        },
    );

    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/tribe/invite',
        (req) => {
            const world = worldOf(req, req.params.id);
            const me = playerOf(world, req);
            const body = parseInput(
                InvitePlayerRequestSchema,
                req.body,
            );
            invitePlayer(world, me, body.playerId);
            return { ok: true };
        },
    );

    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/tribe/accept',
        (req) => {
            const world = worldOf(req, req.params.id);
            const me = playerOf(world, req);
            const body = parseInput(
                AcceptInvitationRequestSchema,
                req.body,
            );
            acceptInvitation(world, me, body.tribeId);
            return { ok: true };
        },
    );

    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/tribe/leave',
        (req) => {
            const world = worldOf(req, req.params.id);
            const me = playerOf(world, req);
            leaveTribe(world, me);
            return { ok: true };
        },
    );

    app.get<{ Params: { id: string; playerId: string } }>(
        '/api/worlds/:id/players/:playerId',
        (req) => {
            const world = worldOf(req, req.params.id);
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
            const me = playerIdOf(world, req);
            const standing =
                me === null || playerId === me
                    ? null
                    : world.effectiveStanding(playerId, me);

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
            const world = worldOf(req, req.params.id);
            const { villageId } = ownVillage(
                world,
                req,
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
            const world = worldOf(req, req.params.id);
            // Fremde Dörfer gibt es nur als Kartendaten (19-9).
            const { villageId } = ownVillage(
                world,
                req,
                req.params.vid,
            );
            return world.villageView(villageId);
        },
    );

    app.post<{ Params: { id: string; vid: string } }>(
        '/api/worlds/:id/villages/:vid/build',
        (req) => {
            const world = worldOf(req, req.params.id);
            const { villageId } = ownVillage(
                world,
                req,
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
            const world = worldOf(req, req.params.id);
            const { villageId } = ownVillage(
                world,
                req,
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
            const world = worldOf(req, req.params.id);
            const { villageId } = ownVillage(
                world,
                req,
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
            const world = worldOf(req, req.params.id);
            const me = playerOf(world, req);
            const own = world.db
                .select({ id: villages.id })
                .from(villages)
                .where(eq(villages.playerId, me))
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
            const world = worldOf(req, req.params.id);
            const me = playerOf(world, req);
            const rows = world.db
                .select()
                .from(reports)
                .where(eq(reports.playerId, me))
                .orderBy(desc(reports.id))
                .limit(50)
                .all();
            // Die Nutzlast je nach Art lesen (19-10: Spähberichte).
            return rows.map((r) => {
                const base = {
                    id: r.id,
                    createdGameTime: r.createdGameTime,
                    read: r.read,
                };
                return r.type === 'scout' || r.type === 'scout_defense'
                    ? {
                          ...base,
                          type: r.type,
                          payload: parseJsonColumn(
                              ScoutReportPayloadSchema,
                              r.payload,
                              'report.payload',
                          ),
                      }
                    : {
                          ...base,
                          type:
                              r.type === 'defense'
                                  ? 'defense'
                                  : 'attack',
                          payload: parseJsonColumn(
                              BattleReportPayloadSchema,
                              r.payload,
                              'report.payload',
                          ),
                      };
            });
        },
    );

    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/reports/read',
        (req) => {
            const world = worldOf(req, req.params.id);
            const me = playerOf(world, req);
            world.db
                .update(reports)
                .set({ read: true })
                .where(eq(reports.playerId, me))
                .run();
            return { ok: true };
        },
    );

    app.get<{ Params: { id: string } }>(
        '/api/worlds/:id/ws',
        { websocket: true },
        (socket: WebSocket, req) => {
            // Ohne Session kein Live-Kanal (19-8); 4401 nach dem Vorbild
            // von HTTP 401, im Bereich der anwendungseigenen Codes.
            if (!req.account) {
                socket.close(4401, 'not_authenticated');
                return;
            }
            const world = manager.getWorld(Number(req.params.id));
            if (!world) {
                socket.close();
                return;
            }
            // Nur, was diesen Spieler betrifft, und Öffentliches (19-9).
            const unsubscribe = world.subscribe(
                playerIdOf(world, req),
                (msg) => {
                    if (socket.readyState === socket.OPEN)
                        socket.send(JSON.stringify(msg));
                },
            );
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

function worldSummary(
    world: World,
    devMode: boolean,
    playerId: number | null,
) {
    const playerVillages = world.db
        .select({
            id: villages.id,
            name: villages.name,
            x: villages.x,
            y: villages.y,
            points: villages.points,
        })
        .from(villages)
        .where(eq(villages.playerId, playerId ?? -1))
        .all();
    return {
        id: world.id,
        name: world.name,
        status: world.status,
        settings: world.settings,
        gameTime: world.now(),
        epochZeroMs: world.clock.epochZeroMs,
        devMode,
        playerId,
        playerVillages,
    };
}
