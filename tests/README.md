# Tests

One Playwright project, `chromium-swiftshader` — headless Chromium with ANGLE
pointed at SwiftShader, because the scene is WebGL and a GPU-less runner
otherwise renders nothing.

| File              | Covers                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| `smoke.spec.ts`   | Boot, embed and terminal routes, movement, terrain bounds, framerate floor, progression, save persistence. Always runs. |
| `visual.spec.ts`  | Eight golden screenshots. Opt-in — see below.                                 |
| `helpers.ts`      | Deep links, deploy-to-surface, held-key movement, the `window.__controlsTest` probe. |

## Running

`playwright.config.ts` starts `npm run preview`, which serves the **built**
app — build first.

```sh
npm run build
npm test                                # smoke only; goldens skip
npx playwright test smoke                # one file
FIELDOPS_VISUAL=1 npx playwright test visual
```

`FIELDOPS_TEST_PORT` moves the preview port. `FIELDOPS_BASE_URL` points the run
at an already-running server and skips the built-in one.

## Why the goldens are opt-in

SwiftShader is a software rasterizer, not a specification: the same draw calls
produce measurably different pixels on macOS and on the Ubuntu CI runner, and
the font stack differs on top of that. Goldens baselined on a dev machine
therefore fail every CI run, and a suite that is always red is a suite everyone
learns to ignore. So `visual.spec.ts` asserts nothing unless `FIELDOPS_VISUAL`
is set, and only **Linux** baselines belong in git.

Snapshots use Playwright's default per-platform path:

```
tests/visual.spec.ts-snapshots/<shot>-chromium-swiftshader-<platform>.png
```

Commit `-linux.png`. Keep `-darwin.png` and `-win32.png` out of the repo — they
are scratch output from whatever machine produced them.

## Baselining on Linux

Use the official Playwright image at the version this repo installs, so the
browser build matches CI. The anonymous volume keeps the container's Linux
`node_modules` from overwriting yours.

```sh
docker run --rm -it \
  -v "$PWD":/w -v /w/node_modules -w /w \
  -e FIELDOPS_VISUAL=1 \
  "mcr.microsoft.com/playwright:v$(node -p "require('./node_modules/@playwright/test/package.json').version")-noble" \
  bash -c "npm ci && npm run build && npx playwright test visual --update-snapshots"
```

New goldens land in the bind-mounted working tree owned by root; `sudo chown -R
"$(id -u)" tests` if that matters to you.

## Updating goldens deliberately

A golden changes when the render changes. That is the point — so read the diff
before you accept it.

1. Run the suite and open `playwright-report/`. Every failure ships an
   expected / actual / diff triplet.
2. Confirm the change is the one you made. A sky that moved 2° warmer is a
   result; a sky that went magenta is a bug.
3. Re-baseline on Linux with `--update-snapshots` (the docker command above, or
   `FIELDOPS_VISUAL=1 npm run test:update-goldens` inside it).
4. Commit the new PNGs **in the same commit as the render change**, so the
   diff explains itself in review.

## What the masks are for

Four HUD readouts change between two otherwise identical frames: the world
clock (`06:12 · DAWN · IDLE`), the coordinate readout, the `TRACKED` predator
indicator, and the comms feed, whose arrival order follows wall-clock time.
They are masked out with pink boxes so the comparison is about pixels the
renderer owns. Everything else in the HUD — vitals, stamina, ZPE signal, the
objective list — is deterministic and stays in the diff on purpose; the
objective list in particular is the cheapest guard on the quest graph.

The masks match on text and layout because the HUD carries no test hooks. If a
mask stops matching after a restyle the shot gets noisy, not wrong.

## Known noise

- **Creatures.** Agent positions advance with elapsed simulation time, so a
  slow first frame nudges them. They are small in every framing and fall inside
  the configured `maxDiffPixelRatio`.
- **Storm.** Rain never repeats and lightning is a step change in exposure;
  that shot runs at a looser tolerance. A lone storm failure is almost always a
  flash — rerun before believing it.
- **Fonts.** IBM Plex is fetched from a remote stylesheet, so a network-isolated
  runner falls back to system faces. Shots wait on `document.fonts.ready`, which
  removes the race but not the difference; self-hosting the woff2 files (already
  a TODO in `src/routes/__root.tsx`) removes it for good.
- **Entropy.** `visual.spec.ts` installs a seeded `Math.random` before app code
  runs. Without it the terrain detail texture, starfield and particle fields are
  redrawn differently on every load and no two frames match.
