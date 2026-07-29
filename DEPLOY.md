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
| `DATABASE_URL` | for presence/telemetry | Postgres (Neon) backing the signaling relay and the event endpoint. Without it, both fall back to an in-memory store, which does **not** work on serverless — each invocation is a fresh instance. |

Run `npm run db:migrate` once after setting `DATABASE_URL` (or add it back to
the build command) to provision the presence and event tables.

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
