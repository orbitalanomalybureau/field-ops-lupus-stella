# Field Ops: Lupus Stella

Open-world Classified Terminal survey for **2121: EXODUS** — the playable ground recon companion to [exodus2121.com](https://exodus2121.com/).

## Play routes

| Path | Purpose |
|------|---------|
| `/` | Full Field Ops session |
| `/embed` | Minimal chrome for iframe on the novel site |
| `/terminal` | Classified Terminal shell reference |

Deep links: `?spoiler=book1|book2early&operative=theo|marine|survey&spawn=south-gate|ridge7|coast|ruins&auto=1`

## Stack

- TanStack Start · React 19 · Vite · Tailwind v4
- Three.js via React Three Fiber + drei
- Zustand state · procedural audio · PWA manifest

## Develop

```bash
npm install
npm run dev    # 0.0.0.0:8080
npm run build
npm run typecheck
```

## Deploy

See [DEPLOY.md](./DEPLOY.md) for GitHub → Vercel (recommended) or Cloudflare Pages, plus the iframe snippet for the novel site.

## Controls

WASD move · Shift sprint · Q scan · E interact · F combat · J journal · P photo · K settings · Esc pause · M map · C codex

## Canon

Book I New Eden / forest / ruins + early Book II Kaguyahime coast teaser (spoiler ceiling toggle). Novel manuscripts are **not** in this repo.

© Scott D. Rodriguez / 2121 EXODUS universe
