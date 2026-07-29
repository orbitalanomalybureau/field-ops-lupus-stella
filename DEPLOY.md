# Deploy Field Ops

TanStack Start / Vite building to Nitro's **Vercel** preset. Vercel is the
supported target; everything below is verified against it.

> Cloudflare Pages was previously documented speculatively and never actually
> ported. It has been removed rather than left to rot — if you want it, switch
> the Nitro preset in `vite.config.ts` to `cloudflare-pages`, add a
> `wrangler.jsonc`, and confirm the presence/telemetry routes work on Workers
> before advertising it.

## 1. Push to GitHub

```bash
git remote add origin git@github.com:orbitalanomalybureau/field-ops-lupus-stella.git
git push -u origin main
```

## 2. Vercel

1. Import the repo. Framework preset: **Other**. Build command `npm run build`.
2. Node version comes from `.nvmrc` (22).
3. Nitro writes `.vercel/output` — Vercel picks it up with no output-directory
   setting needed.
4. `vercel.json` is committed and supplies the cache and security headers,
   including `frame-ancestors` so only the novel site can embed the game.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_EMBED_PARENT_ORIGINS` | no | Comma-separated origins allowed to embed and message the game. Defaults to the exodus2121.com pair. |
| `VITE_NOVEL_SITE_URL` | no | Base URL for codex "Continue in 2121: EXODUS" links. |
| `VITE_STUN_URLS` | no | ICE servers for reader-ghost presence. Defaults to public Google + Cloudflare STUN. |
| `DATABASE_URL` | **yes, for presence + telemetry** | Postgres (Neon) backing `/api/rtc`, `/api/protocol`, and `/api/events` (see the next section). Without it every route still answers, but state is per-instance in-memory — which does **not** work on serverless. |

Run `npm run db:migrate` once after setting `DATABASE_URL` (or add it to the
build command) to provision the presence and event tables. The migrator
(`scripts/migrate.mjs`) applies every pending file in `migrations/` in name
order and records each in `_migrations`, so it is safe to re-run;
`migrations/0002_fieldops.sql` creates `rtc_peers`, `rtc_signals`,
`protocol_tally`, and `events`.

### Presence & telemetry backend

Phase 6 lit up three server routes (TanStack Start server handlers — they run
identically under `vite dev`, the `FIELDOPS_NO_NITRO` preview build Playwright
uses, and the Nitro/Vercel output):

| Route | Purpose |
|---|---|
| `/api/rtc` | WebRTC signaling relay for reader ghosts. `GET` registers the polling peer (roster TTL ~10 s) and returns the room roster plus queued SDP/ICE signals past the client's cursor; `POST` relays `op:"signal"` / `op:"leave"`. The wire contract is defined by `src/lib/multiplayer/p2p.ts`. |
| `/api/protocol` | Communal quiet-protocol tally. `GET` → `{ broadcast, silent }`; `POST { ending }` → 204 (per-IP rate-limited). |
| `/api/events` | Telemetry sink. `POST { events: [...] }` → 204 always; body capped at ~10 KB; batches are sanitized, then inserted (Postgres) or dropped. |

Storage is `src/lib/serverState.ts`, one interface with two backends:

- **`DATABASE_URL` set → Postgres.** The only correct configuration for
  Vercel or any serverless target.
- **Unset → process-local in-memory Maps.** This is *correct* for `vite dev`
  and `vite preview` (one long-lived Node process) and ***wrong* for
  serverless: each invocation is an island, so peers can never see each
  other, the tally resets constantly, and events vanish. The routes do not
  error in this state — presence just silently degrades to solo play. If
  ghosts don't appear in production, check `DATABASE_URL` first.

Operational notes:

- Presence rooms are named `fieldops-<spoilerCeiling>`, so Book I readers
  never see ghosts standing at Book II locations.
- Privacy: peer ids are random per session; the only stored string is a
  sanitized callsign; **positions never touch the server** (they flow
  peer-to-peer after signaling); presence rows expire in seconds; `events`
  rows carry no PII, no IPs, and no client wall-clock times. IPs are read
  transiently for rate limiting and never persisted. Settings has a presence
  opt-out toggle.
- The `events` table grows unbounded by design (it is the funnel record).
  Prune or aggregate it on your own schedule; nothing reads it at runtime.
- In dev/preview without `DATABASE_URL`, telemetry batches are echoed to the
  browser console (`[fieldops:telemetry]`) and dropped server-side.

## 3. Fonts (last offline step)

`src/routes/__root.tsx` loads IBM Plex from Google Fonts non-blocking, so first
paint never waits on it. To remove the last third-party runtime request and make
the PWA fully offline-complete, download the IBM Plex Mono and Sans woff2 files,
drop them in `public/fonts/`, add `@font-face` rules to `src/styles.css`, and
delete the `FONT_HREF` link from `__root.tsx`.

## 4. Wire the novel site

```html
<iframe
  src="https://YOUR-HOST/embed?spoiler=book1"
  title="Field Ops: Lupus Stella"
  allow="fullscreen; autoplay; pointer-lock; gamepad"
  style="width:100%;aspect-ratio:16/9;border:0;background:#05060a"
></iframe>
```

`?spoiler=book1` is the correct default for a Book-I audience and is also the
game's own default. The full deep-link table and postMessage protocol live in
[docs/EMBED.md](./docs/EMBED.md); `/terminal` is a working host implementation
and `public/embed-snippet.html` generates the snippet.

**Do not skip the save handoff.** Safari and Firefox partition third-party
storage, so an embedded reader loses all progress on reload unless the host page
stores the exported save blob first-party. See docs/EMBED.md § Cross-origin
storage for the ten lines that fix it.

## 5. PWA

- Manifest `/manifest.webmanifest` — icons, maskable variant, and deep-link shortcuts.
- Service worker `/sw.js` — network-first navigations, cache-first hashed assets.
- `scripts/build-sw.mjs` stamps the SW with a build id and the real asset graph
  after `vite build`, so each deploy lands in a fresh cache and the whole game
  precaches for offline play.
- Regenerate icons with `node scripts/gen-icons.mjs`.

## 6. Checklist before go-live

- [ ] `npm run verify` passes (typecheck, lint, build, bundle budget)
- [ ] `npm test` passes, including the golden screenshots
- [ ] `npm run canon:lint` clean
- [ ] `/` playable start to finish; both endings reachable
- [ ] `/embed` loads in an iframe on the real novel-site origin
- [ ] `/terminal` shell reflects phase changes
- [ ] Book I ceiling hides the coast, Tomas, and Book II codex entries
- [ ] Journal export downloads and posts over the bridge
- [ ] Install as a PWA, then load with the network disabled
- [ ] `VITE_EMBED_PARENT_ORIGINS` set to the production novel-site origins
- [ ] `DATABASE_URL` set and `npm run db:migrate` run — then two browsers on
      the deployed site see each other's survey ghosts, and `/api/protocol`
      returns the tally
