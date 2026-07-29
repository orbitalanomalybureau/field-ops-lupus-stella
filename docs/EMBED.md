# Embedding Field Ops on the novel site

The game is designed to live in an iframe on [exodus2121.com](https://exodus2121.com).
`/terminal` is a working reference implementation of the host side — read it
alongside this document.

## The snippet

```html
<iframe
  src="https://play.exodus2121.com/embed?spoiler=book1"
  title="Field Ops: Lupus Stella"
  allow="fullscreen; autoplay; pointer-lock; gamepad"
  style="width:100%;aspect-ratio:16/9;border:0;background:#05060a"
></iframe>
```

`public/embed-snippet.html` generates this with the current options filled in.

## Deep links

| Param | Values | Effect |
|---|---|---|
| `spoiler` | `book1` \| `book2early` | Spoiler ceiling. **Defaults to `book1`** — never show a first-book reader Book II content. |
| `operative` | `theo` \| `marine` \| `survey` | Preselects the operative and jumps to the briefing. |
| `spawn` | `south-gate` \| `colony` \| `ridge7` \| `ruins` \| `coast` \| `treeline` | Where the operative deploys. |
| `chapter` | `1`…`16` | Curated scene preset: spawn, spoiler ceiling (raise-only), time of day, weather, and an arrival note for that chapter. See [Chapter scene links](#chapter-scene-links). |
| `auto` | `1` | Deploys immediately if an operative is already chosen. Audio still needs a user gesture. |

QA pins (`?tod=0..1`, `?wx=clear|haze|rain|storm`) and `?quality=low|medium|high`
also exist and behave exactly as before; they win over anything a `chapter`
preset sets, as does an explicit `?spawn`.

## Chapter scene links

`?chapter=N` (or `chapter` on a `fieldops:deeplink` message) is the per-chapter
**"Visit this scene"** hook: the reader lands where the chapter happens, at its
hour, under its weather, with a one-line arrival note in the ticker. The preset
only ever **raises** the spoiler ceiling toward the chapter's level — a link
from the chapter-16 page proves the reader got there — and never lowers a
ceiling the reader already chose. Unknown chapter values are ignored.

| Chapter | Scene | Hour | Weather | Ceiling |
|---|---|---|---|---|
| 1 | Colony | amber dawn | clear | `book1` |
| 2 | Colony | day | haze | `book1` |
| 3 | Colony | midday | clear | `book1` |
| 4 | Colony generators | dusk | haze | `book1` |
| 5 | Treeline | day | haze | `book1` |
| 6 | Treeline (fern pulse) | night | clear | `book1` |
| 7 | South gate / Carver marker | late day | haze | `book1` |
| 8 | Treeline | night | haze | `book1` |
| 9 | Ridge-7 | day | clear | `book1` |
| 10 | Ridge-7 | day | **storm** | `book1` |
| 11 | Treeline | day | rain | `book1` |
| 12 | Southern ruin | day | haze | `book1` |
| 13 | Colony | night | clear | `book1` |
| 14 | Colony (command dome) | afternoon | haze | `book1` |
| 15 | Coast memorial | dusk | haze | `book2early` |
| 16 | Coast memorial | dusk | clear | `book2early` |

The presets live in `src/game/data.ts` (`CHAPTER_SCENES`); the arrival notes
reuse the codex `chapterRef` teasers, so the link, the in-game codex funnel,
and the book page speak the same line.

## Presence — survey ghosts

Other current readers appear in-world as **silent holographic survey ghosts**.
There is no chat and no interaction — callsigns only, deliberately mute.
Privacy posture:

- The only data on the wire is a position/orientation/animation sample and one
  of the three fixed operative callsigns. There is no free-text channel of any
  kind.
- Peer ids are random per session. Nothing persistent identifies a reader.
- Nothing from the wire is trusted: remote positions are clamped to world
  bounds and every string is sanitized before render.
- Settings → PRESENCE turns it off entirely (persisted with the save
  preferences). Off is total: the client neither joins the mesh nor transmits.

**Host-relevant:** presence rooms are partitioned by spoiler ceiling — the
room name is `fieldops-<spoilerCeiling>` — so a `book1` reader never sees
ghosts standing at Book II locations. Framing the game with `?spoiler=book1`
therefore also selects the book1-only room.

## Aggregate ending tally

**Host-relevant:** the game reports each completed run's ending to
`POST /api/protocol` (`{ ending: "silent" | "broadcast" }`, one count per run,
no identifiers) and reads the aggregate back from `GET /api/protocol`
(`{ broadcast: number, silent: number }`) to render the communal
quiet-protocol statistic on the completion screen. A host page may hit the GET
endpoint to surface the same number on the novel site. Below a small quorum of
total runs the game shows a sealed-tally line instead of a noisy percentage.

## The message protocol

All shapes are defined once in [`src/lib/embed.ts`](../src/lib/embed.ts) — import
the types rather than hand-rolling string literals.

### Game → host

| Message | Payload | When |
|---|---|---|
| `fieldops:ready` | `{ embed }` | The game mounted and is listening. |
| `fieldops:phase` | `{ phase }` | Every phase change (boot, select, playing, complete…). Drives the host's status indicator. |
| `fieldops:started` | `{ operative }` | The player deployed to the surface. |
| `fieldops:complete` | `{ ending, objectives, total, discoveries }` | The survey was sealed. `ending` is `"silent"` or `"broadcast"`. |
| `fieldops:discovery` | `{ id, title, chapter? }` | A codex entry unlocked. Use it to reveal companion content or fire an analytics event. |
| `fieldops:journal-export` | `{ text }` | The player exported their field log — render it, or offer it as a download. |
| `fieldops:save-export` | `{ blob, version }` | Save handoff; see below. |

### Host → game

| Message | Payload | Effect |
|---|---|---|
| `fieldops:pause` | — | Toggles pause. |
| `fieldops:reset` | — | Wipes the run. Confirm on your side first. |
| `fieldops:journal` | — | Opens the field journal. |
| `fieldops:photo` | — | Toggles photo mode. |
| `fieldops:deeplink` | `{ spoiler?, spawn?, operative?, chapter? }` | Applies a deep link without reloading the iframe. |
| `fieldops:save-import` | `{ blob }` | Injects a previously exported save before the game hydrates. |

## Origin security

Outbound messages are posted to each allowlisted origin explicitly, never with
`"*"`. Inbound messages are dropped unless `event.origin` is allowlisted.
Configure with `VITE_EMBED_PARENT_ORIGINS` (comma-separated); the game's own
origin is always allowed, and dev builds allow everything so local host pages
and tunnels keep working.

Deployments should also set the `frame-ancestors` CSP directive so only the
novel site can frame the game — `vercel.json` does this.

## Cross-origin storage (important)

Save data lives in the **game's** `localStorage`. Inside a cross-origin iframe,
Safari (ITP) and Firefox partition or block third-party storage, so an embedded
reader can silently lose all progress.

The mitigation is the save handoff: the game emits `fieldops:save-export` when
progress changes, the host stores that blob in its own first-party storage, and
on the next load the host sends `fieldops:save-import` before the game hydrates.

```js
const FRAME = document.querySelector("iframe");
const KEY = "fieldops-save";

window.addEventListener("message", (e) => {
  if (e.origin !== "https://play.exodus2121.com") return;
  if (e.data?.type === "fieldops:save-export") {
    localStorage.setItem(KEY, e.data.blob);
  }
  if (e.data?.type === "fieldops:ready") {
    const blob = localStorage.getItem(KEY);
    if (blob) {
      FRAME.contentWindow.postMessage(
        { type: "fieldops:save-import", blob },
        "https://play.exodus2121.com",
      );
    }
  }
});
```
