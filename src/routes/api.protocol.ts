/**
 * /api/protocol — the communal quiet-protocol tally (Moonshot 2): every
 * finished run reports which ending its operative chose, and the aggregate is
 * surfaced diegetically on the complete screen ("N% of field operatives have
 * violated quiet protocol").
 *
 *  GET                                    → { broadcast: number, silent: number }
 *  POST { ending: "silent" | "broadcast" } → 204
 *
 * One row per ending, one counter — no session ids, no timestamps per player,
 * nothing to correlate. POST is rate-limited per IP (best-effort, in-memory)
 * because a public counter readers argue about is exactly the kind of thing
 * someone curls in a loop.
 */

import { createFileRoute } from "@tanstack/react-router";
import { allowRequest, clientKeyOf, getStore } from "@/lib/serverState";

const MAX_BODY_BYTES = 1024;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function statusResponse(status: number): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/protocol")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return jsonResponse(await getStore().protocolStats());
        } catch {
          return statusResponse(503);
        }
      },

      POST: async ({ request }) => {
        // ~4 endings in quick succession per IP, refilling one per 30 s.
        if (!allowRequest("protocol", clientKeyOf(request), 4, 1 / 30)) {
          return statusResponse(429);
        }
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) return statusResponse(413);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return statusResponse(400);
        }
        const ending = (parsed as { ending?: unknown } | null)?.ending;
        if (ending !== "silent" && ending !== "broadcast") return statusResponse(400);
        try {
          await getStore().protocolIncrement(ending);
          return statusResponse(204);
        } catch {
          return statusResponse(503);
        }
      },
    },
  },
});
