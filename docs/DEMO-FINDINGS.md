# Full demo-mode playthrough — findings and resolutions

Six playtest passes drove the whole game end to end against the Wave C build:
the golden fresh-player path, the night/economy loop, the western expedition,
the endgame (both endings), combat (melee + rifle), and systems (settings,
map, mobile, embed, deep links). 63 behaviours verified working; 25 defects
filed. **All 25 are fixed** in the demo-fix wave, each re-verified against the
rebuilt preview by `tests/demo-verify.spec.ts` (manual project) plus the full
regression suite.

## Blocker

| # | Finding | Resolution |
|---|---|---|
| 1 | After "Continue exploring", the chamber could never be re-opened — `!ruinOpened` gated the only prompt, and both endings live in RuinModal. Persisted; a save could be permanently locked out of finishing. | `reenterRuin()` store action + a "Return to the chamber" prompt whenever the chamber has been breached. Re-entry replays none of the one-shot effects. |

## Major

| # | Finding | Resolution |
|---|---|---|
| 2 | "Walk the south perimeter" auto-completed at spawn (spawn sits 2 m inside the trigger). | Trigger arms only after the player has been >25 m from the gate. |
| 3 | E presses queued during dialogue/pause replayed on close/resume — dialogues reopened themselves. | `clearEdges()` on every phase transition; no queued press crosses a phase boundary. |
| 4 | Day fern scan refusal feedback unreliable + would spam every 1.1 s if held. | Refusal verified firing (playtester miss was a harness artifact) and throttled to one message + buzz per 6 s per target. |
| 5 | Rebinding panel/UI actions did nothing — M/C/O/Tab/J/P/K hardcoded; a stolen key could trigger two actions. | All UI hotkeys route through `matchesAction()`; rebinds now apply everywhere. |
| 6 | NPC nameplate/bark drew over the dialogue modal at huge scale (covered choices on mobile landscape). | World labels get `zIndexRange [12,0]` (below overlays), hide during dialogue, and hide inside 2.5 m. Applied to NPCs, ghosts, dome, ridge, coast, POI labels. |

## Minor

| # | Finding | Resolution |
|---|---|---|
| 7 | Escape stacked the pause menu on top of an open codex/map. | Panel-closer registry: Escape closes the topmost transient panel first; second press pauses. |
| 8 | Proximity-scaled labels blew up at close range (screen-wide OPS FLOOR banner). | Ops-floor label is now a small fixed-size hatch sign; close-range plate hide covers the NPC case. |
| 9 | Dialogue lost keyboard focus after a choice click — Escape/Tab trap dead. | Dialog refocuses on content change (`focusKey` = node + visible choices). |
| 10 | Chapter-16 arrival note flooded off the ticker in seconds; reader spawned already TRACKED at night. | 15 s ambient-NET quiet + 45 s clock hold on chapter deploys; TRACKED can no longer arm without route data (below). |
| 11 | Journal export said x/12 while the HUD said x/10 — leaked hidden-tasking count. | Export counts `visibleObjectives()`, same lens as the HUD. |
| 12 | TRACKED chip lit seconds into a fresh spawn with zero route history. | Tracking arms only after ≥45 sim-seconds of this-run route learning; contact objective needs an actively hunting, detected fang. |
| 13 | Objectives panel covered the vitals/ZPE bars below ~560 px viewport height. | Objectives (and codex) panels height-clamp against the vitals panel. |
| 14 | `/nonexistent` rendered browser-default "Not Found". | Themed `SECTOR UNCHARTED` 404 with RETURN TO COMMAND. |
| 15 | `/terminal` boot log skipped a line and rendered a blank `›` row (interval closure bug). | Updater derives the cursor from `prev.length`; all four lines type in order. |
| 16 | Tutorial hints spoke keyboard ("Press E") on touch devices until first touch. | Input device seeds from `(pointer: coarse)` at module init. |
| 17 | Day-scan refusal had no cooldown (code trace). | Covered by #4. |

## Polish

