/**
 * /api/events — the telemetry sink src/lib/telemetry.ts batches into.
 *
 *  POST { events: [{ event, data, t, session }] } → 204, always
 *
 * Contract: 204 no matter what — telemetry must never surface a failure to
 * the game, so oversized (> ~10 KB), malformed, rate-limited, and
 * storage-failed batches are all silently dropped. Events are inserted when
 * Postgres is configured (DATABASE_URL) and dropped otherwise.
 *
 * No PII by construction: only whitelisted primitive fields survive
 * sanitization — a per-tab random session id, an event name, a small
 * string/number payload, and a session-relative timestamp. No IPs, no user
 * agents, no wall-clock times are stored.
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  allowRequest,
  clientKeyOf,
  getStore,
  sanitizeText,
  type TelemetryRow,
} from "@/lib/serverState";

const MAX_BODY_BYTES = 10 * 1024;
const MAX_EVENTS_PER_BATCH = 32;
const MAX_DATA_ENTRIES = 16;
const MAX_KEY_LENGTH = 32;
const MAX_VALUE_LENGTH = 128;
const MAX_SESSION_MS = 2 ** 43; // ~278 years of session time; clamps junk

function statusResponse(status: number): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

function sanitizeData(value: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  let entries = 0;
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (entries >= MAX_DATA_ENTRIES) break;
    const key = sanitizeText(rawKey, MAX_KEY_LENGTH);
    if (!key) continue;
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      out[key] = rawValue;
      entries += 1;
    } else if (typeof rawValue === "string") {
      out[key] = sanitizeText(rawValue, MAX_VALUE_LENGTH);
      entries += 1;
    }
    // Everything else (objects, arrays, booleans, null) is dropped: the
    // client contract is Record<string, string | number> and nothing more.
  }
  return out;
}

function sanitizeEvent(value: unknown): TelemetryRow | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as { event?: unknown; session?: unknown; t?: unknown; data?: unknown };
  const event = sanitizeText(raw.event, 64);
  const session = sanitizeText(raw.session, 64);
  if (!event || !session) return null;
  const t =
    typeof raw.t === "number" && Number.isFinite(raw.t)
      ? Math.min(Math.max(Math.round(raw.t), 0), MAX_SESSION_MS)
      : 0;
  return { event, session, t, data: sanitizeData(raw.data) };
}

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!allowRequest("events", clientKeyOf(request), 20, 0.5)) return statusResponse(204);
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) return statusResponse(204);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return statusResponse(204);
        }
        const batch = (parsed as { events?: unknown } | null)?.events;
        if (!Array.isArray(batch)) return statusResponse(204);
        const rows: TelemetryRow[] = [];
        for (const entry of batch.slice(0, MAX_EVENTS_PER_BATCH)) {
          const row = sanitizeEvent(entry);
          if (row) rows.push(row);
        }
        if (rows.length > 0) {
          try {
            await getStore().insertEvents(rows);
          } catch {
            // Telemetry loss is acceptable; a 5xx here would just add noise.
          }
        }
        return statusResponse(204);
      },
    },
  },
});
