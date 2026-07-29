# Deploy Field Ops → GitHub + Cloudflare (or Vercel)

This app is a TanStack Start / Vite project that builds to **Vercel-compatible Nitro output** and can also be served as a static+serverless deploy. For **Cloudflare Pages**, use the static client assets + a Node/Workers adapter if you need SSR; for the simplest path, **Vercel** matches the existing `nitro({ preset: "vercel" })` config.

## 1. Push to GitHub

```bash
git init   # if needed
git remote add origin git@github.com:YOU/field-ops-lupus-stella.git
git add .
git commit -m "Field Ops: Lupus Stella open world"
git push -u origin main
```

## 2. Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → Connect GitHub repo.
2. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `.vercel/output/static`  
     (or configure a Cloudflare adapter later; for pure SPA preview of the client shell, also try `dist/client` if present after build)
3. Environment: Node **22**.
4. After deploy, note your URL, e.g. `https://field-ops.pages.dev`.

If SSR routes fail on Pages, prefer **Vercel** import of the same repo (one-click; Nitro preset already set).

## 3. Vercel (recommended first deploy)

1. Import the GitHub repo in Vercel.
2. Framework: Vite / Other; build `npm run build`.
3. Output uses `.vercel/output` from Nitro automatically on Vercel.

## 4. Wire exodus2121.com Classified Terminal

```html
<iframe
  src="https://YOUR-HOST/embed?spoiler=book2early"
  title="Field Ops: Lupus Stella"
  allow="fullscreen; autoplay; pointer-lock"
  style="width:100%;height:min(80vh,800px);border:0;background:#05060a"
></iframe>
```

Deep links:

| Query | Effect |
|-------|--------|
| `?spoiler=book1` | Book I only |
| `?spoiler=book2early` | Book I + early II (default) |
| `?operative=theo` | Pre-select Theo |
| `?spawn=ridge7` | Next deploy starts at Ridge-7 |
| `?spawn=coast` | Kaguyahime memorial |
| `?auto=1` | Auto-start if operative set |

postMessage API: see `/terminal` and `/embed-snippet.html`.

## 5. PWA

- Manifest: `/manifest.webmanifest`
- Service worker: `/sw.js` (registered from root layout when available)

## 6. Checklist before go-live

- [ ] `npm run build` succeeds
- [ ] `/` playable
- [ ] `/embed` loads in iframe
- [ ] `/terminal` shell works
- [ ] Book I spoiler ceiling hides coast/Tomas
- [ ] Journal export works
