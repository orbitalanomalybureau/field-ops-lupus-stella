# Open-source & free software that would genuinely enhance this build

Curated against what Field Ops actually is — a zero-asset, procedural, browser
open-world with a strict bundle budget — not a generic list. Licenses noted;
everything here is safe for a commercial companion game unless flagged.

## Rendering & performance

| Package | License | What it buys here |
|---|---|---|
| **three-mesh-bvh** | MIT | BVH-accelerated raycasts. The rifle hitscan is a cone test today; if combat grows (multiple hit zones, cover, penetration), this makes true per-triangle raycasts affordable, and it also accelerates camera-occlusion queries. |
| **detect-gpu** | MIT | Real GPU-tier detection from a benchmark DB instead of our `hardwareConcurrency` heuristics. Drop-in upgrade for `detectTier()` — fewer phones mis-sorted into "high". |
| **three-custom-shader-material** | MIT | Cleaner authoring for what we do with `onBeforeCompile` (terrain splat, wind sway, height fog). Same output, far more maintainable shader patches. |
| **psrdnoise / webgl-noise** (Ashima/stegu) | MIT | Higher-quality, cheaper GPU noise for the sky clouds, water and terrain detail than hand-rolled hashes. |
| **troika-three-text** | MIT | Crisp SDF text rendered *in the world* — signage at the gate, etchings at the Hale camp, the Kaguyahime memorial inscription — at any zoom, no canvas textures. The single biggest "AAA polish" text upgrade available. |
| **stats-gl / r3f-perf** | MIT | Dev-only draw-call/triangle/GPU-timing HUD. We tune blind between screenshot runs today. |

## If real 3D assets ever come in (the pipeline)

| Tool | License | Role |
|---|---|---|
| **Blender** | GPL (tool) | Authoring. GPL applies to the tool, not your exports. |
| **glTF-Transform** | MIT | CLI/SDK to prune, dedupe, quantize and compress glTF. |
| **meshoptimizer / gltfpack** | MIT | Vertex-cache optimization + quantization; routinely 5–10× smaller meshes. |
| **Draco** | Apache-2.0 | Geometry compression (three has a loader built in). |
| **KTX-Software (BasisU)** | Apache-2.0 | GPU-compressed textures (KTX2) — stays compressed *in VRAM*, unlike PNG/JPG. |

## Free assets that fit the art direction (all CC0 — no attribution required)

- **Kenney.nl** — enormous CC0 packs; the *Sci-Fi RTS*, *Space Kit* and
  *Nature Kit* match the colony/low-poly look almost exactly. Prefab domes,
  crates, antennas, rovers.
- **Quaternius** — CC0 *animated* low-poly characters and creatures with
  glTF skeletal animations; the upgrade path beyond our procedural rig if
  hand-keyed animation is ever wanted.
- **Kay Lousberg (kaylousberg.com)** — CC0 character/dungeon/space packs,
  stylistically adjacent.
- **Poly Haven** — CC0 HDRIs and PBR textures. One 1k HDRI (~300 KB as KTX2)
  through three's PMREM gives image-based lighting that would soften the
  whole scene's shading for almost no runtime cost — arguably the highest
  realism-per-byte purchase available to this renderer on the high tier.
- **ambientCG** — CC0 PBR texture sets (rock, soil, sand) if the procedural
  canvas splats ever want photographic detail.
- **OpenGameArt / Freesound** — filter to CC0. (Audio identity here is
  deliberately procedural; Freesound is the escape hatch, not the plan.)

## Audio

| Package | License | What it buys |
|---|---|---|
| **Tone.js** | MIT | A real scheduler/synthesis layer for the planned adaptive-music system (modal pads, intensity layers) — much less error-prone than raw WebAudio node graphs for musical timing. Weigh its ~30 KB gz against the no-deps identity. |
| **jsfxr** | MIT | Rapid procedural SFX iteration (design in browser, export param sets) — keeps the zero-sample identity while speeding up sound design. |

## QA, accessibility, telemetry

| Package | License | What it buys |
|---|---|---|
| **@axe-core/playwright** | MPL-2.0 | Automated WCAG audits inside the existing Playwright suite — would have caught the contrast and colour-only findings mechanically. |
| **web-vitals** | Apache-2.0 | Field FPS/INP/LCP into the existing `/api/events` telemetry with ~1 KB. |
| **GlitchTip** (self-hosted) | MIT | Sentry-compatible error tracking; wire `WorldErrorBoundary` + `window.onerror` to it. (Sentry's own server is BSL — GlitchTip is the clean OSS choice.) |
| **Umami** or **Plausible CE** (self-hosted) | MIT / AGPL | Privacy-respecting analytics for exodus2121.com to receive the `fieldops:*` funnel events, instead of growing the custom events table. |

## Presence & networking (when reader-ghosts outgrow polling)

| Tool | License | What it buys |
|---|---|---|
| **PartyKit** | MIT | Room-based WebSocket state on Cloudflare — the natural upgrade from the 400 ms HTTP signaling poll; the p2p client's room shape maps onto it directly. |
| **Centrifugo** | Apache-2.0 | Self-hosted WS/SSE broker alternative if staying on a VPS. |
| **coturn** | BSD-style | Self-hosted TURN server so ghosts survive symmetric NAT (today they silently degrade to solo). |
| **Supabase** (self-hosted) | Apache-2.0 | Postgres + realtime channels + auth in one box — could replace Neon *and* the signaling relay if consolidation ever appeals. |

## Deliberately not recommended

- **Physics engines** (Rapier, cannon-es) — the analytic heightfield + capsule
  pushes are the right cost model for this game; a rigid-body world would tax
  every phone for fidelity nothing in the design needs.
- **SMAA from `postprocessing`** — embeds a 66 KB base64 lookup texture;
  measured and rejected once already (MSAA tiering won).
- **Full asset-streaming engines / Unity-Web, PlayCanvas migration** — the
  codebase's whole advantage is that the world is a pure function; engines
  trade that for tooling this project doesn't need.
