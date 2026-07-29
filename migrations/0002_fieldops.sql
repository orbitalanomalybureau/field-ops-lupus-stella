-- Phase 6 ("distinctive"): presence signaling, the communal quiet-protocol
-- tally, and the telemetry event sink. Applied by scripts/migrate.mjs on
-- deploy (DATABASE_URL) and by the PGLite fallback at dev startup — both read
-- migrations/*.sql in name order, so this file needs no manual registration.
--
-- Privacy invariants encoded here: rtc_peers/rtc_signals rows carry random
-- per-session ids and expire within seconds (pruned by the /api/rtc route on
-- access — TTLs live in src/lib/serverState.ts). Positions never reach these
-- tables; they flow peer-to-peer after signaling. events carries no PII and
-- no client-side wall-clock times. protocol_tally is two counters, nothing
-- per-player.

-- Presence roster: one row per (room, peer), refreshed by every poll.
-- Rooms are "fieldops-<spoilerCeiling>"; peer ids are random per session.
CREATE TABLE IF NOT EXISTS rtc_peers (
  room       TEXT NOT NULL,
  peer       TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room, peer)
);

CREATE INDEX IF NOT EXISTS rtc_peers_last_seen_idx ON rtc_peers (last_seen);

-- SDP/ICE relay mailbox. The BIGSERIAL id is the client's poll cursor
-- (?since=<max id seen>), so it must stay monotonic — never reuse or reset.
CREATE TABLE IF NOT EXISTS rtc_signals (
  id          BIGSERIAL PRIMARY KEY,
  room        TEXT NOT NULL,
  from_peer   TEXT NOT NULL,
  to_peer     TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('offer', 'answer', 'ice')),
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rtc_signals_room_to_idx ON rtc_signals (room, to_peer, id);
CREATE INDEX IF NOT EXISTS rtc_signals_created_at_idx ON rtc_signals (created_at);

-- The communal ending counter ("N% of field operatives have violated quiet
-- protocol"). Two rows, ever. A book-launch survey rotation resets counts.
CREATE TABLE IF NOT EXISTS protocol_tally (
  ending  TEXT PRIMARY KEY CHECK (ending IN ('broadcast', 'silent')),
  count   BIGINT NOT NULL DEFAULT 0
);

INSERT INTO protocol_tally (ending, count)
VALUES ('broadcast', 0), ('silent', 0)
ON CONFLICT (ending) DO NOTHING;

-- Funnel telemetry (src/lib/telemetry.ts → /api/events). session is a random
-- per-tab UUID that dies with the tab; t is milliseconds since session start.
CREATE TABLE IF NOT EXISTS events (
  id           BIGSERIAL PRIMARY KEY,
  session      TEXT NOT NULL,
  event        TEXT NOT NULL,
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  t            BIGINT NOT NULL DEFAULT 0,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_event_idx ON events (event, received_at);
