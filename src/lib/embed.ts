/**
 * The Field Ops ↔ host-page bridge.
 *
 * The game is designed to run inside an iframe on the novel site
 * (exodus2121.com). This module is the *single* definition of that contract —
 * message shapes, origin allowlist, and the send/receive helpers. Both the game
 * (FieldOpsApp, the store) and the reference host page (/terminal) import it,
 * so the protocol can never drift between the two halves again.
 *
 * Security: outbound messages target an explicit origin and inbound messages
 * are dropped unless the sender is allowlisted. Previously everything used
 * `targetOrigin: "*"` with no `e.origin` check, which let any framing page
 * reset the game — unacceptable once save blobs and telemetry cross this wire.
 */

/** Messages the game sends up to the host page. */
export type OutboundMessage =
  | { type: "fieldops:ready"; embed: boolean }
  | { type: "fieldops:phase"; phase: string }
  | { type: "fieldops:started"; operative: string | null }
  | {
      type: "fieldops:complete";
      ending: "silent" | "broadcast";
      objectives: number;
      total: number;
      discoveries: number;
    }
  | { type: "fieldops:discovery"; id: string; title: string; chapter?: number }
  | { type: "fieldops:journal-export"; text: string }
  /** Save handoff — see `docs/EMBED.md` § Cross-origin storage. */
  | { type: "fieldops:save-export"; blob: string; version: number };

/** Messages the host page may send down to the game. */
export type InboundMessage =
  | { type: "fieldops:pause" }
  | { type: "fieldops:reset" }
  | { type: "fieldops:journal" }
  | { type: "fieldops:photo" }
  | {
      type: "fieldops:deeplink";
      spoiler?: string;
      spawn?: string;
      operative?: string;
      chapter?: string;
    }
  | { type: "fieldops:save-import"; blob: string };

/**
 * Origins allowed to command the game and receive its messages.
 *
 * Configure per-deploy with `VITE_EMBED_PARENT_ORIGINS` (comma-separated).
 * The game's own origin is always allowed. In dev, everything is allowed so
 * local host pages and tunnels keep working.
 */
export function allowedOrigins(): string[] {
  const configured =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_EMBED_PARENT_ORIGINS as string | undefined)
      : undefined;
  const list = (configured ?? "https://exodus2121.com,https://www.exodus2121.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (typeof window !== "undefined" && window.location?.origin) {
    list.push(window.location.origin);
  }
  return Array.from(new Set(list));
}

function isDev(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

/** True when a received message may be acted on. */
export function isAllowedOrigin(origin: string): boolean {
  if (isDev()) return true;
  if (!origin || origin === "null") return false;
  return allowedOrigins().includes(origin);
}

/**
 * Post a message to the host page.
 *
 * Sent once per allowlisted origin rather than with `"*"`: the browser
 * delivers only to a frame whose origin actually matches, so a hostile framer
 * never sees the payload.
 */
export function postToParent(msg: OutboundMessage): void {
  if (typeof window === "undefined") return;
  const parent = window.parent;
  if (!parent || parent === window) return;
  const targets = isDev() ? ["*"] : allowedOrigins();
  for (const origin of targets) {
    try {
      parent.postMessage(msg, origin);
    } catch {
      /* a cross-origin parent that rejects the target is not our problem */
    }
  }
}

/**
 * Subscribe to inbound host messages. Returns an unsubscribe function.
 * Non-allowlisted senders and malformed payloads are dropped silently.
 */
export function onHostMessage(
  handler: (msg: InboundMessage) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: MessageEvent) => {
    if (!isAllowedOrigin(e.origin)) return;
    const data = e.data as InboundMessage | undefined;
    if (!data || typeof data !== "object") return;
    if (typeof data.type !== "string" || !data.type.startsWith("fieldops:")) {
      return;
    }
    handler(data);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
