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
| `chapter` | `1`…`N` | Curated scene preset: spawn, ceiling, time of day, weather, and highlighted objective for that chapter. The intended per-chapter "Visit this scene" hook. |
| `auto` | `1` | Deploys immediately if an operative is already chosen. Audio still needs a user gesture. |

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
