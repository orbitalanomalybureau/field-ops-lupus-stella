/**
 * Server-side state for the Phase 6 presence + funnel routes (/api/rtc,
 * /api/protocol, /api/events). Two backends behind one interface:
 *
 *  - **Postgres** via src/lib/db.ts when DATABASE_URL is set (tables in
 *    migrations/0002_fieldops.sql). The only backend that works on serverless,
 *    where every invocation may be a fresh process.
 *  - **In-memory** Maps otherwise, pruned on access. Correct for `vite dev`
 *    and the FIELDOPS_NO_NITRO preview build (one long-lived Node process),
 *    WRONG for Vercel — without DATABASE_URL the routes still answer, but each
 *    invocation is an island and presence silently degrades to solo play.
 *
 * Privacy stance mirrors the client: peer ids are random per session, the only
 * string stored is a short sanitized callsign, positions never touch the
 * server (they flow peer-to-peer after signaling), and every presence row
 * expires in seconds. Client IPs are used transiently as rate-limit keys and
 * are never persisted.
 */

import type { Sql } from "@/lib/db";

export type SignalKind = "offer" | "answer" | "ice";
export type EndingChoice = "silent" | "broadcast";

/** Roster entry, shaped exactly as p2p.ts's `PeerRow` expects. */
export interface RosterPeer {
  id: string;
  name: string;
}

/** Relayed signal, shaped exactly as p2p.ts's `SignalRow` expects. */
export interface StoredSignal {
  id: number;
  from: string;
  kind: SignalKind;
  payload: unknown;
}

export interface RtcPollResult {
  peers: RosterPeer[];
  signals: StoredSignal[];
}

export interface ProtocolStats {
  broadcast: number;
  silent: number;
}

export interface TelemetryRow {
  session: string;
  event: string;
  data: Record<string, string | number>;
  t: number;
}

export interface FieldOpsStore {
  /**
   * The poll IS the join (see P2PRoom.pollOnce): refresh this peer's roster
   * row, then return the live roster plus any signals addressed to it with
   * id > since. Signal ids are monotonic per backend so the client cursor
   * (`Math.max` over seen ids) never re-delivers.
   */
  rtcPoll(room: string, peer: string, name: string, since: number): Promise<RtcPollResult>;
  rtcSignal(
    room: string,
    from: string,
    to: string,
    kind: SignalKind,
    payload: unknown,
  ): Promise<void>;
  rtcLeave(room: string, peer: string): Promise<void>;
  protocolStats(): Promise<ProtocolStats>;
  protocolIncrement(ending: EndingChoice): Promise<void>;
  /** Telemetry batch: inserted on Postgres, deliberately dropped in-memory. */
  insertEvents(rows: TelemetryRow[]): Promise<void>;
}

// NOTE: the two TTLs are mirrored as `interval` literals in createPgStore —
// change them in both places.
/** Peers vanish from the roster this long after their last poll (~10 s TTL). */
const PEER_TTL_MS = 10_000;
/** Signals outlive delivery briefly; the client cursor prevents re-delivery. */
const SIGNAL_TTL_MS = 60_000;
/** Full mesh is quadratic — cap the room before it caps itself. */
const MAX_PEERS_PER_ROOM = 16;
const MAX_SIGNALS_PER_ROOM = 1_000;
const MAX_ROOMS = 256;
const MAX_SIGNALS_PER_POLL = 200;

// Mirrors db.ts: an empty/whitespace DATABASE_URL must mean "unset".
const rawDatabaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const hasDatabaseUrl = Boolean(rawDatabaseUrl && rawDatabaseUrl.trim());

// ── in-memory backend ────────────────────────────────────────────────────────

interface MemPeer {
  name: string;
  lastSeen: number;
}
interface MemSignal {
  id: number;
  from: string;
  to: string;
  kind: SignalKind;
  payload: unknown;
  at: number;
}
interface MemRoom {
  peers: Map<string, MemPeer>;
  signals: MemSignal[];
}
interface MemState {
  rooms: Map<string, MemRoom>;
  tally: ProtocolStats;
  lastSignalId: number;
}
interface TokenBucket {
  tokens: number;
  at: number;
}

/**
 * Dev HMR creates new instances of this module; state lives on globalThis so a
 * source edit doesn't scatter the roster (same pattern as src/lib/db.ts).
 */
