import {
    BUILDING_ORDER,
    MOVEMENT_KINDS,
    UNIT_ORDER,
} from '@medival/shared';
import {
    index,
    integer,
    real,
    sqliteTable,
    text,
    unique,
} from 'drizzle-orm/sqlite-core';

// ── Per-world database ────────────────────────────────────────────────

export const players = sqliteTable('players', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    isBot: integer('is_bot', { mode: 'boolean' })
        .notNull()
        .default(true),
    personality: text('personality'),
    difficulty: text('difficulty'),
    aiState: text('ai_state_json').notNull().default('{}'),
    tribeId: integer('tribe_id'),
});

/**
 * Stämme (plans/17-staemme-und-krieg.md). Die Mitgliedschaft steht als Spalte
 * in `players`, nicht in einer eigenen Tabelle: Ein Spieler kann in genau
 * einem Stamm sein, und diese Regel gehört ins Datenmodell statt in die
 * Anwendungslogik.
 */
export const tribes = sqliteTable('tribes', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    /** Kürzel für Karte und Profil — ohne das sieht man nie, wer zu wem gehört. */
    tag: text('tag').notNull(),
    founderId: integer('founder_id').notNull(),
    createdGameTime: integer('created_game_time').notNull().default(0),
});

/**
 * Offene Einladungen. Mit Ablauf, denn ohne ihn tritt ein Bot, der vor drei
 * Spielwochen freundlich war, plötzlich einem Stamm bei, den er inzwischen
 * bekämpft.
 */
export const tribeInvitations = sqliteTable(
    'tribe_invitations',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        tribeId: integer('tribe_id').notNull(),
        playerId: integer('player_id').notNull(),
        createdGameTime: integer('created_game_time').notNull(),
        expiresGameTime: integer('expires_game_time').notNull(),
    },
    (t) => [
        unique().on(t.tribeId, t.playerId),
        index('idx_invitations_player').on(t.playerId),
    ],
);

export const villages = sqliteTable(
    'villages',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        playerId: integer('player_id'),
        x: integer('x').notNull(),
        y: integer('y').notNull(),
        name: text('name').notNull(),
        loyalty: real('loyalty').notNull().default(100),
        loyaltyUpdatedAt: integer('loyalty_updated_at')
            .notNull()
            .default(0),
        wood: real('wood').notNull(),
        clay: real('clay').notNull(),
        iron: real('iron').notNull(),
        resourcesUpdatedAt: integer('resources_updated_at')
            .notNull()
            .default(0),
        points: integer('points').notNull().default(0),
    },
    (t) => [
        unique().on(t.x, t.y),
        index('idx_villages_player').on(t.playerId),
    ],
);

export const buildings = sqliteTable(
    'buildings',
    {
        villageId: integer('village_id').notNull(),
        type: text('type', { enum: BUILDING_ORDER }).notNull(),
        level: integer('level').notNull().default(0),
    },
    (t) => [unique().on(t.villageId, t.type)],
);

export const units = sqliteTable(
    'units',
    {
        villageId: integer('village_id').notNull(),
        unitType: text('unit_type', { enum: UNIT_ORDER }).notNull(),
        countHome: integer('count_home').notNull().default(0),
    },
    (t) => [unique().on(t.villageId, t.unitType)],
);

export const movements = sqliteTable(
    'movements',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        originVillageId: integer('origin_village_id').notNull(),
        targetVillageId: integer('target_village_id').notNull(),
        kind: text('kind', { enum: MOVEMENT_KINDS }).notNull(),
        unitsJson: text('units_json').notNull(),
        departureGameTime: integer('departure_game_time').notNull(),
        arrivalGameTime: integer('arrival_game_time').notNull(),
        carriesJson: text('carries_json').notNull().default('{}'),
    },
    (t) => [index('idx_movements_target').on(t.targetVillageId)],
);

export const events = sqliteTable(
    'events',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        dueGameTime: integer('due_game_time').notNull(),
        type: text('type').notNull(),
        payload: text('payload_json').notNull().default('{}'),
    },
    (t) => [index('idx_events_due').on(t.dueGameTime)],
);

export const buildQueue = sqliteTable(
    'build_queue',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        villageId: integer('village_id').notNull(),
        buildingType: text('building_type', {
            enum: BUILDING_ORDER,
        }).notNull(),
        targetLevel: integer('target_level').notNull(),
        completesAt: integer('completes_at').notNull(),
    },
    (t) => [index('idx_build_queue_village').on(t.villageId)],
);

export const recruitQueue = sqliteTable(
    'recruit_queue',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        villageId: integer('village_id').notNull(),
        unitType: text('unit_type', { enum: UNIT_ORDER }).notNull(),
        count: integer('count').notNull(),
        nextUnitDoneAt: integer('next_unit_done_at').notNull(),
        perUnitMs: integer('per_unit_ms').notNull(),
    },
    (t) => [index('idx_recruit_queue_village').on(t.villageId)],
);

/**
 * Ansehen zwischen zwei Spielern (plans/16-ansehen-und-handel.md).
 *
 * **Asymmetrisch**: eine Zeile je *geordnetem* Paar. Was A von B hält, ist
 * ausdrücklich nicht, was B von A hält — ein Bot, den man beschenkt und danach
 * überfällt, mag einen weniger, als man ihn mag.
 */
export const relations = sqliteTable(
    'relations',
    {
        playerId: integer('player_id').notNull(),
        otherPlayerId: integer('other_player_id').notNull(),
        standing: real('standing').notNull().default(0),
        updatedAt: integer('updated_at').notNull().default(0),
    },
    (t) => [
        unique().on(t.playerId, t.otherPlayerId),
        index('idx_relations_player').on(t.playerId),
    ],
);

export const reports = sqliteTable(
    'reports',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        playerId: integer('player_id').notNull(),
        createdGameTime: integer('created_game_time').notNull(),
        type: text('type').notNull(),
        payload: text('payload_json').notNull(),
        read: integer('read', { mode: 'boolean' })
            .notNull()
            .default(false),
    },
    (t) => [index('idx_reports_player').on(t.playerId)],
);
