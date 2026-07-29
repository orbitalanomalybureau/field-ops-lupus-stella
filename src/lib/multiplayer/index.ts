/**
 * Reader ghosts — the game-facing presence layer over the P2P mesh
 * (docs/ROADMAP.md § Moonshots #1).
 *
 * Other current readers appear in the world as silent holographic survey
 * ghosts. Deliberately mute: no chat, no free text — being alone-together on a
 * world where broadcasting is forbidden is the point. The only string presence
 * ever carries is one of the three fixed operative callsigns, enforced on send
 * AND on receive.
 *
 * Privacy stance (non-negotiable):
 *  - peer ids are random per session; nothing on the wire persists or
 *    correlates across visits;
 *  - nothing from the wire is trusted — every remote number is clamped to the
 *    walk box and every string is checked against a fixed vocabulary before it
 *    can reach a render;
 *  - remote y is never used: ghosts stand on locally sampled terrain;
 *  - rooms are named "fieldops-<spoilerCeiling>", so a book1 reader never sees
 *    a ghost standing at a book2 location;
 *  - a Settings toggle (store.presenceEnabled) opts out entirely — the
 *    consumer (GhostOperatives) simply never calls startPresence.
 *
 * Everything degrades silently: no signaling server, no peers, WebRTC blocked,
 * presence off — all of it renders nothing and logs nothing to the player.
 */

import { CHARACTERS, WORLD } from "@/game/data";
import { P2PRoom } from "./p2p";
import type { AnimState } from "@/game/types";

export { P2PRoom, defaultIceServers } from "./p2p";
export type {
  PeerInfo,
  P2PRoomOptions,
  SignalKind,
  PeerRow,
  SignalRow,
  RtcPollResponse,
} from "./p2p";

/**
 * The walk box, derived exactly as PlayerController derives it from the
 * terrain mesh and WORLD.bounds, so a clamped remote position can never land
 * anywhere the local operative could not walk to.
 */
const TERRAIN_SIZE = 480;
const TERRAIN_CENTER_Z = 90;
const TERRAIN_EDGE = TERRAIN_SIZE / 2 - 4;
const WALK_MAX_X = Math.min(WORLD.bounds, TERRAIN_EDGE);
const WALK_MIN_Z = Math.max(-40, TERRAIN_CENTER_Z - TERRAIN_EDGE);
const WALK_MAX_Z = Math.min(WORLD.bounds + 40, TERRAIN_CENTER_Z + TERRAIN_EDGE);

/** The three fixed operative callsigns — the ONLY strings presence carries. */
const OPERATIVE_CALLSIGNS: ReadonlySet<string> = new Set(CHARACTERS.map((c) => c.callsign));
const DEFAULT_CALLSIGN = "SURVEY-3";

const ANIM_STATES: readonly AnimState[] = ["idle", "walk", "run", "scan", "combat"];

/** ~8.7 Hz — inside the 8–10 Hz presence budget; a packet is ~90 bytes. */
const BROADCAST_MS = 115;
const SWEEP_MS = 1000;
/** A peer silent this long is gone (tab closed, link died); expire silently. */
const EXPIRE_MS = 5000;
/** Hard cap on tracked peers. Rendering caps at the 8 nearest anyway. */
const MAX_TRACKED = 24;

/** One remote operative's last accepted state — already validated + clamped. */
export type GhostSnapshot = {
  id: string;
  callsign: string;
  x: number;
  z: number;
  yaw: number;
  anim: AnimState;
  /** performance.now() of the last accepted packet; expiry runs on this. */
  at: number;
};

export type PresenceSample = { x: number; z: number; yaw: number; anim: AnimState };

export type PresenceOptions = {
  /** Use presenceRoom(spoilerCeiling) — ceilings never share a room. */
  room: string;
  /** One of the three operative callsigns; anything else is coerced. */
  callsign: string;
  /** Reads the local operative's pose; called at the broadcast cadence. */
  sample: () => PresenceSample;
};

const ghosts = new Map<string, GhostSnapshot>();

let room: P2PRoom | null = null;
let activeRoom = "";
let activeCallsign = "";
let broadcastTimer: ReturnType<typeof setInterval> | null = null;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** Room naming contract — book1 readers never see ghosts at book2 sites. */
export function presenceRoom(spoilerCeiling: string): string {
  return `fieldops-${spoilerCeiling}`;
}

function clampFinite(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, v));
}

function wrapYaw(v: number): number {
  return Math.atan2(Math.sin(v), Math.cos(v));
}

function isAnimState(v: unknown): v is AnimState {
  return typeof v === "string" && (ANIM_STATES as readonly string[]).includes(v);
}