const globalRef = globalThis as typeof globalThis & {
  __fieldopsMemState__?: MemState;
  __fieldopsBuckets__?: Map<string, TokenBucket>;
  __fieldopsStore__?: FieldOpsStore;
};

function memState(): MemState {
  globalRef.__fieldopsMemState__ ??= {
    rooms: new Map(),
    tally: { broadcast: 0, silent: 0 },
    lastSignalId: 0,
  };
  return globalRef.__fieldopsMemState__;
}

/**
 * Ids must stay monotonic across dev-server restarts (clients keep cursors),
 * so they are seeded from wall-clock time rather than restarting at 1.
 */
function nextSignalId(state: MemState): number {
  state.lastSignalId = Math.max(state.lastSignalId + 1, Date.now());
  return state.lastSignalId;
}

function pruneRooms(state: MemState, now: number): void {
  for (const [id, room] of state.rooms) {
    for (const [peerId, peer] of room.peers) {
      if (now - peer.lastSeen > PEER_TTL_MS) room.peers.delete(peerId);
    }
    room.signals = room.signals.filter((s) => now - s.at <= SIGNAL_TTL_MS);
    if (room.peers.size === 0 && room.signals.length === 0) state.rooms.delete(id);
  }
}

function createMemoryStore(): FieldOpsStore {
  return {
    rtcPoll(roomId, peer, name, since) {
      const state = memState();
      const now = Date.now();
      pruneRooms(state, now);
      let room = state.rooms.get(roomId);
      if (!room) {
        if (state.rooms.size >= MAX_ROOMS) return Promise.resolve({ peers: [], signals: [] });
        room = { peers: new Map(), signals: [] };
        state.rooms.set(roomId, room);
      }
      const existing = room.peers.get(peer);
      if (existing) {
        existing.name = name;
        existing.lastSeen = now;
      } else if (room.peers.size < MAX_PEERS_PER_ROOM) {
        room.peers.set(peer, { name, lastSeen: now });
      }
      const peers = [...room.peers.entries()]
        .map(([id, p]) => ({ id, name: p.name }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const signals = room.signals
        .filter((s) => s.to === peer && s.id > since)
        .slice(0, MAX_SIGNALS_PER_POLL)
        .map(({ id, from, kind, payload }) => ({ id, from, kind, payload }));
      return Promise.resolve({ peers, signals });
    },

    rtcSignal(roomId, from, to, kind, payload) {
      const state = memState();
      const room = state.rooms.get(roomId);
      // No room means everyone left (or it never formed): drop, the sender's
      // next poll re-registers it before any retry matters.
      if (!room) return Promise.resolve();
      room.signals.push({ id: nextSignalId(state), from, to, kind, payload, at: Date.now() });
      if (room.signals.length > MAX_SIGNALS_PER_ROOM) {
        room.signals.splice(0, room.signals.length - MAX_SIGNALS_PER_ROOM);
      }
      return Promise.resolve();
    },

    rtcLeave(roomId, peer) {
      const state = memState();
      const room = state.rooms.get(roomId);
      if (!room) return Promise.resolve();
      room.peers.delete(peer);
      room.signals = room.signals.filter((s) => s.from !== peer && s.to !== peer);
      if (room.peers.size === 0 && room.signals.length === 0) state.rooms.delete(roomId);
      return Promise.resolve();
    },

    protocolStats() {
      return Promise.resolve({ ...memState().tally });
    },

    protocolIncrement(ending) {
      memState().tally[ending] += 1;
      return Promise.resolve();
    },

    insertEvents() {
      // In-memory backend drops telemetry by design: the client already echoes
      // batches to console.debug in dev, and preview runs must not accumulate.
      return Promise.resolve();
    },
  };
}

// ── Postgres backend ─────────────────────────────────────────────────────────

/**
 * db.ts is imported dynamically so loading this module without DATABASE_URL
 * (dev / preview / misconfigured serverless) never boots the PGLite fallback —
 * the in-memory backend above is the intended path there.
 */
async function sqlOf(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function createPgStore(): FieldOpsStore {
  return {
    async rtcPoll(roomId, peer, name, since) {
      const sql = await sqlOf();
      // Prune on access — no cron on serverless, and the tables stay tiny.
      await sql`delete from rtc_peers where last_seen < now() - interval '10 seconds'`;
      await sql`delete from rtc_signals where created_at < now() - interval '60 seconds'`;
      const others = await sql<{ n: number }>`
        select count(*) as n from rtc_peers where room = ${roomId} and peer <> ${peer}`;
      if ((others[0]?.n ?? 0) < MAX_PEERS_PER_ROOM) {
        await sql`
          insert into rtc_peers (room, peer, name, last_seen)
          values (${roomId}, ${peer}, ${name}, now())
          on conflict (room, peer) do update set name = excluded.name, last_seen = now()`;
      }
      const peers = await sql<RosterPeer>`
        select peer as id, name from rtc_peers where room = ${roomId} order by peer`;
      const signals = await sql<StoredSignal>`
        select id, from_peer as "from", kind, payload from rtc_signals
        where room = ${roomId} and to_peer = ${peer} and id > ${since}
        order by id asc limit ${MAX_SIGNALS_PER_POLL}`;
      return { peers, signals };
    },

    async rtcSignal(roomId, from, to, kind, payload) {
      const sql = await sqlOf();
      await sql`
        insert into rtc_signals (room, from_peer, to_peer, kind, payload)
        values (${roomId}, ${from}, ${to}, ${kind}, ${JSON.stringify(payload ?? null)})`;
    },

    async rtcLeave(roomId, peer) {
      const sql = await sqlOf();
      await sql`delete from rtc_peers where room = ${roomId} and peer = ${peer}`;
      await sql`
        delete from rtc_signals
        where room = ${roomId} and (from_peer = ${peer} or to_peer = ${peer})`;
    },

    async protocolStats() {
      const sql = await sqlOf();
      const rows = await sql<{ ending: string; count: number }>`
        select ending, count from protocol_tally`;
      const stats: ProtocolStats = { broadcast: 0, silent: 0 };
      for (const row of rows) {
        if (row.ending === "broadcast" || row.ending === "silent") stats[row.ending] = row.count;
      }
      return stats;
    },

    async protocolIncrement(ending) {
      const sql = await sqlOf();
      await sql`
        insert into protocol_tally (ending, count) values (${ending}, 1)
        on conflict (ending) do update set count = protocol_tally.count + 1`;
    },

    async insertEvents(rows) {
      if (rows.length === 0) return;
      const sql = await sqlOf();
      const values: unknown[] = [];
      const tuples = rows.map((row, i) => {
        const base = i * 4;
        values.push(row.session, row.event, JSON.stringify(row.data), Math.round(row.t));
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      });
      await sql.query(
        `insert into events (session, event, data, t) values ${tuples.join(", ")}`,
        values,
      );
    },
  };
}

/** The active store: Postgres when DATABASE_URL is set, else in-memory. */
export function getStore(): FieldOpsStore {
  globalRef.__fieldopsStore__ ??= hasDatabaseUrl ? createPgStore() : createMemoryStore();
  return globalRef.__fieldopsStore__;
}

// ── request hygiene helpers (shared by the three routes) ─────────────────────

/**
 * Naive per-IP token bucket, best-effort by design: in-memory, per-instance,
 * reset on deploy. Enough to blunt a curl loop against the tally; not a
 * security boundary.
 */
export function allowRequest(
  scope: string,
  key: string,
  capacity: number,
  refillPerSecond: number,
): boolean {
  const buckets = (globalRef.__fieldopsBuckets__ ??= new Map<string, TokenBucket>());
  const now = Date.now();
  if (buckets.size > 4096) {
    for (const [id, bucket] of buckets) {
      if (now - bucket.at > 600_000) buckets.delete(id);
    }
  }
  const id = `${scope}:${key}`;
  const bucket = buckets.get(id) ?? { tokens: capacity, at: now };
  bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.at) / 1000) * refillPerSecond);
  bucket.at = now;
  if (bucket.tokens < 1) {
    buckets.set(id, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(id, bucket);
  return true;
}

/** Rate-limit key for a request. Read transiently, never stored. */
export function clientKeyOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "local";
}

/**
 * Nothing from the wire is trusted: strings that will be stored (and later
 * rendered by other clients) are stripped of control characters and truncated
 * before they touch a backend. Callers still sanitize again at render time.
 */
export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) out += ch;
    if (out.length >= maxLength) break;
  }
  return out;
}
