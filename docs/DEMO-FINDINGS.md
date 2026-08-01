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

## Improvement backlog — implemented

Everything below was filed as an improvement by the playtesters and has since
been built. Verified by `tests/demo-improve.spec.ts` plus screenshots.

| # | Improvement | What shipped |
|---|---|---|
| 1 | Adaptive music layer | `src/game/music.ts`: three cross-fading strata in D Phrygian (survey → alert → hunted) driven by a store subscription (tracked/aggro/health/weather/interior/reduced-motion). Zero samples, ~1.6 KB gz, 10 oscillators while playing, released on stop. |
| 2 | "NEW OBJECTIVE" highlight | NEW chip on unseen taskings + unread dot on the Obj button, using the codex UPDATED pattern (device-local marker, cleared when the log is read). |
| 3 | Rest confirmation | The bunk is now a ~1.2 s hold: `InteractPrompt.hold` (0..1) drives a filling key glyph and the sub-line reads "HOLD E · watch rotation". A tap does nothing; one hold rotates once. |
| 4 | Harvest regrowth cue | One scanner line per regrowth event ("SCANNER — fern bed re-luminous. Sample window open."), collapsed to a single generic line when several sites lapse together. |
| 5 | Berger's hidden trade | Ungated "Anything you're short of?" branch names the shard, its source and the price; the priced choice reuses the existing once-flag, so the economy is unchanged. |
| 6 | First-frame framing | South-gate spawn moved (0,40)→(−6,41) yaw −0.2: the opening frame shows the gate post, Berger and the dome cluster instead of a light-tower pole. |
| 7 | Scree-slide telegraphing | One "FOOTING — scree giving way. Ride it out." + alert blip on a slide that actually takes (0.35 s arm, 8 s quiet window). |
| 8 | Dialogue open placeholder | A "COMMS…" chip written imperatively to the DOM on the phase flip, behind a 200 ms anti-flash threshold, covered by the real panel when it paints. |
| 10 | Chapter-quiet scope | The grace window now arms at deploy (not URL parse) and mutes NET/AVA/RECON ambient traffic only — objective, tasking, scan and player-action lines always post. |
| 11 | QA observability | Read-only `window.__stateTest` (inventory, flags, codex stage, objective counts, recent messages, phase, clock, weather, tracked, health) + a `gameState(page)` test helper. |
| 12 | Keybind capture hint | "Keyboard only — mouse buttons cannot be bound. Mouse 1 always strikes, right mouse always aims." under the capturing row. |
| 13 | Shared ArmedButton | `src/components/ui/ArmedButton.tsx` now backs all three arm/confirm controls (ruin countersign, new operative, pause-menu abort) with one 5 s stand-down constant the caption quotes. |
| 14 | 812×375 residual | Fixed by restructuring, not clamping: under ~420 px viewport height the vitals block goes inline and the objectives panel takes a matching reserve. Desktop unchanged. |
| — | World-label distance gating | Every world-space `<Html>` mounts only inside a radius (14 m for interact echoes, 40 m for pips) via one shared `ProximityLabel`; label DOM that duplicates the HUD prompt is `aria-hidden`. |
| — | Canvas hint retires | "Click canvas to look" now clears on keyboard/gamepad input or after 15 s, instead of sitting over the world forever in embeds. |

### Cross-file bugs found while integrating (also fixed)

- **Fast travel never moved the operative.** The mission board wrote the store,
  but the controller owns its transform and overwrote `playerPos` on the next
  frame — the player snapped back on resume. There is now a real placement
  contract (`src/game/placement.ts`); fast travel and the post-flatline evac
  both go through it instead of reaching for the `__controlsTest` QA global.
- **Resting restored no stamina.** `setStamina(100)` was overwritten by the
  controller's local authority every frame; it now adopts external raises.
- **A spawn yaw of exactly 0 was discarded** (`initYaw || Math.PI`), so the
  colony spawn had always faced south instead of the dome.

## Still open

- **Melee swing count — needs your call.** Fang HP 100, `ATTACK_DAMAGE` 40 ×
  `combatBonus`: Theo 1.1 → 3 swings, Marine 1.35 → **2**, Survey 0.85 → 3.
  The design brief says ~3. Making the marine 3 means dropping their
  `combatBonus` below 1.25 in `data.ts` — a balance change, so it is yours.
- **Hold-to-confirm is keyboard-only.** Touch sends a single tap edge and the
  pad re-adds its edge each poll, so the bunk stays a press there; expressing a
  hold on those devices needs `input.ts` to report held state per device.
- **Ambient lines suppressed during the chapter grace are lost for that run**
  (AvaComms latches `fired` before pushing) — pre-existing, now also true of
  AVA lines.
- **Golden screenshots will need re-baselining** on Linux: the spawn framing
  and label gating change what wide shots contain.
- 18 NEEDS-CHECK canon entries in `canon/CANON.md`; `DATABASE_URL` on Vercel
  for presence.

Deliberate NOT-DOs (design guardrails, unchanged): no floating world-space
game UI, no combat-required endings, no physics engine, no minimap radar that
trivializes the compass/tracking fiction.

Deliberate NOT-DOs (design guardrails, unchanged): no floating world-space
game UI, no combat-required endings, no physics engine, no minimap radar that
trivializes the compass/tracking fiction.

## Open-source / free software

See [OSS-TOOLBOX.md](OSS-TOOLBOX.md) for the curated list (rendering, asset
pipeline, CC0 assets, audio, QA/telemetry, presence infrastructure), each with
license and what it buys this specific build.
