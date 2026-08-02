import type { WebSocket } from '@fastify/websocket';
import {
    attitudeOf,
    BattleReportPayloadSchema,
    BuildRequestSchema,
    CreateWorldRequestSchema,
    NumericIdSchema,
    RecruitRequestSchema,
    SendResourcesRequestSchema,
    SendUnitsRequestSchema,
    UnitsSchema,
} from '@medival/shared';
import { desc, eq, inArray, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
    firstOrThrow,
    parseInput,
    parseJsonColumn,
} from '../db/parse.js';
import { movements, players, reports, villages } from '../db/schema.js';
import { PLAYER_ID } from '../engine/mapgen.js';
import { recruitUnits, sendUnits } from '../engine/military.js';
import { sendResources } from '../engine/trade.js';
import { GameError, type World } from '../engine/world.js';
import type { WorldManager } from '../engine/worldManager.js';

function requireWorld(manager: WorldManager, id: string): World {
    const world = manager.getWorld(Number(id));
    if (!world) throw new GameError('world_not_found');
    return world;
}

export function registerRoutes(
    app: FastifyInstance,
    manager: WorldManager,
): void {
    app.setErrorHandler((err, _req, reply) => {
        if (err instanceof GameError) {
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
        return worldSummary(world);
    });

    app.get<{ Params: { id: string } }>('/api/worlds/:id', (req) => {
        const world = requireWorld(manager, req.params.id);
        return worldSummary(world);
    });

    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/pause',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            world.pause();
            return worldSummary(world);
        },
    );

    app.post<{ Params: { id: string } }>(
        '/api/worlds/:id/resume',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            world.resume();
            return worldSummary(world);
        },
    );

    app.delete<{ Params: { id: string } }>('/api/worlds/:id', (req) => {
        return { deleted: manager.deleteWorld(Number(req.params.id)) };
    });

    app.get<{ Params: { id: string } }>(
        '/api/worlds/:id/map',
        (req) => {
            const world = requireWorld(manager, req.params.id);
            return world.db
                .select({
                    id: villages.id,
                    playerId: villages.playerId,
                    x: villages.x,
                    y: villages.y,
                    name: villages.name,
                    points: villages.points,
                })
                .from(villages)
                .all();
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
                    : world.settleStanding(playerId, PLAYER_ID);

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

function worldSummary(world: World) {
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
        playerVillages,
    };
}
