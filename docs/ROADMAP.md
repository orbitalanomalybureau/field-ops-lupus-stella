# Field Ops: Lupus Stella — World-Class Enhancement Roadmap

*A deep-review synthesis for [field-ops-lupus-stella](https://github.com/orbitalanomalybureau/field-ops-lupus-stella), the open-world companion game for **2121: EXODUS**.*
*Based on a full-code audit: every scene system, the store, audio, routes, PWA, auth/multiplayer trees, QA scripts, and a measured production build.*

---

## Executive summary

**Where it stands:** This is a beautifully scaffolded vertical slice with unusually good bones — and the honest gap to "world-class open world" is not technology, budget, or team size. It is design wiring, six focused engineering passes, and about a month of structured writing.

What exists today: a ~520×340 m hand-tuned island with a real 480-second day/night cycle, systemic weather that genuinely modifies gameplay (storms slow you 0.78×, boost predators 1.2×, cut signal 0.55×), three operatives whose stats thread through five systems, a spoiler-ceiling mechanic no mainstream companion app has, a working embed/deep-link bridge to exodus2121.com, and — buried and completely invisible to players — the most original AI hook in the codebase: **predators that statistically learn your travel routes** (`learnedBias` averaging your last 45 s of movement).

What's missing: the systems never force a decision, the threat never resolves, and the discovery is never gated behind curiosity. The current loop is *walk to a hardcoded coordinate, press E, receive a flag* — and the game's climax is reachable by walking south for 90 seconds, because `openRuin()` has zero prerequisites. The terrain is a 4-term sine function on a single 10k-vertex plane, the sky is a flat-colored sphere snapping between four hex values, and the renderer ships every frame fully aliased (`multisampling={0}`).

**The target:** an **expedition rhythm** — prepare at the colony (talk, learn, equip) → venture with a purpose someone gave you → discover under pressure (predators, weather, falling night) → return and bank it (debrief, upgrade, journal) → new knowledge opens the next question → a final choice that honors the novel's dread. One in-game day is 8 minutes; a session is 2–6 days. That shape fits the 15–60-minute web-companion session perfectly, and **every piece needed to build it already exists in this codebase.**

---

## What is already world-class (protect these)

1. **The analytic heightfield as single source of truth.** `worldHeight.ts:sampleHeight(x,z)` grounds the terrain mesh, player, all 11 creatures, 5 NPCs, and every prop. Pure, deterministic, zero-serialization. This is the *exact* architecture terrain streaming wants, and most hobby projects never get it. Almost every big upgrade below is cheap *because* of this file.
2. **Systems that talk to each other.** Weather modifies movement, predator detection, signal strength, lighting, fog, and audio. Night boosts detection 1.25×. Character stats reach movement, stamina, stealth radius, scan speed, and knockback. The modifier web is real — it just needs to be *surfaced* and given consequences.
3. **The spoiler ceiling.** One `book2` flag uniformly gates objectives, codex, NPCs, markers, scan targets, and mission items at both data and mutation level, deep-linkable via `?spoiler=`. A genuine transmedia innovation — and (below) it should become the release-marketing engine for the whole trilogy.
4. **Shadowfang route-learning.** `Creatures.tsx` averages the player's `pathSamples` into a `learnedBias` every 1.6 s — predators that learn *your* habits. Rare even in AAA open worlds. Currently 100% invisible. Surfacing this is the single cheapest "perceived intelligence" win available.
5. **Shipping discipline already present.** The 3D world is a properly lazy chunk (~264 KB gz) behind a ~100 KB gz menu shell; total client JS ~384 KB gz — well inside web-game budgets. Instancing is already the habit. Delta-clamping, AdaptiveDpr, idempotent store actions, SSR-safe audio stub: the fundamentals are sound.
6. **Authored voice.** Voss's bureaucratic fatalism, Berger's sensory storm-lore, Tomas's liturgical cadence — the ~1,400 words that exist are *good*. The problem is volume and structure, not quality.

---

## Part 0 — Fix today (ship-stoppers and live embarrassments)

Small, high-visibility defects. Most are one-line to one-afternoon fixes.

| # | Fix | Where | Why it's urgent |
|---|-----|-------|-----------------|
| 1 | **Spoiler default is inverted** — flip `"book2early"` → `"book1"` | `store.ts:176` | A fresh Book-1 reader on the novel site gets Book II teasers *by default*. Actively unsafe for the embed that is the game's whole reason to exist. |
| 2 | **CompleteScreen divides by the raw 15-objective array** — use `visibleObjectives().length` | `CompleteScreen.tsx` | Book-1 players mathematically cap at a demoralizing 14/15. |
| 3 | **Walk-off-the-world** — player clamp is x ±260 but the terrain mesh ends at ±240 | `PlayerController.tsx:201-203` vs `Terrain.tsx` | Players can walk 20 units into skybox void. |
| 4 | **Aliased every frame** — `multisampling={0}` on the EffectComposer; gl antialias doesn't apply to the composer FBO | `PostFX.tsx` | Set `multisampling={4}` (or add SMAA — already a dependency). Un-aliases literally every screenshot. |
| 5 | **Shadows vanish over half the map** — static ±120 ortho box; Ridge-7 (x=-118) and the coast (z=200) are outside it | `DayNight.tsx` | Make the sun + target follow `playerPos` with a ±60 box: sharper shadows, works at any world size. |
| 6 | **3 real `rules-of-hooks` errors** — hooks conditionally mounted on the spoiler tier | `KaguyahimeCoast.tsx:17-20` | Lint currently *fails*; this is a crash-in-waiting when the ceiling toggles. |
| 7 | **Game cannot be muted** — `setMasterVolume` maps 0 → 0.05 gain floor | `audio.ts:106` | Map 0 → 0. |
| 8 | **Mobile feedback blackout** — message feed and compass are `hidden sm:block` | `HUD.tsx:218` | Phones never see scan results, objective completions, or *any* pushMessage. |
| 9 | **Mobile photo-mode softlock** — exit is KeyP/Escape only, and MobileControls unmounts in photo phase | `FieldOpsApp.tsx:115` | Render an on-screen EXIT button during `phase==='photo'`. |
| 10 | **One-tap save wipe** — "Abort / change operative" calls `reset()` → `localStorage.removeItem` with zero confirmation | `PauseMenu.tsx`, `store.ts:598` | Two-step confirm, in the terminal fiction ("This seals and erases the field log"). |
| 11 | **Journal entries can be lost** — `addJournal` never calls `persist()`; no visibilitychange/pagehide flush | `store.ts` | Add lifecycle flush + 30 s autosave while playing. |
| 12 | **Dead files with a live trap** — `Sky.tsx` / `Atmosphere.tsx` are imported nowhere; `Sky.tsx` contains a *second, competing* `setTimeOfDay` writer | `scene/` | Delete both before anything remounts them. |
| 13 | **Content-logic lies** — `hint:*` effects toast "marked" but place no marker; caches objective completes at 2 while the text lists 3 sites; "npcs" accepts any 3 of 4 while naming a specific 3; dead `npcId==='theo'` branch | `store.ts:124-138, 303-312, 400-412` | Trust fixes; the dynamic-marker store slice is also prerequisite glue for Pillar 1. |
| 14 | **Frozen creature animation** — Prismhoof bob computed once at mount (no reactive subscription); all creature legs are static cylinders | `Creatures.tsx:263` | Apply gait imperatively in the existing useFrame loop. Static-legged sliding creatures are the biggest fidelity tell in every encounter. |
| 15 | **postMessage wide open** — every message uses `targetOrigin:"*"`; the inbound handler never checks `e.origin` | `FieldOpsApp.tsx:55-91`, `store.ts:241,463` | Add an origin allowlist (default `https://exodus2121.com` + self). Mandatory before saves or telemetry cross the bridge. |
| 16 | **Beacon light budget** — 7 always-on pointLights on path beacons | `Ridge7.tsx`, POIs | Swap for emissive-only meshes; Bloom already sells the glow. Biggest single mobile-GPU reclaim in the scene. |
| 17 | **reducedMotion forks gameplay** — it unmounts the entire WeatherSystem, so storms never happen and the storm achievement is unreachable for accessibility users | `GameScene.tsx:28,42` | Split into an always-mounted `useWeatherSim` hook + gated `WeatherParticles`. |

---

## Pillar 1 — The spine: knowledge-gated progression + the Broadcast Choice

**The single biggest transformation available, and it should land first.** Right now nothing you learn changes what you can do; the fiction is Outer Wilds-shaped but the structure is a flat checklist.

### 1a. Knowledge-gated quest graph
- Extend `Objective` in `types.ts` with `requires?: ObjectiveId[]` and `hidden?: boolean`. `completeObjective()` reveals dependents; `visibleObjectives()` hides unrevealed items.
- Concrete graph to start:
  - **`ruins`** stays hidden until Thornhill's "south" dialogue branch *or* scanning the EM-lattice node fires `hint:ruins` — and the hint now places a **real dynamic map marker** (new `dynamicMarkers` store slice), not a lying toast.
  - **`ridge7`** requires Voss's clearance branch — the dialogue already *role-plays* authorization; make it mechanical.
  - **`remember`** requires `ruins` plus at least one Survey Team B cache log, so the reveal lands with context.
- Gate `openRuin()`'s phase transition behind the graph: walking there early shows a **sealed door and a hint** — which is itself a landmark-curiosity beat, not a wall.

### 1b. A real final choice: broadcast or stay silent
`RuinModal.tsx` currently offers seal-log or keep-walking. Add a third option — **"Broadcast the star maps"** — that defies the REMEMBER warning:
- Spike `signalMeter` to 1.0, force storm weather, aggro all shadowfangs (they already read storm/night boosts — the consequences are pre-wired).
- Distinct dark-ending `CompleteScreen` variant.
- Emit `fieldops:complete {ending:'broadcast'|'silent'}` so exodus2121.com can react.

The book's central dread — *do not broadcast* — becomes the player's own dilemma. This is the highest narrative-value-per-line change in the repo; even before the systemic consequences land, the choice itself transforms the ending from a toast into a memory.

**Effort:** ~2 days of code (`types.ts`, `store.ts`, `data.ts`, `RuinModal.tsx`) + one afternoon of writing. Ship it alongside the save-merge hydration fix (Pillar 6) so existing saves survive the schema change.

---

## Pillar 2 — The planet: terrain 2.0, sky, water, vegetation

This is what separates the current look from showcase-tier R3F work — and every item is a small custom shader or a contained migration. **Zero downloaded assets, near-zero bundle growth.**

### 2a. FBM heightfield (one file, an afternoon)
Rewrite `sampleHeight` as 4–6 octaves of *seeded* 2D simplex with mild domain warping, keeping the existing hand-authored features (Ridge-7 gaussian, colony flatten, coast drop) as **additive masks** so every POI/spawn coordinate stays valid. Export `sampleBiome(x,z)` → `{colony, forest, ridge, coast}` weights from the same masks for material and vegetation use downstream. Because every consumer already goes through `sampleHeight`, this one-file change instantly makes the entire world read as natural terrain.

### 2b. Chunked terrain with LOD — the load-bearing migration
Replace the single 480×480 plane with a chunk grid: **64 m tiles, 3 LODs** (64/32/16 segments ≈ 1 m/quad near-field), selected by distance to `playerPos` with hysteresis; pool geometries; add 1-unit skirts to hide seams (cheaper and more robust than stitching). Building a 64-seg tile from an analytic function is ~1 ms — stay on the main thread until profiling says otherwise.

Payoffs: kills the walk-off-the-mesh bug; per-chunk meshes make three.js frustum culling actually work (the current single mesh is never culled); and **`WORLD.bounds` can grow to 1000+** with zero load-time increase, because terrain is generated, not downloaded. That is the difference between a diorama and an open world.

### 2c. Slope/height texture splatting
Via `meshStandardMaterial.onBeforeCompile`: generate 4 canvas-texture variants (soil / rock / moss / coastal sand), blend by height + slope with a noise-broken edge. Kills the visible 28×28 tiling and gives ridge=rock, lowland=moss, coast=sand from data `sampleNormal` already computes.

### 2d. Gradient sky dome with procedural clouds
Replace the flat-color sphere with a ShaderMaterial dome: horizon→zenith gradient + warm scatter lobe around the sun direction (already computed — pass as a uniform), plus a 2D FBM cloud layer whose coverage/darkness reads store weather kind and intensity, cross-fading continuously instead of snapping between four hex states. **The highest polish-per-line change in the repo.**

### 2e. Height fog that matches the sky
Replace linear `THREE.Fog` with an `onBeforeCompile` fog chunk whose density decays with world Y, colored from the same sun uniform as the sky (fog `#3a2218` vs sky `#8a4020` currently seam at the horizon). The 14 m ridge rising out of valley mist is a payoff the terrain was literally built for.

### 2f. Water at Kaguyahime Coast
The heightfield already carves a shoreline south of z≈185 and the coast is a named, spoiler-gated hero location — with a static flat plane for water. One large plane at y≈-2: 2–3 Gerstner waves, fresnel toward the sky uniform, **shore foam by comparing depth against `sampleHeight` — analytic, no depth-texture readback needed** (the hardest part of web water is free here), amplitude driven by `weatherIntensity`. Turns the map's dead edge into its best vista.

### 2g. Vegetation at scale + grass + wind
- Scatter **20–50k instances** (trees, ferns, rocks, debris) per-chunk via `sampleBiome` and the existing seeded LCG, with `instanceColor` jitter and a time+wind vertex sway injected via `onBeforeCompile`.
- **Grass:** one InstancedMesh of crossed quads, 30–60k blades in a ring around the player, repositioned by modulo-wrapping in the vertex shader (uniform playerPos, no per-frame matrix writes). The ground is what the player stares at all game; it currently has nothing on it.
- Wire a shared **wind vector uniform** into WeatherSystem so storm gusts bend grass and canopy — keep the systems-talk-to-each-other identity.
- Convert the 56 individual fence posts (`Colony.tsx`) and 40 ridge rocks (`Ridge7.tsx`) to InstancedMesh — ~90 draw calls become 2. Consider `BatchedMesh` (three ^0.185 has it) for mixed prop sets.
- Make fern `emissiveIntensity` scale with the night factor — bioluminescence should *peak* after dark (it currently pulses identically at noon). See Pillar 3 for why this one line is actually a game-design keystone.

### 2h. Render pipeline & quality ladder (do first, it sets the frame budget)
- MSAA 4× / SMAA (Part 0 #4), player-following shadows (#5), beacon lights → emissive (#16).
- Add **N8AO at half resolution** for ground-contact grounding — the single biggest "CG-ness" reducer available.
- Optional dawn/dusk **god rays** sourced from the existing sun mesh.
- Build an explicit **quality ladder now**: `quality: low|med|high` in the store driving `{dpr 1.25/1.5/1.75, shadow map 1024/2048/2048, PostFX off/SMAA/MSAA+AO, far plane 260/340/420, particle counts}`, seeded from a 3-second startup frametime probe, exposed in Settings. `reducedMotion` being the only lever (which forks gameplay) is both a perf and an accessibility bug.

---

## Pillar 3 — The living world: predators, ecology, schedules, weather that demands decisions

A world feels alive in proportion to how much you respect its dangers and how much happens without you.

### 3a. Close the combat/stealth loop
Combat today: F toggles a stance, there is no attack input, and fang health decrements but **is never checked** — no death, no loot, no retreat. Finish the wiring:
- Click/tap attack cone while `combatEnabled` (no new input plumbing needed).
- Shadowfang **lunge state with a 0.5 s emissive-eye windup telegraph** (reuse `pulseAlert`).
- Check `a.health <= 0` → collapse → scannable specimen drop (fang quill — Pillar 5's economy) → respawn timer; retreat state below 30 health.

### 3b. Creature FSM + a real ecology
Refactor the inline if/else into explicit states (`graze/wander/alert/stalk/flank/lunge/retreat/ambush/feed`) on the existing Agent struct (~1 day). Then:
- **Boids separation/cohesion for the herd** (trivial at n=11; prismhoofs currently overlap).
- **Let shadowfangs hunt prismhoofs** when the player is out of range — both species share one agents array and one update loop; a witnessable hunt is ~30 lines. Emergent hunts the player can watch, interrupt, or scan turn the empty map into a place where things happen.

### 3c. Surface the path-learning predators (the hidden crown jewel)
- When the scanner is active, render a faint **predicted-intercept ghost marker** at each fang's `learnedBias` point (~20 lines).
- Add an **ambush FSM state**: fangs *wait* at the learned position at night.
- One codex entry teaching that varying your routes matters.

The emergent story you're buying: *"I always took the treeline path home, and on night three something was WAITING there."* Players will screenshot that codex entry.

### 3d. Make night mean something
The fern-scan objective should **require night** — when bioluminescence peaks (2g) but predator detection is boosted 1.25×. The safest time to survey is the most dangerous time to travel. **That single tension IS the game.** "It's getting dark and I'm far from the gate" is the oldest and best open-world emotion, and every ingredient is already computed in the store.

### 3e. Weather 2.0
- Replace the fixed 100-second loop with a **Markov transition table** with 5–10 s cross-lerps (fog, sun dim, particle opacity) instead of hard cuts.
- **Player-centered rain volume** — the current rain box is fixed at x±100/z-80..160, so the coast and ridge get no rain during "rain."
- **Storm approach warning** ~30 s before onset — Berger's "ozone like burnt citrus" as a comms line — so shelter-seeking becomes a decision, not a surprise.
- Wet ground after rain (lower terrain roughness, boost pad/road reflectivity).
- Keep lightning damage and the storm-survival achievement; they're correct design.

### 3f. NPC schedules
Replace the 3-mesh billboard blobs with the existing `AnimatedCharacter` rig (it already reads speed/anim from parent userData — NPCs get walk cycles for free). Give each of the 5 NPCs 2–4 stations keyed to `store.timeOfDay`, walking between them, with talked-state and weather-reactive one-line barks on the Html nameplates they already have. Everyone shelters in the dome during storms — which teaches the player to do the same.

### 3g. Population manager
Replace the fixed 11-agent array with per-zone spawn budgets (treeline fangs, plains herds, a coast scavenger species reusing existing meshes), distance-based activation (simulate within ~120 m), night/storm spawn waves, and **persist `learnedBias`/health into the existing save blob** — see the "planet remembers you" moonshot. The east half and coast are currently permanently empty.

---

## Pillar 4 — The feel: traversal, navigation, input, audio, photo mode

Moment-to-moment feel is the tax every other system pays.

### 4a. Traversal verbs
`sampleNormal()` is already written and **never imported by the controller** — the 14 m Ridge-7 is climbed at full 11.5 sprint speed like a parking lot.
- Dot the normal against move direction to slow uphill (`1 - 0.6*steepness`); auto-slide above a threshold on the ridge flanks with stand-up recovery.
- Add a vertical velocity channel with gravity + **Space jump** replacing the y-lerp snap when airborne. Sprint-jumping down the ridge scree is the "whee" moment this controller is one afternoon away from.
- Later: a plantable **zipline** from the ridge overlook (the map's high point) back toward the colony as an upgrade reward.

### 4b. Entity registry (the enabling refactor)
POI/collider coordinates are duplicated across at least 4 files (cache coords in `InteractionSystem` *and* `WorldPOIs`/`Ridge7`/`KaguyahimeCoast`; generator coords in `PlayerController` *and* `Colony`). Create one `ENTITIES` table in `data.ts` — `{id, x, z, radius, collider?, interaction?}` — and generate the interaction candidates, the collider loop (currently 5 hardcoded circles; towers, fence posts, rocks, and ruin columns are all walk-through), the signal-strength generator list, and the POI renders from it. **Adding one cache currently requires synchronized edits in 2–3 files; this is the prerequisite for all content scaling.**

### 4c. Camera occlusion
Run the desired camera position through analytic sphere tests against the registry's ~20 colliders and pull it in front of blockers (no raycaster needed). The camera currently clips through dome shells.

### 4d. Compass tape + waypoints (the open-world staple)
Replace the text compass with a horizontal scrolling bearing tape at top-center — **visible on mobile** — with pips for markers and the tracked objective plus distance-in-meters, and tap-to-ping waypoints on the map. `compassBearing`, `playerPos`, and `MARKERS` already exist. Only 2 of 15 objectives have world markers today. This single feature moves the feel from tech demo to open-world game more than any shader.

### 4e. Mobile input overhaul
- **Drag-to-look** on the right half of the canvas (matching the mouse factors) instead of the floaty rate-based stick mobile FPS abandoned.
- Floating-origin left stick with a rendered nub.
- Gate controls on `pointer: coarse` / `maxTouchPoints`, not viewport width — **touch tablets ≥640 px currently have no way to move at all**, while narrow desktop windows get thumbsticks.
- Route input through a typed module instead of `window.__touchInput`/`__keyE`/`__combatMul` (prerequisite for gamepad support and rebinding).
- `navigator.vibrate(10)` haptics on scan-complete/interact; "TAP" interact label instead of the hardcoded "E" keycap.

### 4f. Audio: from beds to a soundscape
The procedural no-assets approach is on-brand — extend it, don't replace it:
- **3D positional audio** (PannerNode + listener from the camera): the fang growl while `trackedByFang` becomes *directional* — you can hear where the stalker is (a gameplay feature, not garnish); thunder placed at the strike with distance-delayed onset; ruin resonance; beacon ping; colony chatter bed.
- **Adaptive music:** a slow modal chord-pad sequencer keyed by time-of-day, plus intensity layers (explore/tension/storm/ruin-mystery) crossfaded by one `setIntensity()` driven from state the store already has. A distinct resolution cue for the ending. Still 100% synthesized.
- **Bus architecture:** ambience/music/SFX gains with persisted sliders; rain layer + thunder one-shots (WeatherSystem currently has *no rain sound*); interior lowpass when `insideDome`; footstep variation by surface.
- **Audio captions** ("[low thrum — ruins east]", "[fang chitter behind]") — the engine is procedural so every cue is programmatic; this is the deaf-accessibility layer *and* a legibility layer for TRACKED, and it fits the terminal fiction natively.

### 4g. Photo mode that produces photos
Photo mode is currently "HUD off." Add capture: render to an offscreen canvas, composite a **diegetic CLASSIFIED frame** (watermark, callsign, 28-h timestamp, x/z coords), `toBlob` → download/share + auto-journal entry. Slow free-cam orbit, FOV/roll, 2–3 filters. Because terrain, scatter, and weather are all seeded/analytic, **a URL fully reproduces any vista** — add `?photo=x,z,yaw,tod` deep links and every player screenshot becomes a reproducible marketing asset for exodus2121.com.

### 4h. Onboarding, settings, accessibility
- **Real loading:** prefetch the GameCanvas chunk at `phase==='briefing'` (one line), drive BootScreen from drei `useProgress` (the current progress bar is a fake `animate-pulse` div), cover shader-compile with a drop-pod insertion transition. The fiction already provides the loading language.
- **Contextual tutorialization:** just-in-time prompts (first interact target, first scannable, first storm) instead of the front-loaded briefing wall; track shown-hints in the persisted store. Re-show ClickToPlay on pointer-lock loss (and fix its leaked listener).
- **Continue card:** persist `playerPos/yaw/timeOfDay/weather`; returning players currently always re-run select→briefing. "RESUME OPERATION — {callsign} · 9/15 objectives · last position Ridge-7."
- **Settings depth:** graphics presets (the quality ladder), look sensitivity, invert-Y, per-channel audio, key rebinding (keybinds are currently hardcoded across 3 files; M/C/O/Tab are documented nowhere in-game). Gamepad support becomes nearly free after the input refactor.
- **Accessibility pass:** one shared dialog wrapper (role, aria-modal, focus trap) for the 8 overlays; `aria-live` on the message feed; raise the 9–10 px type floor to 11–12 px (the dim-on-void combo fails WCAG AA at ~3.4:1); shape+color map markers with a legend; low-health vignette and bar-color thresholds (VITALS stays teal at 1 HP today); seed `reducedMotion` from `prefers-reduced-motion` and persist it.

---

## Pillar 5 — The return stroke: economy, quest chains, environmental storytelling, the book funnel

Every activity currently pays out in flags; caches are +12-health pickups. The expedition loop needs a reason to come home.

### 5a. Inventory → upgrades (pure wiring, zero new systems)
The genius of the current position: **the entire downstream of a progression system already exists** — speed/stamina/stealth/scanBonus/combatBonus all demonstrably affect play. Add an inventory slice (fern spores scanned at night, fang quills from kills, prism shards, collar components) and redeem at Voss/Berger via dialogue effects (`applyDialogueEffect` already exists) for permanent multiplier bumps. Every activity converts from flag-setting to progression.

### 5b. Mission-board chains with debrief loops
Give each `MISSION_BOARD` item a `stages` array and a return-to-NPC debrief node granting an exclusive codex stage. Voss's *"Log your exit. Log your return."* literally scripts the accept/act/report rhythm — make it mechanical.

### 5c. Environmental storytelling pass (~700 words, ~10 interact points)
Wire interactables onto meshes that already exist:
- **Carver's marker** → epitaph journal entry + `carver` codex (his death is discussed by two NPCs and his grave is an inert mesh).
- **Four Survey Team B cache logs** — a serialized 4-part story of the pre-quiet-protocol expedition; the final fragment reveals why they went silent. Caches become breadcrumbs that feed Pillar 1's knowledge gates.
- A **Verne hull plate** near Berger; a **Hale expedition camp** on Ridge-7 so the RuinModal name-drop pays off.

### 5d. Multi-stage codex + chapter tie-backs — the book-selling loop
This game exists to sell a novel and currently contains **zero mechanical path from play to purchase.**
- `CodexEntry` → `stages: {body, source}[]`: scanning ferns gives stage 1; witnessing their storm blackout upgrades to stage 2 (lattice link). Knowledge visibly deepens — the Subnautica loop.
- Add `chapterRef: {chapter, teaser, url}` rendered as *"Continue in 2121: EXODUS — Ch. 12"* with UTM-tagged links, and appended per-entry to `exportJournal()`. Every discovery becomes a purchase funnel, without feeling like an ad — the fiction earns it.
- **Surface the journal export:** Blob download + `navigator.share` on CompleteScreen, plus a `fieldops:journal-export` bridge message so exodus2121.com can render each reader's expedition log. The shareable artifact already exists; it has no doorway.

### 5e. Writing depth sprint (22 nodes → ~70, plus Ava)
- Add `flags: Record<string,boolean>` to the store and `if?/once?/setFlag?` on dialogue choices: NPCs remember you, returning-visitor greetings, Castillo's infinitely-farmable heal becomes once-per-storm.
- **Implement `commandBonus`** (currently dead code) as dialogue currency: command-gated branches where Thornhill admits the collar-drift numbers he hides from civilians, and Voss skips the clearance runaround for Theo — finally delivering Theo's advertised "colony staff open up faster."
- **The Ava comms layer** (Firewatch-style): an `AVA_LINES` table keyed on triggers the store already has (first treeline crossing, `trackedByFang`, storm onset, ruin radius, nightfall), rendered through the message ticker with a speaker prefix. Theo hears Ava; marine/survey get terse colony-net chatter — operatives differentiate narratively at toast-cost.
- Target: **~8k authored words** (from ~1,400). This is a writing sprint against an existing renderer — no new UI. For reference: Firewatch is ~35k words; 8–10k is companion-quality.

---

## Pillar 6 — The foundation: repo identity, saves, CI, telemetry, delivery

### 6a. De-template the repo
The repo still carries its generator's skeleton: `package.json` named `app-builder-workspace`, 27 KB of Grok-sandbox `AGENTS.md`, `startup.sh` cd'ing to `/workspace`, sandbox-only vite plugins, a leftover `nf3` override, ~30 zero-import dependencies in a 484-package install, and **1,465 LOC of dead auth/db code** (`src/lib/auth` 1,226 + `db.ts` 239 — the only thing imported is a literal `<>{children}</>` passthrough). Delete the auth tree, rename the package, purge the dead deps, fix the `.gitignore` contradictions, add LICENSE + `.nvmrc`. *Decision point:* keep `db.ts` + migrations **only** if committing to the telemetry/signaling routes below; otherwise delete those too and drop `db:migrate` from the build.

### 6b. Versioned saves with migrations (before any content expansion ships)
`hydrate()` restores `objectives[]`/`codex[]` **wholesale** from localStorage, so every content update in `data.ts` is invisible to existing players, and the only migration tool is a SAVE_KEY bump that wipes progress — fatal for a game meant to grow with a trilogy.
- Add `{version, updatedAt}` to the blob; on hydrate, **merge by id** (done/unlocked flags from the save, content from `data.ts`); migrations table keyed by version; sweep orphaned `lupus-fieldops-v1..v3` keys.
- Persist `playerPos/yaw/timeOfDay/weather/stamina`; offer Resume vs Redeploy.
- **Embed-storage survival:** Safari/Firefox partition third-party localStorage in the exodus2121.com iframe — embedded readers silently lose progress *today*. Add `fieldops:save-export`/`save-import` bridge messages so the parent stores the blob first-party (requires the origin allowlist from Part 0 #15).
- Optional: cloud saves. If accounts are ever wanted, note the better-auth stack was fully built; the leaner path for a companion game is the postMessage handoff plus an optional anonymous sync key.

### 6c. Store split for the bigger world
Per-frame fields (`playerPos`, `compassBearing`, `scanProgress`, `pathSamples` — which rebuilds a filtered array every call) flow through the React-subscribed store. Move them to a mutable transient module with a ~10 Hz throttled mirror for HUD; make `pathSamples` a ring buffer; replace the single `prevPhase` slot with a phase stack (the nested-ternary restore in `togglePhotoMode` already strains it).

### 6d. CI as a 3D-game regression net
There is no CI, no test script, and lint currently fails. A solo dev working with AI assistance needs machine-checked regressions *more* than a team does — an AI will confidently refactor shaders, and only a pixel diff catches the sky turning magenta. Critically, **this game is deterministic** (seeded LCGs, analytic terrain, deep links for spawn) — a nearly perfect screenshot-regression target, a property most 3D games have to fight for.
- `ci.yml`: `npm ci` → `tsc --noEmit` → `eslint` (after fixing the 3 hook errors) → `vite build` → **bundle budgets pinned to measured reality with headroom**: entry ≤ 110 KB gz (now 99.8), GameCanvas ≤ 280 KB gz (now 263.8), total ≤ 420 KB gz (now ~384) → Playwright.
- Convert the 8 assertion-free `scripts/qa-*.mjs` probes into `@playwright/test` specs with real assertions (canvas mounts, zero pageErrors, `__controlsTest.getSpeed() > 0` after held W, an objective completes); parameterize the hardcoded `/workspace` paths; keep the swiftshader headless-WebGL flags.
- **Screenshot regression:** 6–8 canonical shots via deep links (`?spawn=ridge7`, colony at dawn via a test-only `?tod=`, coast, storm) diffed against goldens with pixelmatch. Capture goldens *after* the AA/shadow fixes so you don't enshrine the aliased baseline.
- Extend `__controlsTest` with `getFps()` and assert a minimum headless framerate; mount `r3f-perf` in dev behind `?perf=1`.

### 6e. Marketing-funnel telemetry
The project currently cannot answer *"do players who finish the survey click through to the book?"* Two options: a tiny privacy-respecting `POST /api/events` route (no cookies, no PII) on the existing `db.ts`, or zero-backend Plausible custom events on exodus2121.com fed by the postMessage bridge. Instrument the funnel the store already models: boot → select → deploy (`fieldops:started` already fires) → per-objective → complete (with ending!) → journal export → chapter-link clicks.

### 6f. Delivery polish
- **Slim the serverless function:** the Vercel SSR bundle ships a 2.62 MB raw / 527 KB gz three+drei chunk it can never render — gate GameCanvas behind a `typeof window` dynamic import so it drops from the SSR graph.
- Import `audio.ts` statically in `store.ts` (kills the INEFFECTIVE_DYNAMIC_IMPORT warning).
- Self-host IBM Plex as woff2 (the Google Fonts link is render-blocking *and* breaks offline); replace the **70-byte 1×1-pixel placeholder PWA icons** with real renders; add manifest id/screenshots/shortcuts (deep-link spawns are perfect shortcuts).
- Build-versioned service-worker precache (network-first navigations + offline fallback, cache-first hashed assets) — the 1.4 MB game becomes genuinely offline-installable: *"take the survey off-grid"* is a marketing line, not just hygiene.
- Commit `vercel.json` + cache headers + `Content-Security-Policy: frame-ancestors 'self' https://exodus2121.com`; resolve the pinned `nitro 3.0.260603-beta` (a dated beta that will someday be unresolvable); delete or actually implement the speculative Cloudflare section of DEPLOY.md.

---

## Moonshots — the features that make it *distinctive*, not just polished

1. **Reader ghosts.** `src/lib/multiplayer/p2p.ts` is **571 lines of production-grade WebRTC** (perfect negotiation, dual reliable/unreliable channels, stall-watchdog recovery) that nothing imports — the missing piece is the small `/api/rtc` signaling route whose wire contract the client already defines. Broadcast `{pos, yaw, anim}` at 10 Hz and render other current readers as **silent holographic survey ghosts** — no chat, callsigns only, deliberately mute *to honor the quiet-protocol theme*. Being alone-together on a world where broadcasting is forbidden is the rare multiplayer concept that IS the book's theme. 80% of the hard part is already written.
2. **The quiet protocol is communal.** Aggregate the broadcast/silent ending choice across all players (one tiny counter) and surface it diegetically: *"ODYSSEY COMMAND NOTE: 3.1% of field operatives have violated quiet protocol."* A live social statistic readers screenshot and argue about; each book launch resets the count as a new survey rotation.
3. **The planet remembers you.** Persist creature `learnedBias`, health, and ambush history across sessions, and have Ava comment: *"The pack has adjusted to your patterns, Operative."* A predator ecology that carries grudges between visits turns a 20-minute toy into a place players return to warily. Costs one persistence-whitelist entry and a few comms lines.
4. **Chapter-keyed scene links.** `?chapter=N` deep links mapping to curated `{spawn, ceiling, time-of-day, weather, highlighted objective}` presets, so every chapter page on exodus2121.com offers **"Visit this scene"** — landing the reader at Kaguyahime Coast at dusk in the rain right after reading it. The deep-link plumbing already exists; this converts the game from a companion into the novel's atmosphere engine.
5. **Book II as an in-world event.** The coast region, Tomas, and a `book2late` ceiling unlock at the minute of Book II's release — preceded by an in-game countdown on the mission board and escalating anomaly readings at the coast in the prior weeks. The game becomes the launch campaign. (Requires the ceiling enum generalization: `book2?: boolean` → `ceiling?: 'book2early'|'book2late'|'book3'` — the enforcement points are already centralized.)
6. **The expedition log as artifact.** Player-authored journal notes (make `journal3` honest — the composer is one textarea; `addJournal` already accepts arbitrary content) + photo captures + the ending choice + a route trace, composited into a generated shareable field report the novel site renders. Every completed run becomes user-generated marketing.
7. **ARG seam between game and book.** Coordinates hidden in the printed novel resolving to deep-link locations with book-exclusive codex stages — and one in-game codex entry whose "source" is a page number in the physical book. Bidirectional treasure-hunting between a paperback and a browser game is a story the tech press writes about for free.
8. **Survey Window mode.** An optional run frame: conclude the mission within N in-game days (3 days = 24 real minutes), broadcast/silent forced at deadline — a roguelike-adjacent replay loop built entirely from existing systems, where operative choice, route mastery, and the predator-learning system matter across runs.
9. **Engineering headroom:** geometry-clipmap terrain for an effectively unbounded planet slice at constant cost; a half-res raymarched volumetric storm layer for the high tier; WebGPU discipline (keep every shader as a named chunk in one `src/game/shaders/` module, port chunk-by-chunk when R3F's WebGPU path stabilizes; first win: compute-placed grass at 500k+ instances).

### Canon pipeline (do this before the writing sprint)
The manuscripts are not in the repo, and nothing prevents the game from silently contradicting them — the exact failure mode that kills transmedia trust with the readers most likely to evangelize. Add **`canon/CANON.md`**: every proper noun the game touches (Carver, Hale, the Verne, Promethei Terra, Office of the Voice, quiet protocol, Ava, Kaguyahime, collar tech, the 28-hour day) with the manuscript-sourced fact, chapter citation, what the game may reveal per ceiling tier, and an OPEN QUESTIONS list for things the game *invents* (which feed back to the manuscript — the 28-hour clock and fern lattice numbers already originate here). Add a `canon-lint` script to CI that fails when an authored string in `data.ts` uses a canon term with no CANON.md entry. Every AI-assisted writing session then loads CANON.md as mandatory context. Restructure content into per-ceiling modules (`content/book1.ts`, `content/book2.ts`) so a Book II drop is a new file + an enum value + a save-merge, not surgery.

---

## Suggested sequencing (a solo-dev, AI-assisted 12-week shape)

| Phase | Weeks | Focus | Key deliverables |
|-------|-------|-------|------------------|
| **0. Triage** | 1 | Part 0 in full | Spoiler default flip, AA, shadows, hook errors, bounds clamp, mobile blackout, save-wipe confirm, origin allowlist, weather sim/render split, dead-file deletion |
| **1. Spine + net** | 2–3 | Pillars 1 & 6d/6b | Knowledge-gated quest graph, Broadcast Choice, versioned save-merge, CI with budgets + Playwright asserts, CANON.md |
| **2. Feel** | 4–5 | Pillar 4a–4e | Slope/jump, entity registry, camera occlusion, compass tape + waypoints, mobile input overhaul, continue card, contextual tutorial |
| **3. Planet** | 6–8 | Pillar 2 | FBM heightfield + `sampleBiome` (afternoon), chunked LOD terrain, splatting, sky dome, height fog, coast water, mass vegetation + grass + wind, quality ladder; recapture CI goldens |
| **4. Life** | 9–10 | Pillar 3 | Combat loop closure, creature FSM + ecology + ambush surfacing, NPC schedules, Weather 2.0, population manager, night-survey tension |
| **5. Return stroke** | 11–12 | Pillar 5 + 6e/6f | Inventory→upgrades, mission chains, environmental-storytelling pass, multi-stage codex + chapterRef funnel, writing sprint to ~8k words, Ava layer, telemetry, PWA/deploy polish, photo mode |
| **6. Distinctive** | ongoing | Moonshots | Reader ghosts (`/api/rtc`), communal quiet-protocol stat, chapter scene links, Book II event machinery |

Rough effort inside phases: Part 0 is ~a week of one-liners-to-afternoons; the chunked-terrain migration is the one genuinely large item (~a focused week); everything else is 1–4-day passes. The writing sprint (~8k words) parallelizes with engineering from Phase 1 onward once CANON.md exists.

---

## Appendix A — Measured baseline (for budgets and regression)

| Metric | Value (verified production build) |
|---|---|
| Entry chunk | 318 KB raw / **99.8 KB gz** |
| GameCanvas chunk (three+R3F+drei+postFX+scene, lazy) | 1,010 KB raw / **263.8 KB gz** |
| Total client JS | ~1.40 MB raw / **~384 KB gz** |
| Vercel SSR function dead weight | 2.62 MB raw / 527 KB gz (drei+three chunk it can never render) |
| Source | ~8.5k LOC TS/TSX; scene dir ~2,880 LOC |
| Dead code | `src/lib/auth` 1,226 LOC + `db.ts` 239 LOC + `p2p.ts` 571 LOC (dormant, high quality) + `Sky.tsx`/`Atmosphere.tsx` |
| Authored content | 15 objectives · 17 codex entries · 5 NPCs · 22 dialogue nodes / 31 choices · ~1,400 words |
| World | ~520×340 m playable; 480×480 mesh @ ~4.8 m/quad; ~202 trees, 420 ferns, 11 creatures |
| `tsc --noEmit` | passes |
| `eslint` | **fails** — 3 rules-of-hooks errors (`KaguyahimeCoast.tsx:17-20`) |
| CI / tests / telemetry | none |

## Appendix B — The one-sentence version

Ship the Part 0 fixes this week; gate the ruin behind knowledge and add the Broadcast Choice; make the terrain FBM-chunked, the sky a shader, and the coast wet; close the combat loop and *show players the predators learning their routes*; give every activity a return stroke that ends in "Continue in 2121: EXODUS, Ch. N"; wrap it in CI, versioned saves, and telemetry; then light up reader ghosts on a planet where broadcasting is forbidden — and this becomes not just a world-class web open world, but the best book-companion game on the internet.
