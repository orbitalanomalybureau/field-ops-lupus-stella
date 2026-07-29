/**
 * Funnel telemetry — Phase 5's play-to-purchase instrumentation.
 *
 * Privacy stance: no PII, no cookies, no persistent identifiers. Events carry
 * a per-session random id (crypto.randomUUID) that dies with the tab, an event
 * name, and a small string/number payload. Nothing here reads the save blob.
 *
 * Transport is pluggable because the server half does not exist yet: Phase 6's
 * signaling work adds the /api/events route, at which point one line —
 * `setTelemetryTransport(beaconTransport("/api/events"))` — turns the funnel
 * on. Until then dev builds log to console.debug and prod builds no-op. The
 * call sites are the durable part.
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

let transport: TelemetryTransport = (batch) => {
  if (isDev()) console.debug("[fieldops:telemetry]", batch);
};

export function setTelemetryTransport(next: TelemetryTransport): void {
  transport = next;
}

/**
 * The transport Phase 6 installs once /api/events exists. sendBeacon survives
 * pagehide; keepalive fetch is the fallback for browsers without it.
 */
export function beaconTransport(url: string): TelemetryTransport {
  return (batch) => {
    const body = JSON.stringify(batch);
    if (navigator.sendBeacon?.(url, body)) return;
    void fetch(url, {
      method: "POST",
      body,
      keepalive: true,
      headers: { "content-type": "application/json" },
    }).catch(() => undefined);
  };
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
