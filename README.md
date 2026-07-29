# Field Ops: Lupus Stella

Open-world Classified Terminal survey for **2121: EXODUS** — the playable ground
recon companion to [exodus2121.com](https://exodus2121.com/).

You deploy to Lupus Stella (Wolf 1061c) as one of three operatives, walk a
colony perimeter that is quietly failing, scan an ecosystem that keeps time with
a planetary EM lattice, and follow a signal south into something that was here
first. The forest learns your habits. So does what lives in it.

## Play routes

| Path | Purpose |
|------|---------|
| `/` | Full Field Ops session |
| `/embed` | Minimal chrome for the iframe on the novel site |
| `/terminal` | Classified Terminal shell — reference host page for the embed |
| `/offline` | Diegetic offline fallback served by the service worker |

Deep links: `?spoiler=book1|book2early&operative=theo|marine|survey&spawn=south-gate|ridge7|coast|ruins&chapter=N&auto=1`
— see [docs/EMBED.md](./docs/EMBED.md) for the full protocol.

## Stack

- TanStack Start · React 19 · Vite · Tailwind v4
- Three.js via React Three Fiber + drei + postprocessing
- Zustand state · procedural Web Audio (no sample assets) · PWA

## Develop

```bash
npm install
npm run dev
```

```bash
npm run verify
```

```bash
npm test
```

`dev` serves on `0.0.0.0:8080`. `verify` runs typecheck, lint, build and the
bundle budget. `test` runs Playwright against headless WebGL via SwiftShader.

Other scripts: `npm run canon:lint` (canon drift guard),
`node scripts/gen-icons.mjs` (regenerate the PWA icon set),
`npm run test:update-goldens` (re-baseline visual regressions).

## Design documents

| Document | What it is |
|---|---|
| [docs/ROADMAP.md](./docs/ROADMAP.md) | The full enhancement roadmap this repo implements — six pillars, measured baselines, sequencing. |
| [docs/EMBED.md](./docs/EMBED.md) | The host-page bridge: deep links, message protocol, origin security, cross-origin save handoff. |
| [canon/CANON.md](./canon/CANON.md) | The canon bible. Every proper noun the game uses, its manuscript status, and what the game may reveal per spoiler tier. **Read before writing any content.** |
| [DEPLOY.md](./DEPLOY.md) | Vercel deploy, headers, and the iframe snippet for the novel site. |

## Spoiler ceiling

The game gates content by how far the reader has got in the series. A fresh
visitor defaults to `book1` and will never be shown Book II material; readers
opt up themselves, or the novel site deep-links them. The ceiling filters
objectives, codex entries, NPCs, map markers, scan targets, and whole regions
uniformly.

## Controls

WASD move · Shift sprint · Space jump · Q scan · E interact · F combat stance ·
J journal · P photo · K settings · M map · C codex · Tab objectives · Esc pause

Touch: left thumbstick moves, drag the right half of the screen to look.
Gamepads are supported. Bindings are remappable in Settings.

## Canon

Book I New Eden / forest / ruins, plus an early Book II Kaguyahime coast teaser
behind the spoiler ceiling. Novel manuscripts are **not** in this repo — see
[canon/CANON.md](./canon/CANON.md) for how game content stays aligned with them.

© Scott D. Rodriguez / 2121 EXODUS universe. See [LICENSE](./LICENSE).