| # | Finding | Resolution |
|---|---|---|
| 18 | Compass tape/rail labels collided into garble at clustered bearings. | Nearest-wins label de-overlap + reserved band around cardinal letters; ticks/glyphs always render. |
| 19 | Staged-storm "WX ALERT — ION STORM CELL" wiped by the deploy ticker reset. | Alert re-posts after the reset, under the arrival note. |
| 20 | Communal tally quorum off-by-one vs. its own comment. | `>=` at exactly-quorum. |
| 21 | ZPE discharge spike decayed in wall-clock time, decoupled from the sim. | `noise.ts` decay now runs on the combat sim clock (`tickNoise(dt)` from Creatures). |
| 22 | Hold-to-aim (RMB) documented nowhere. | Keybind card footer gained the mouse line. |
| 23 | Objective copy hardcoded "Hold Q to scan". | `{scan}` binding token resolved live (HUD render) and at journal-write time. |
| 24 | Stance chip read "SAFE" mid-discharge. | Third `◉ AIMED` state driven by aim telemetry. |
| 25 | Dry fire was audio-only; cell recharge cadence invisible. | Reticle/pips flash on dry fire; the recharging pip renders a partial fill. |

## Verified working (highlights of the 63)

Cold boot → select → briefing → deploy with zero console errors across every
segment; dialogue once-gates and trade tiers (all four NPCs, broke and seeded
states); waiver gating, beacon, cache, Hale camp, storm survival objective;
spoiler ceiling — no Kaguyahime leak under book1, full coast content under
book2early, mid-save flips clean both directions; both endings + countersign
auto-disarm + post-ending reset; melee, quill harvest, rifle cell economy,
noise-draws-predators, prismhoof stampede; settings quality ladder live-switch;
map waypoints and fast travel; mobile portrait/landscape layouts; /embed and
/terminal postMessage bridge; reduced-motion; presence persistence; save
resume/reset.

## Areas for improvement (noted, deliberately not done in this wave)

Curated from the playtesters' suggestions plus the standing review backlog —
roughly in value order:

1. **Adaptive music layer** — modal pads that thicken with threat state; the
   procedural audio engine already has the hooks (see Tone.js note in
   [OSS-TOOLBOX](OSS-TOOLBOX.md)).
2. **"NEW OBJECTIVE" highlight** when a hidden tasking reveals — the total
   silently grows (10→11) today; a pulse on the new row would make it legible.
3. **Rest confirmation** — the bunk accepts instant back-to-back rests; a 1–2 s
   hold-to-confirm would prevent accidental double time-skips.
4. **Harvest regrowth cue** — fern beds silently respawn after half a day;
   nothing in-game says so. A scanner line ("bed re-luminous") would teach it.
5. **Berger's hidden trade** — a broke player never learns Berger buys prism
   shards; an ungated flavor line naming the price would fix discoverability.
6. **First-frame framing** — fresh spawn faces a light tower 2 m ahead; nudge
   spawn yaw for a better opening shot.
7. **Scree-slide telegraphing** — the slide works but gives no feedback; a
   "footing lost" line or stamina tick would name the mechanic.
8. **Dialogue open placeholder** on slow devices — the store enters dialogue
   phase before the modal commits; an instant "COMMS…" chip would cover the gap.
9. **Melee swing count** — marine kills a fang in 2 swings vs. the ~3 the
   design brief describes; confirm intended per-operative counts.
10. **Chapter-quiet scope** — the NET-quiet window starts at page load (not
    deploy) and doesn't cover AVA lines; revisit if reader-funnel telemetry
    shows notes still getting buried.
11. **QA observability** — a read-only `__stateTest` snapshot (inventory,
    flags, codex stage, recent messages) would make future playtests far less
    brittle than parsing HUD text.
12. **Keybind capture hint** — settings can't bind mouse buttons; a one-line
    "keyboard only — mouse 1 always strikes" would pre-empt confusion.
13. **Shared ArmedButton** — RuinModal's countersign and CompleteScreen's
    new-operative confirm duplicate the same 5 s arm/auto-disarm pattern.
14. **Known residual**: at 812×375 with a worst-case vitals panel (4 specimen
    types + TRACKED), the objectives panel's top sliver can still overlap —
    fully separating them needs a layout change, not a clamp.

Deliberate NOT-DOs (design guardrails, unchanged): no floating world-space
game UI, no combat-required endings, no physics engine, no minimap radar that
trivializes the compass/tracking fiction.

## Open-source / free software

See [OSS-TOOLBOX.md](OSS-TOOLBOX.md) for the curated list (rendering, asset
pipeline, CC0 assets, audio, QA/telemetry, presence infrastructure), each with
license and what it buys this specific build.
