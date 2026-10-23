import {
    BUILDING_ORDER,
    MOVEMENT_KINDS,
    UNIT_ORDER,
} from '@medival/shared';

const sqlList = (values: readonly string[]) =>
    values.map((v) => `'${v}'`).join(', ');

/**
 * DDL for a fresh world database. World DBs are always created by this server
 * version, so plain CREATE TABLE (no migration history) is sufficient for now.
 * Keep in sync with schema.ts.
 */
/**
 * Forschung (19-13): was ein Dorf erforscht hat, und die laufende Forschung
 * (höchstens eine je Dorf). Ohne `CHECK`-Liste auf `unit_type`: Die Werte
 * prüft `UnitTypeSchema` beim Lesen, und eine neue Einheit braucht dann keine
 * Neuanlage der Tabelle. Eigene Konstante, weil die Migration alter Welten
 * sie vor `WORLD_DDL` anlegt (`migrateWorldDb`).
 */
export const RESEARCH_DDL = `
CREATE TABLE IF NOT EXISTS research (
  village_id INTEGER NOT NULL,
  unit_type TEXT NOT NULL,
  UNIQUE(village_id, unit_type)
);
CREATE TABLE IF NOT EXISTS research_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  village_id INTEGER NOT NULL UNIQUE,
  unit_type TEXT NOT NULL,
  completes_at INTEGER NOT NULL
);
`;

export const WORLD_DDL = `
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_bot INTEGER NOT NULL DEFAULT 1,
  personality TEXT,
  difficulty TEXT,
  ai_state_json TEXT NOT NULL DEFAULT '{}',
  tribe_id INTEGER,
  account_id INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_account ON players(account_id);
CREATE TABLE IF NOT EXISTS tribes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  founder_id INTEGER NOT NULL,
  created_game_time INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tribe_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tribe_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  created_game_time INTEGER NOT NULL,
  expires_game_time INTEGER NOT NULL,
  UNIQUE(tribe_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_invitations_player ON tribe_invitations(player_id);
CREATE TABLE IF NOT EXISTS villages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  name TEXT NOT NULL,
  loyalty REAL NOT NULL DEFAULT 100,
  loyalty_updated_at INTEGER NOT NULL DEFAULT 0,
  wood REAL NOT NULL,
  clay REAL NOT NULL,
  iron REAL NOT NULL,
  resources_updated_at INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  UNIQUE(x, y)
);
CREATE INDEX IF NOT EXISTS idx_villages_player ON villages(player_id);
CREATE TABLE IF NOT EXISTS buildings (
  village_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN (${sqlList(BUILDING_ORDER)})),
  level INTEGER NOT NULL DEFAULT 0,
  UNIQUE(village_id, type)
);
CREATE TABLE IF NOT EXISTS units (
  village_id INTEGER NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN (${sqlList(UNIT_ORDER)})),
  count_home INTEGER NOT NULL DEFAULT 0,
  UNIQUE(village_id, unit_type)
);
CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin_village_id INTEGER NOT NULL,
  target_village_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (${sqlList(MOVEMENT_KINDS)})),
  units_json TEXT NOT NULL,
  departure_game_time INTEGER NOT NULL,
  arrival_game_time INTEGER NOT NULL,
  carries_json TEXT NOT NULL DEFAULT '{}',
  catapult_target TEXT
);
CREATE INDEX IF NOT EXISTS idx_movements_target ON movements(target_village_id);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  due_game_time INTEGER NOT NULL,
  type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_due ON events(due_game_time);
CREATE INDEX IF NOT EXISTS idx_events_order ON events(due_game_time, priority, id);
CREATE TABLE IF NOT EXISTS build_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  village_id INTEGER NOT NULL,
  building_type TEXT NOT NULL CHECK (building_type IN (${sqlList(BUILDING_ORDER)})),
  target_level INTEGER NOT NULL,
  completes_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_build_queue_village ON build_queue(village_id);
CREATE TABLE IF NOT EXISTS recruit_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  village_id INTEGER NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN (${sqlList(UNIT_ORDER)})),
  count INTEGER NOT NULL,
  started_at INTEGER,
  per_unit_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recruit_queue_village ON recruit_queue(village_id);
${RESEARCH_DDL}
CREATE TABLE IF NOT EXISTS relations (
  player_id INTEGER NOT NULL,
  other_player_id INTEGER NOT NULL,
  standing REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(player_id, other_player_id)
);
CREATE INDEX IF NOT EXISTS idx_relations_player ON relations(player_id);
CREATE TABLE IF NOT EXISTS scout_intel (
  player_id INTEGER NOT NULL,
  village_id INTEGER NOT NULL,
  game_time INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(player_id, village_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  created_game_time INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reports_player ON reports(player_id);
`;

export const META_DDL = `
CREATE TABLE IF NOT EXISTS memberships (
  world_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  UNIQUE(world_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_account ON memberships(account_id);
CREATE TABLE IF NOT EXISTS worlds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  seed INTEGER NOT NULL,
  settings_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paused',
  game_time_ms INTEGER NOT NULL DEFAULT 0,
  rng_state INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  epoch_zero_ms INTEGER,
  settled_count INTEGER
);
`;
