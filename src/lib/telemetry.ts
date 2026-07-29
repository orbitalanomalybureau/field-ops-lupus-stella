/**
 * Funnel telemetry — Phase 5's play-to-purchase instrumentation, now with the
 * Phase 6 server half attached.
 *
 * Privacy stance: no PII, no cookies, no persistent identifiers. Events carry
 * a per-session random id (crypto.randomUUID) that dies with the tab, an event
 * name, and a small string/number payload. Nothing here reads the save blob.
 *
 * Transport is real as of Phase 6: batches POST to /api/events as
 * `{ events: [...] }` via sendBeacon (survives pagehide) with a
 * keepalive-fetch fallback, and dev builds additionally echo each batch to
 * console.debug. `setTelemetryTransport` remains for tests and embed hosts
 * that want to intercept the stream.
 *
 * This module also owns the two quiet-protocol helpers consumed by
 * CompleteScreen: `postEnding` (fire-and-forget tally increment) and
 * `fetchProtocolStats` (null on any failure — the UI degrades silently).
 */

export type TelemetryEvent = {
  event: string;
  data: Record<string, string | number>;
  /** Milliseconds since the session began — no wall clock to correlate. */
  t: number;
  session: string;
};

export type TelemetryTransport = (batch: TelemetryEvent[]) => void;

/** Batched so a burst (an objective cascade) is one delivery, not five. */
const FLUSH_MS = 4000;
const MAX_BUFFERED = 32;

let sessionId = "";
let sessionStart = 0;
let buffer: TelemetryEvent[] = [];
let flushTimer: number | null = null;
let hooked = false;

function isDev(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

/**
 * The real transport: POST `{ events: batch }` to /api/events. sendBeacon
 * survives pagehide (queued by the browser, fires after the tab is gone);
 * keepalive fetch is the fallback for browsers without it.
 */
export function beaconTransport(url: string): TelemetryTransport {
  return (batch) => {
    const body = JSON.stringify({ events: batch });
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon?.(url, blob)) return;
    } catch {
      // Blob or sendBeacon unavailable — fall through to fetch.
    }
    void fetch(url, {
      method: "POST",
      body,
      keepalive: true,
      headers: { "content-type": "application/json" },
    }).catch(() => undefined);
  };
}

const networkTransport = beaconTransport("/api/events");

let transport: TelemetryTransport = (batch) => {
  if (isDev()) console.debug("[fieldops:telemetry]", batch);
  networkTransport(batch);
};

export function setTelemetryTransport(next: TelemetryTransport): void {
  transport = next;
}

function ensureSession(): void {
  if (sessionId) return;
  sessionStart = Date.now();
  sessionId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `s-${Date.now().toString(36)}`;
}

export function flushTelemetry(): void {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    transport(batch);
  } catch {
    /* telemetry must never take the game down with it */
  }
}

/** Record one funnel event. Safe to call anywhere; no-ops on the server. */
export function track(event: string, data: Record<string, string | number> = {}): void {
  if (typeof window === "undefined") return;
  ensureSession();
  if (!hooked) {
    hooked = true;
    // pagehide is the last reliable moment on both desktop and iOS.
    window.addEventListener("pagehide", flushTelemetry);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushTelemetry();
    });
  }
  buffer.push({
    event,
    data,
    t: Date.now() - sessionStart,
    session: sessionId,
  });
  if (buffer.length >= MAX_BUFFERED) {
    flushTelemetry();
    return;
  }
  if (flushTimer === null) {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flushTelemetry();
    }, FLUSH_MS);
  }
}

// ── quiet-protocol tally (consumed by CompleteScreen) ────────────────────────

/**
 * Report which ending this run chose. Fire-and-forget: resolves void whether
 * the POST lands, is rate-limited, or the network is gone — the tally is a
 * communal nicety, never a failure surface. keepalive lets it survive a tab
 * closing right after the ending card.
 */
export async function postEnding(ending: "silent" | "broadcast"): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/protocol", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ending }),
      keepalive: true,
    });
  } catch {
    // Deliberately swallowed — see above.
  }
}

/**
 * Fetch the communal ending totals for the diegetic command note. Returns
 * null on ANY failure (offline PWA, 5xx, malformed body) so the UI can simply
 * omit the line. Values are clamped to non-negative integers — nothing from
 * the wire is trusted, even from our own relay.
 */
export async function fetchProtocolStats(): Promise<{ broadcast: number; silent: number } | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/protocol", { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as { broadcast?: unknown; silent?: unknown } | null;
    const broadcast = asCount(body?.broadcast);
    const silent = asCount(body?.silent);
    if (broadcast === null || silent === null) return null;
    return { broadcast, silent };
  } catch {
    return null;
  }
}

function asCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}