/**
 * True when this run is a QA golden — applyDeepLink treats `tod` and `wx`
 * as screenshot pins, and golden screenshots must never contain ghosts. The
 * store does not record that the pins were applied, so this reads the same
 * URL params the deep link did. Fails closed: no readable URL, no presence.
 */
function qaPinned(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has("tod") || params.has("wx");
  } catch {
    return true;
  }
}

function presencePossible(): boolean {
  return (
    typeof window !== "undefined" && typeof RTCPeerConnection === "function" && !qaPinned()
  );
}

/** Random per session, never stored: a ghost has no identity across visits. */
function randomPeerId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the non-crypto id */
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The wire is hostile until proven boring: numbers must be finite and are
 * clamped to the walk box, the callsign must be one of the three operative
 * callsigns, the anim must be a known state. Anything else drops the packet.
 */
function acceptPacket(from: string, data: unknown): void {
  if (typeof data !== "object" || data === null) return;
  const p = data as Record<string, unknown>;
  const x = clampFinite(p.x, -WALK_MAX_X, WALK_MAX_X);
  const z = clampFinite(p.z, WALK_MIN_Z, WALK_MAX_Z);
  const yaw = clampFinite(p.yaw, -1e6, 1e6);
  if (x === null || z === null || yaw === null) return;
  const callsign = p.callsign;
  if (typeof callsign !== "string" || !OPERATIVE_CALLSIGNS.has(callsign)) return;
  const anim = p.anim;
  if (!isAnimState(anim)) return;
  const existing = ghosts.get(from);
  if (!existing && ghosts.size >= MAX_TRACKED) return;
  const at = performance.now();
  if (existing) {
    existing.x = x;
    existing.z = z;
    existing.yaw = wrapYaw(yaw);
    existing.anim = anim;
    existing.callsign = callsign;
    existing.at = at;
  } else {
    ghosts.set(from, { id: from, callsign, x, z, yaw: wrapYaw(yaw), anim, at });
  }
}

function sweep(): void {
  const now = performance.now();
  for (const [id, g] of ghosts) {
    if (now - g.at > EXPIRE_MS) ghosts.delete(id);
  }
}

/** Two decimals ≈ 1 cm — plenty for a hologram, smaller on the wire. */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Join the presence room and start broadcasting. Idempotent for an identical
 * (room, callsign); a changed room (spoiler ceiling flip) rejoins cleanly.
 * Silently a no-op when WebRTC is unavailable or this is a QA-pinned run.
 */
export function startPresence(opts: PresenceOptions): void {
  if (!presencePossible()) return;
  const callsign = OPERATIVE_CALLSIGNS.has(opts.callsign) ? opts.callsign : DEFAULT_CALLSIGN;
  if (room && activeRoom === opts.room && activeCallsign === callsign) return;
  stopPresence();
  activeRoom = opts.room;
  activeCallsign = callsign;
  const joined = new P2PRoom({
    room: opts.room,
    selfId: randomPeerId(),
    name: callsign,
    onMessage: (from, data, channel) => {
      // Presence rides the unreliable lane only; anything else is not ours.
      if (channel !== "state") return;
      acceptPacket(from, data);
    },
    onPeersChanged: (peers) => {
      // A peer that left the mesh takes its ghost with it immediately rather
      // than standing around for the 5 s expiry window.
      const alive = new Set(peers.map((p) => p.id));
      for (const id of [...ghosts.keys()]) {
        if (!alive.has(id)) ghosts.delete(id);
      }
    },
  });
  room = joined;
  void joined.join();
  broadcastTimer = setInterval(() => {
    if (!room) return;
    const s = opts.sample();
    const x = clampFinite(s.x, -WALK_MAX_X, WALK_MAX_X);
    const z = clampFinite(s.z, WALK_MIN_Z, WALK_MAX_Z);
    if (x === null || z === null || !Number.isFinite(s.yaw)) return;
    // y is deliberately absent: every client stands ghosts on its own terrain.
    room.broadcast({
      x: round2(x),
      z: round2(z),
      yaw: round2(wrapYaw(s.yaw)),
      anim: s.anim,
      callsign,
    });
  }, BROADCAST_MS);
  sweepTimer = setInterval(sweep, SWEEP_MS);
}

/** Leave the room and forget every ghost. Safe to call when not started. */
export function stopPresence(): void {
  if (broadcastTimer !== null) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
  if (sweepTimer !== null) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  if (room) {
    room.close();
    room = null;
  }
  activeRoom = "";
  activeCallsign = "";
  ghosts.clear();
}

/** Live, validated remote operatives. Records are updated in place. */
export function getGhosts(): GhostSnapshot[] {
  return [...ghosts.values()];
}

/** One live ghost's latest state, or undefined once it has expired. */
export function getGhost(id: string): GhostSnapshot | undefined {
  return ghosts.get(id);
}
