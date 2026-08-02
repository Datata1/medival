import { Duration, GameTime } from '@medival/shared';
import { and, eq, lt } from 'drizzle-orm';
import { firstOrThrow } from '../db/parse.js';
import {
    players,
    tribeInvitations,
    tribes,
    villages,
} from '../db/schema.js';
import { GameError } from './errors.js';
import type { World } from './world.js';

/**
 * Stämme (siehe plans/17-staemme-und-krieg.md).
 *
 * Dieselben Kommandos für Spieler und Bots — kein zweiter Regelsatz, wie
 * schon beim Bauen und Rekrutieren.
 */

/** Wie lange eine Einladung offen bleibt. */
export const INVITATION_LIFETIME = Duration.hours(24);

const MAX_TAG = 5;
const MAX_NAME = 40;

export interface TribeInfo {
    id: number;
    name: string;
    tag: string;
    founderId: number;
    members: {
        id: number;
        name: string;
        points: number;
        villageCount: number;
    }[];
}

function normalizeTag(raw: string): string {
    const tag = raw.trim().toUpperCase().slice(0, MAX_TAG);
    if (tag.length === 0) throw new GameError('tribe_tag_required');
    return tag;
}

/** Läuft vor jeder Abfrage: Abgelaufene Einladungen sind keine mehr. */
export function pruneInvitations(world: World): void {
    world.db
        .delete(tribeInvitations)
        .where(lt(tribeInvitations.expiresGameTime, world.now()))
        .run();
}

export function tribeOf(world: World, playerId: number): number | null {
    const row = world.db
        .select({ tribeId: players.tribeId })
        .from(players)
        .where(eq(players.id, playerId))
        .all()[0];
    return row?.tribeId ?? null;
}

/** Sind zwei Spieler im selben Stamm? `null` zählt nie als gemeinsam. */
export function sameTribe(
    world: World,
    a: number | null,
    b: number | null,
): boolean {
    if (a === null || b === null) return false;
    if (a === b) return true;
    const tribeA = tribeOf(world, a);
    return tribeA !== null && tribeA === tribeOf(world, b);
}

export function foundTribe(
    world: World,
    playerId: number,
    name: string,
    tag: string,
): number {
    if (tribeOf(world, playerId) !== null)
        throw new GameError('already_in_tribe');
    const cleanName = name.trim().slice(0, MAX_NAME);
    if (cleanName.length === 0)
        throw new GameError('tribe_name_required');
    const cleanTag = normalizeTag(tag);

    let tribeId = 0;
    world.sqlite.transaction(() => {
        const row = firstOrThrow(
            world.db
                .insert(tribes)
                .values({
                    name: cleanName,
                    tag: cleanTag,
                    founderId: playerId,
                    createdGameTime: world.now(),
                })
                .returning({ id: tribes.id })
                .all(),
            'internal',
        );
        tribeId = row.id;
        world.db
            .update(players)
            .set({ tribeId })
            .where(eq(players.id, playerId))
            .run();
    })();
    world.broadcast({ type: 'tribe', tribeId });
    return tribeId;
}

export function invitePlayer(
    world: World,
    inviterId: number,
    inviteeId: number,
): void {
    const tribeId = tribeOf(world, inviterId);
    if (tribeId === null) throw new GameError('not_in_tribe');
    if (inviterId === inviteeId) throw new GameError('invite_self');
    if (tribeOf(world, inviteeId) !== null)
        throw new GameError('already_in_tribe');

    const now = world.now();
    world.sqlite
        .prepare(
            `INSERT INTO tribe_invitations
                 (tribe_id, player_id, created_game_time, expires_game_time)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(tribe_id, player_id)
             DO UPDATE SET created_game_time = excluded.created_game_time,
                           expires_game_time = excluded.expires_game_time`,
        )
        .run(
            tribeId,
            inviteeId,
            now,
            GameTime.add(now, INVITATION_LIFETIME),
        );
    world.broadcast({ type: 'tribe', tribeId });
}

export function acceptInvitation(
    world: World,
    playerId: number,
    tribeId: number,
): void {
    pruneInvitations(world);
    if (tribeOf(world, playerId) !== null)
        throw new GameError('already_in_tribe');
    const invitation = world.db
        .select()
        .from(tribeInvitations)
        .where(
            and(
                eq(tribeInvitations.playerId, playerId),
                eq(tribeInvitations.tribeId, tribeId),
            ),
        )
        .all()[0];
    if (!invitation) throw new GameError('no_invitation');

    world.sqlite.transaction(() => {
        world.db
            .update(players)
            .set({ tribeId })
            .where(eq(players.id, playerId))
            .run();
        // Alle übrigen Einladungen dieses Spielers verfallen mit dem Beitritt.
        world.db
            .delete(tribeInvitations)
            .where(eq(tribeInvitations.playerId, playerId))
            .run();
    })();
    world.broadcast({ type: 'tribe', tribeId });
}

export function leaveTribe(world: World, playerId: number): void {
    const tribeId = tribeOf(world, playerId);
    if (tribeId === null) throw new GameError('not_in_tribe');
    world.sqlite.transaction(() => {
        world.db
            .update(players)
            .set({ tribeId: null })
            .where(eq(players.id, playerId))
            .run();
        // Ein Stamm ohne Mitglieder verschwindet, statt als Karteileiche zu
        // bleiben und Einladungen ins Leere zu schicken.
        const left = world.db
            .select({ id: players.id })
            .from(players)
            .where(eq(players.tribeId, tribeId))
            .all();
        if (left.length === 0) {
            world.db
                .delete(tribeInvitations)
                .where(eq(tribeInvitations.tribeId, tribeId))
                .run();
            world.db.delete(tribes).where(eq(tribes.id, tribeId)).run();
        }
    })();
    world.broadcast({ type: 'tribe', tribeId });
}

export function tribeInfo(
    world: World,
    tribeId: number,
): TribeInfo | null {
    const tribe = world.db
        .select()
        .from(tribes)
        .where(eq(tribes.id, tribeId))
        .all()[0];
    if (!tribe) return null;

    const memberRows = world.db
        .select({ id: players.id, name: players.name })
        .from(players)
        .where(eq(players.tribeId, tribeId))
        .all();
    const owned = world.db
        .select({
            playerId: villages.playerId,
            points: villages.points,
        })
        .from(villages)
        .all();

    const members = memberRows.map((m) => {
        const mine = owned.filter((v) => v.playerId === m.id);
        return {
            id: m.id,
            name: m.name,
            points: mine.reduce((s, v) => s + v.points, 0),
            villageCount: mine.length,
        };
    });
    members.sort((a, b) => b.points - a.points);

    return {
        id: tribe.id,
        name: tribe.name,
        tag: tribe.tag,
        founderId: tribe.founderId,
        members,
    };
}

/** Alle Stammeskürzel, für Karte und Profil. */
export function tribeTags(world: World): Map<number, string> {
    const rows = world.db
        .select({ id: players.id, tribeId: players.tribeId })
        .from(players)
        .all();
    const byTribe = new Map(
        world.db
            .select({ id: tribes.id, tag: tribes.tag })
            .from(tribes)
            .all()
            .map((t) => [t.id, t.tag] as const),
    );
    const out = new Map<number, string>();
    for (const row of rows) {
        const tag =
            row.tribeId === null ? undefined : byTribe.get(row.tribeId);
        if (tag) out.set(row.id, tag);
    }
    return out;
}
