/**
 * /api/rtc — the WebRTC signaling relay src/lib/multiplayer/p2p.ts has been
 * polling for since the original build. The client is the spec:
 *
 *  GET  ?room&peer&name&since   → { peers: [{id,name}], signals: [{id,from,kind,payload}] }
 *       The poll IS the join: it upserts the caller's roster row (last-seen
 *       TTL ~10 s) and returns signals addressed to it with id > since —
 *       ids are monotonic, the client cursors with Math.max over them.
 *  POST { op:"signal", room, from, to, kind, payload } → 204 (relay one SDP/ICE blob)
 *  POST { op:"leave",  room, peer }                    → 204 (teardown broadcast)
 *
 * Rooms are named "fieldops-<spoilerCeiling>" by the client so Book I readers
 * never see ghosts standing at Book II locations; the server treats room names
 * as opaque validated tokens. Nothing from the wire is trusted: every string
 * is length-capped and charset-checked, payloads are size-capped, and clients
 * re-sanitize everything again before render.
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  allowRequest,
  clientKeyOf,
  getStore,
  sanitizeText,
  type SignalKind,
} from "@/lib/serverState";

const TOKEN_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const MAX_NAME_LENGTH = 32;
const MAX_BODY_BYTES = 64 * 1024; // an SDP offer is ~2–10 KB; 64 KB is generous

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function statusResponse(status: number): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

function isSignalKind(value: unknown): value is SignalKind {
  return value === "offer" || value === "answer" || value === "ice";
}

function asToken(value: unknown): string | null {
  return typeof value === "string" && TOKEN_RE.test(value) ? value : null;
}

export const Route = createFileRoute("/api/rtc")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const room = asToken(url.searchParams.get("room"));
        const peer = asToken(url.searchParams.get("peer"));
        const name = sanitizeText(url.searchParams.get("name") ?? "", MAX_NAME_LENGTH);
        const since = Number.parseInt(url.searchParams.get("since") ?? "0", 10);
        if (!room || !peer || !Number.isSafeInteger(since) || since < 0) {
          return statusResponse(400);
        }
        // p2p.ts fast-polls at 400ms (~2.5 req/s), idle at 2000ms; a burst of
        // 10 refilling at 4/s clears presence without capping a healthy client.
        // 503 (not 429) on throttle: pollOnce() throws on any non-ok BEFORE
        // reading the body, so the client retries the SAME `since` cursor with
        // no roster/signal desync.
        if (!allowRequest("rtc-poll", clientKeyOf(request), 10, 4)) {
          return statusResponse(503);
        }
        try {
          return jsonResponse(await getStore().rtcPoll(room, peer, name, since));
        } catch {
          // p2p.ts treats any non-ok poll as transient and retries.
          return statusResponse(503);
        }
      },

      POST: async ({ request }) => {
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) return statusResponse(413);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return statusResponse(400);
        }
        if (typeof parsed !== "object" || parsed === null) return statusResponse(400);
        const body = parsed as Record<string, unknown>;

        try {
          if (body.op === "signal") {
            const room = asToken(body.room);
            const from = asToken(body.from);
            const to = asToken(body.to);
            if (!room || !from || !to || !isSignalKind(body.kind)) return statusResponse(400);
            if (body.payload === undefined) return statusResponse(400);
            // Tight bucket: signaling is bursty (offer/answer + ICE per pair)
            // but one IP has no legitimate reason to exceed this. 429 is non-ok,
            // so postSignal() retries with backoff, letting the bucket refill.
            if (!allowRequest("rtc-signal", clientKeyOf(request), 40, 15)) {
              return statusResponse(429);
            }
            await getStore().rtcSignal(room, from, to, body.kind, body.payload);
            return statusResponse(204);
          }
          if (body.op === "leave") {
            const room = asToken(body.room);
            const peer = asToken(body.peer);
            if (!room || !peer) return statusResponse(400);
            // Leave fires once per teardown; a low cap blunts anyone spamming
            // the delete-broadcast. close() ignores the response, so 429 is safe.
            if (!allowRequest("rtc-leave", clientKeyOf(request), 10, 2)) {
              return statusResponse(429);
            }
            await getStore().rtcLeave(room, peer);
            return statusResponse(204);
          }
        } catch {
          return statusResponse(503);
        }
        return statusResponse(400);
      },
    },
  },
});
