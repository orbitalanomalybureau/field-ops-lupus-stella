import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "@/game/store";
import { MARKERS, WORLD } from "@/game/data";
import {
  isObjectiveActionable,
  passesCeiling,
  visibleObjectivesOf,
} from "@/game/selectors";
import { getKeymap, isHeld, lastDevice, type Device } from "@/game/input";
import type {
  CodexEntry,
  ItemId,
  Objective,
  ObjectiveId,
  WeatherKind,
  WorldMarker,
} from "@/game/types";
import {
  Crosshair,
  Map as MapIcon,
  BookOpen,
  NotebookPen,
  Activity,
  Radio,
  Pause,
  Scan,
  CloudRain,
} from "lucide-react";

type Vec2 = { x: number; z: number };

/** Arc of the world the bearing tape shows, centred on the heading. */
const TAPE_SPAN_DEG = 120;
const TAPE_HALF_DEG = TAPE_SPAN_DEG / 2;
const TICK_STEP_DEG = 15;
/** More pips than this and the tape is unreadable at phone width. */
const MAX_MARKER_PIPS = 4;

const CARDINALS: Record<number, string> = {
  0: "N",
  45: "NE",
  90: "E",
  135: "SE",
  180: "S",
  225: "SW",
  270: "W",
  315: "NW",
};

const WARN_HEALTH = 50;
const CRITICAL_HEALTH = 25;
/** PlayerController refuses to sprint at or below this stamina. */
const SPRINT_FLOOR = 2;

/** Where every codex chapter link points; one env var overrides for staging. */
const NOVEL_SITE_URL =
  (import.meta.env.VITE_NOVEL_SITE_URL as string | undefined) ??
  "https://exodus2121.com";

/**
 * Last codex stage the operative has actually looked at, per entry id. Local
 * marker, not save data: "you have not read this yet" belongs to the device,
 * and losing it costs one spurious UPDATED tag, nothing more.
 */
const CODEX_READ_KEY = "fieldops-codex-read-v1";

function readCodexMarker(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(CODEX_READ_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number") out[k] = v;
    }
    return out;
  } catch {
    // Private mode or a mangled blob: every advanced entry tags UPDATED once.
    return {};
  }
}

function writeCodexMarker(marker: Record<string, number>): void {
  try {
    window.localStorage.setItem(CODEX_READ_KEY, JSON.stringify(marker));
  } catch {
    // Best-effort only.
  }
}

/**
 * Resolve what a codex entry currently says. Stage n (1-based) reads
 * stages[n-1]; entries without stages, or not yet advanced past the base
 * unlock, fall back to the flat body.
 */
function codexBodyOf(
  entry: CodexEntry,
  stage: number,
): { body: string; source?: string; stage: number; total: number } {
  const stages = entry.stages;
  if (!stages || stages.length === 0)
    return { body: entry.body, stage: 0, total: 0 };
  // Stage 0 is the base body — the first unlock. Only once codexStage reaches
  // n does stages[n-1] show. Flooring the index at 0 leaked every entry's
  // deepest, command-gated stratum on first contact (the collar cover-up, the
  // chamber catalog) and made stage progression invisible.
  if (stage < 1)
    return { body: entry.body, stage: 0, total: stages.length };
  const idx = Math.min(stage, stages.length) - 1;
  const current = stages[idx];
  return {
    body: current?.body ?? entry.body,
    source: current?.source,
    stage: idx + 1,
    total: stages.length,
  };
}

/**
 * Samples the field team actually carries. Shapes reuse the map glyph set so
 * the row stays legible without colour, same as the tactical map.
 */
const ITEM_ORDER: ItemId[] = [
  "fang-quill",
  "fern-spore",
  "prism-shard",
  "collar-component",
];

const ITEM_META: Record<
  ItemId,
  { label: string; shape: Exclude<MarkerShape, "waypoint">; tone: string }
> = {
  "fang-quill": { label: "quill", shape: "triangle", tone: "text-warn" },
  "fern-spore": { label: "spore", shape: "circle", tone: "text-fern" },
  "prism-shard": { label: "shard", shape: "diamond", tone: "text-accent" },
  "collar-component": { label: "collar", shape: "ring", tone: "text-primary" },
};

/**
 * Map window, derived from the one constant the walk box is derived from: it is
 * a superset of PlayerController's clamp, which is WORLD.bounds in x and a band
 * running from just north of the plateau down past the coast in z (the world is
 * authored southward from the colony). Hardcoded projection numbers here used
 * to let the schematic drift away from the world it claims to describe.
 */
const MAP_MIN_X = -WORLD.bounds;
const MAP_MAX_X = WORLD.bounds;
const MAP_MIN_Z = -WORLD.bounds * 0.2;
const MAP_MAX_Z = WORLD.bounds * 1.2;
/** Percent inset so a pip on the boundary is not clipped in half. */
const MAP_PAD_PCT = 7;
const MAP_SPAN_PCT = 100 - MAP_PAD_PCT * 2;
/** Click tolerance for "you tapped the waypoint you already placed". */
const WAYPOINT_HIT_PCT = 7;

type MarkerShape =
  | "square"
  | "diamond"
  | "triangle"
  | "chevron"
  | "circle"
  | "ring"
  | "mast"
  | "pill"
  | "cross"
  | "waypoint";

/**
 * Shape carries the same information as colour, so the map still reads for a
 * colour-blind operative.
 */
const SHAPES: Record<
  Exclude<MarkerShape, "waypoint">,
  { cls: string; clip?: string }
> = {
  square: { cls: "h-2 w-2 bg-current" },
  diamond: { cls: "h-2 w-2 rotate-45 bg-current" },
  triangle: {
    cls: "h-2 w-2.5 bg-current",
    clip: "polygon(50% 0%, 100% 100%, 0% 100%)",
  },
  chevron: {
    cls: "h-2 w-2.5 bg-current",
    clip: "polygon(0% 0%, 100% 0%, 50% 100%)",
  },
  circle: { cls: "h-2 w-2 rounded-full bg-current" },
  ring: { cls: "h-2.5 w-2.5 rounded-full border border-current" },
  mast: { cls: "h-2.5 w-1 bg-current" },
  pill: { cls: "h-1 w-3 rounded-full bg-current" },
  cross: {
    cls: "h-2.5 w-2.5 bg-current",
    clip: "polygon(40% 0,60% 0,60% 40%,100% 40%,100% 60%,60% 60%,60% 100%,40% 100%,40% 60%,0 60%,0 40%,40% 40%)",
  },
};

const MARKER_STYLE: Record<
  WorldMarker["kind"],
  { shape: MarkerShape; tone: string; legend: string }
> = {
  colony: { shape: "square", tone: "text-accent", legend: "COLONY" },
  ruin: { shape: "diamond", tone: "text-warn", legend: "RUIN" },
  ridge: { shape: "triangle", tone: "text-primary", legend: "RIDGE" },
  cache: { shape: "circle", tone: "text-fg", legend: "CACHE" },
  coast: { shape: "pill", tone: "text-danger", legend: "COAST" },
  objective: { shape: "ring", tone: "text-accent", legend: "TASKING" },
  poi: { shape: "mast", tone: "text-muted", legend: "SENSOR" },
  npc: { shape: "chevron", tone: "text-fern", legend: "CREW" },
  danger: { shape: "cross", tone: "text-danger", legend: "HOSTILE" },
};

/**
 * Which world marker each objective points at. Objectives carry no coordinates
 * of their own and the tracked pip needs one; the multi-site taskings list
 * every candidate so the nearest wins.
 */
const OBJECTIVE_SITES: Partial<Record<ObjectiveId, string[]>> = {
  perimeter: ["south-gate"],
  npcs: ["npc-t", "npc-c"],
  dome: ["colony"],
  scan: ["sensor", "treeline"],
  ferns: ["treeline"],
  ridge7: ["ridge7"],
  caches: ["cache-a", "cache-b", "cache-r", "cache-c"],
  prismhoof: ["herd"],
  shadowfang: ["treeline"],
  kaguyahime: ["coast"],
  ruins: ["ruin"],
  remember: ["ruin"],
};

type TapePip = {
  id: string;
  label: string;
  dist: number;
  /** Degrees off the current heading, -180..180. */
  rel: number;
  tone: string;
  shape: MarkerShape;
  tracked?: boolean;
};

function timeLabel(tod: number) {
  const hours = Math.floor(tod * 28) % 28;
  const mins = Math.floor((tod * 28 * 60) % 60);
  const phase =
    tod < 0.22
      ? "NIGHT"
      : tod < 0.35
        ? "DAWN"
        : tod < 0.65
          ? "DAY"
          : tod < 0.8
            ? "DUSK"
            : "NIGHT";
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")} · ${phase}`;
}

function weatherClass(weather: WeatherKind) {
  return weather === "storm"
    ? "text-warn"
    : weather === "rain"
      ? "text-accent"
      : "text-muted";
}

/** North is -Z, east is +X — the convention PlayerController's yaw uses. */
function bearingTo(from: Vec2, to: Vec2): number {
  return (Math.atan2(to.x - from.x, from.z - to.z) * 180) / Math.PI;
}

function relativeBearing(bearing: number, heading: number): number {
  return ((((bearing - heading) % 360) + 540) % 360) - 180;
}

function distanceTo(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Three-digit bearing, terminal style: 007°, 184°. */
function degLabel(deg: number): string {
  return String(Math.round(normalizeDeg(deg)) % 360).padStart(3, "0");
}

function cardinalOf(bearing: number): string {
  const norm = normalizeDeg(bearing);
  return norm < 45 || norm >= 315
    ? "N"
    : norm < 135
      ? "E"
      : norm < 225
        ? "S"
        : "W";
}

function projectX(x: number): number {
  return (
    MAP_PAD_PCT + ((x - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X)) * MAP_SPAN_PCT
  );
}

function projectZ(z: number): number {
  return (
    MAP_PAD_PCT + ((z - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z)) * MAP_SPAN_PCT
  );
}

function unprojectX(pct: number): number {
  return (
    MAP_MIN_X + ((pct - MAP_PAD_PCT) / MAP_SPAN_PCT) * (MAP_MAX_X - MAP_MIN_X)
  );
}

function unprojectZ(pct: number): number {
  return (
    MAP_MIN_Z + ((pct - MAP_PAD_PCT) / MAP_SPAN_PCT) * (MAP_MAX_Z - MAP_MIN_Z)
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** "KeyE" → "E". The prompt follows a rebind instead of lying about it. */
function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "SPC";
  return code.toUpperCase();
}

function vitalsTone(health: number) {
  if (health > WARN_HEALTH)
    return { bar: "bg-accent", label: "text-muted", pulse: false };
  if (health > CRITICAL_HEALTH)
    return { bar: "bg-warn", label: "text-warn", pulse: false };
  return { bar: "bg-danger", label: "text-danger", pulse: true };
}

/** Hoisted so the memoized Bar receives referentially stable icon props. */
const VITALS_ICON = <Activity className="h-3 w-3" />;
const STAMINA_ICON = <span className="font-mono text-[11px]">STM</span>;
const SIGNAL_ICON = <Radio className="h-3 w-3" />;

export function HUD() {
  // Low-frequency slices only. Every per-frame slice (playerPos, compass,
  // vitals, scan, interact, clock) is subscribed inside a leaf component
  // below; a movement tick must not reconcile the objectives, codex, or map
  // panels through this component.
  const character = useGameStore((s) => s.getCharacter());
  const objectivesRaw = useGameStore((s) => s.objectives);
  const revealed = useGameStore((s) => s.revealedObjectives);
  const dynamicMarkers = useGameStore((s) => s.dynamicMarkers);
  const codexRaw = useGameStore((s) => s.codex);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const messages = useGameStore((s) => s.messages);
  const openJournal = useGameStore((s) => s.openJournal);
  const togglePause = useGameStore((s) => s.togglePause);
  const inventory = useGameStore((s) => s.inventory);
  const codexStage = useGameStore((s) => s.codexStage);
  const [panel, setPanel] = useState<"none" | "obj" | "codex" | "map">("obj");
  // Hydrated from localStorage after mount; {} until then, so SSR markup never
  // depends on device state.
  const [codexSeen, setCodexSeen] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [waypoint, setWaypoint] = useState<Vec2 | null>(null);

  const objectives = useMemo(
    () => visibleObjectivesOf(objectivesRaw, revealed, spoiler),
    [objectivesRaw, revealed, spoiler],
  );
  const codex = useMemo(
    () => codexRaw.filter((c) => passesCeiling(c, spoiler)),
    [codexRaw, spoiler],
  );
  // Dialogue hints and field discoveries add pips at runtime; dedupe by id so a
  // hint that points at a static marker collapses onto it.
  const markers = useMemo(() => {
    const merged = [...MARKERS, ...dynamicMarkers].filter((m) =>
      passesCeiling(m, spoiler),
    );
    return Array.from(new Map(merged.map((m) => [m.id, m])).values());
  }, [dynamicMarkers, spoiler]);

  // First actionable tasking that has somewhere to go; the tape tracks that one.
  const trackedObjective = useMemo(
    () =>
      objectivesRaw.find(
        (o) =>
          !o.done &&
          OBJECTIVE_SITES[o.id] &&
          isObjectiveActionable(o, objectivesRaw, revealed, spoiler),
      ) ?? null,
    [objectivesRaw, revealed, spoiler],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM") setPanel((p) => (p === "map" ? "none" : "map"));
      if (e.code === "KeyC" && !e.ctrlKey && !e.metaKey)
        setPanel((p) => (p === "codex" ? "none" : "codex"));
      if (e.code === "KeyO" || e.code === "Tab") {
        if (e.code === "Tab") e.preventDefault();
        setPanel((p) => (p === "obj" ? "none" : "obj"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setCodexSeen(readCodexMarker());
  }, []);

  // Opening the codex marks everything currently readable as read — on disk
  // immediately, in memory only when the panel closes, so the UPDATED tags
  // survive the whole read and are gone on the next open.
  useEffect(() => {
    if (panel !== "codex") return;
    const snapshot: Record<string, number> = {};
    for (const c of codexRaw) {
      if (c.unlocked) snapshot[c.id] = codexStage[c.id] ?? 0;
    }
    writeCodexMarker(snapshot);
    return () => setCodexSeen(snapshot);
  }, [panel, codexRaw, codexStage]);

  // Phones get one auto-expiring line instead of the stacked feed; without it
  // pushMessage output is invisible on the primary form factor.
  useEffect(() => {
    const latest = messages[0];
    if (!latest) return;
    setToast(latest);
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [messages]);

  const doneCount = objectives.filter((o) => o.done).length;
  const carried = ITEM_ORDER.filter((id) => (inventory[id] ?? 0) > 0);
  // "New since last open" covers first unlocks too: an unread entry has no
  // marker, and stage 0 > -1.
  const codexIsNew = (c: CodexEntry) =>
    c.unlocked && (codexStage[c.id] ?? 0) > (codexSeen[c.id] ?? -1);
  const codexHasNews = panel !== "codex" && codex.some(codexIsNew);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <DamageVignette />

      <div className="pointer-events-auto absolute left-0 right-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="panel-glass min-w-0 max-w-[8.5rem] rounded-md px-3 py-2 sm:max-w-[18rem]">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
            <p className="truncate font-mono text-[11px] tracking-[0.25em] text-accent">
              {character?.callsign ?? "—"}
              <span className="hidden sm:inline"> · FIELD OPS</span>
            </p>
          </div>
          {/* Rank and full name are identity flavour; on a phone the vertical
              space belongs to the world, not to a second copy of the callsign. */}
          <p className="mt-0.5 hidden truncate text-xs text-muted sm:block">
            {character?.rank} {character?.name}
          </p>
          <ClockLine />
        </div>

        {/* Never wraps: five 44px targets wrapping under the identity panel on a
            375px viewport is what made the mobile HUD overlap itself. */}
        <div className="flex shrink-0 flex-nowrap justify-end gap-1 sm:gap-1.5">
          <HudBtn
            active={panel === "obj"}
            onClick={() => setPanel(panel === "obj" ? "none" : "obj")}
            label="Obj"
            icon={<Crosshair className="h-4 w-4" />}
          />
          <HudBtn
            active={panel === "codex"}
            onClick={() => setPanel(panel === "codex" ? "none" : "codex")}
            label="Codex"
            icon={<BookOpen className="h-4 w-4" />}
            dot={codexHasNews}
          />
          <HudBtn
            active={panel === "map"}
            onClick={() => setPanel(panel === "map" ? "none" : "map")}
            label="Map"
            icon={<MapIcon className="h-4 w-4" />}
          />
          <HudBtn
            active={false}
            onClick={openJournal}
            label="Log"
            icon={<NotebookPen className="h-4 w-4" />}
          />
          <HudBtn
            active={false}
            onClick={togglePause}
            label="Menu"
            icon={<Pause className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* Below the top row at every width: centred inside it the tape gets
          crushed between the identity panel and five buttons on a 640px
          viewport, and hiding it on phones is exactly what made the old text
          compass useless on the form factor most players arrive on. */}
      <div className="absolute left-3 right-3 top-[4.5rem] sm:left-1/2 sm:right-auto sm:top-[5.5rem] sm:w-[26rem] sm:max-w-[calc(100%-2rem)] sm:-translate-x-1/2">
        <CompassRig
          markers={markers}
          waypoint={waypoint}
          trackedObjective={trackedObjective}
        />
      </div>

      <ScannerOverlay />

      <InteractPrompt />

      {/* right-20 on mobile leaves a gutter for the SPR/SCN/TAP action column
          (bottom-right, ~48px + margin) so the vitals bars are not occluded. */}
      <div className="pointer-events-none absolute bottom-24 left-3 right-20 sm:bottom-5 sm:left-4 sm:right-auto sm:w-72">
        {toast && (
          <p
            role="status"
            aria-live="polite"
            className="panel-glass mb-1.5 truncate rounded-md px-2.5 py-1.5 font-mono text-[11px] leading-snug text-muted sm:hidden"
          >
            {toast}
          </p>
        )}
        <div className="panel-glass space-y-2 rounded-md p-3">
          <VitalsBlock />
          {/* Wraps rather than truncates: at 375px four carried types become
              two terse lines, never a clipped count. */}
          {carried.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted">
              <span className="tracking-widest">SPECIMENS</span>
              {carried.map((id) => (
                <span
                  key={id}
                  className={`flex items-center gap-1 ${ITEM_META[id].tone}`}
                >
                  <MarkerGlyph shape={ITEM_META[id].shape} />
                  <span className="text-muted">
                    {ITEM_META[id].label}{" "}
                    <span className="tabular-nums text-fg">
                      {inventory[id]}
                    </span>
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live region, but only the newest line is exposed: the feed re-keys on
          every push, so leaving the whole stack readable re-announces five
          lines for one event. */}
      <div
        role="log"
        aria-live="polite"
        className="pointer-events-none absolute bottom-5 right-4 hidden w-80 space-y-1 sm:block"
      >
        {messages.slice(0, 5).map((m, i) => (
          <p
            key={`${m}-${i}`}
            aria-hidden={i > 0}
            className="panel-glass rounded-md px-2.5 py-1.5 font-mono text-[11px] leading-snug text-muted"
            style={{ opacity: 1 - i * 0.15 }}
          >
            {m}
          </p>
        ))}
      </div>

      {panel === "obj" && (
        <div className="pointer-events-auto absolute left-3 top-[10rem] max-h-[42vh] sm:max-h-[48vh] sm:top-[11rem] w-[min(100%-1.5rem,19rem)] overflow-y-auto panel-glass rounded-md p-3 sm:left-4">
          <p className="mb-2 font-mono text-[11px] tracking-widest text-accent">
            OBJECTIVES {doneCount}/{objectives.length}
          </p>
          <ul className="space-y-2.5">
            {objectives.map((o) => (
              <li key={o.id} className="text-xs leading-snug">
                <span
                  className={
                    o.done
                      ? "text-accent line-through decoration-accent/40"
                      : "text-fg"
                  }
                >
                  {o.done ? "✓ " : "○ "}
                  {o.title}
                  {o.optional ? " · opt" : ""}
                  {o.book2 ? " · B2" : ""}
                </span>
                {!o.done && <p className="mt-0.5 pl-4 text-muted">{o.detail}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {panel === "codex" && (
        <div className="pointer-events-auto absolute left-3 top-[10rem] max-h-[46vh] sm:max-h-[55vh] sm:top-[11rem] w-[min(100%-1.5rem,21rem)] overflow-y-auto panel-glass rounded-md p-3 sm:left-4">
          <p className="mb-2 font-mono text-[11px] tracking-widest text-accent">
            FIELD CODEX
          </p>
          <ul className="space-y-3">
            {codex.map((c) => {
              const staged = codexBodyOf(c, codexStage[c.id] ?? 0);
              return (
                <li key={c.id}>
                  <p
                    className={`text-xs font-semibold ${c.unlocked ? "text-fg" : "text-muted"}`}
                  >
                    {c.unlocked ? c.title : "········"}
                    {codexIsNew(c) && (
                      <span className="ml-1.5 align-middle rounded-sm border border-accent/40 px-1 py-px font-mono text-[9px] tracking-widest text-accent">
                        UPDATED
                      </span>
                    )}
                  </p>
                  {c.unlocked && (
                    <>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted">
                        {staged.body}
                      </p>
                      {staged.total > 0 && (
                        <p className="mt-0.5 font-mono text-[10px] text-dim">
                          STAGE {staged.stage}/{staged.total}
                          {staged.source ? ` · ${staged.source}` : ""}
                        </p>
                      )}
                      {c.chapterRef && (
                        <a
                          href={`${NOVEL_SITE_URL}?utm_source=fieldops&utm_medium=codex&utm_campaign=ch${c.chapterRef.chapter}`}
                          target="_blank"
                          rel="noopener"
                          className="mt-1 inline-block break-words font-mono text-[11px] leading-snug text-accent underline decoration-accent/40 underline-offset-2 hover:text-primary-glow"
                        >
                          Continue in 2121: EXODUS — Ch. {c.chapterRef.chapter}:{" "}
                          {c.chapterRef.teaser}
                        </a>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* The map panel is narrower than the others on a phone: the square grid
          plus its legend has to clear the thumbstick and the action column. */}
      {panel === "map" && (
        <div className="pointer-events-auto absolute left-1/2 top-[10rem] w-[min(100%-1.5rem,15rem)] sm:top-[11rem] sm:w-[19rem] -translate-x-1/2 panel-glass rounded-md p-3 sm:left-auto sm:right-4 sm:translate-x-0">
          <p className="mb-2 font-mono text-[11px] tracking-widest text-accent">
            TACTICAL MAP
          </p>
          <TacticalMap
            markers={markers}
            waypoint={waypoint}
            onSet={setWaypoint}
          />
        </div>
      )}
    </div>
  );
}

/** Reads health alone, so the vignette pulse never reconciles the panels. */
function DamageVignette() {
  const health = useGameStore((s) => s.health);
  if (health >= CRITICAL_HEALTH) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 animate-pulse"
      style={{
        background: `radial-gradient(ellipse at center, transparent 38%, rgb(184 58 58 / ${(
          0.16 +
          (1 - health / CRITICAL_HEALTH) * 0.34
        ).toFixed(2)}) 100%)`,
      }}
    />
  );
}

function ClockLine() {
  // Derived-string selectors: timeOfDay ticks every frame, but the label only
  // changes once a sim minute, and Object.is on the string absorbs the rest.
  const clock = useGameStore((s) => timeLabel(s.timeOfDay));
  const animLabel = useGameStore((s) => s.animState.toUpperCase());
  return (
    <p className="mt-1 truncate font-mono text-[11px] text-muted">
      {clock}
      <span className="hidden sm:inline"> · {animLabel}</span>
    </p>
  );
}

function CoordReadout() {
  // Derived string: notifies only when a whole-metre coordinate changes.
  const coords = useGameStore(
    (s) => `${s.playerPos.x.toFixed(0)},${s.playerPos.z.toFixed(0)}`,
  );
  return <span className="text-muted">{coords}</span>;
}

function VitalsBlock() {
  const health = useGameStore((s) => s.health);
  const stamina = useGameStore((s) => s.stamina);
  const signalMeter = useGameStore((s) => s.signalMeter);
  const combatEnabled = useGameStore((s) => s.combatEnabled);
  const trackedByFang = useGameStore((s) => s.trackedByFang);
  const [staminaSpent, setStaminaSpent] = useState(false);
  const staminaPrev = useRef(stamina);

  // Sprint denial has no store flag: only sprinting drains stamina, so a fall
  // through the floor — or holding sprint while already there — is the denial.
  useEffect(() => {
    const prev = staminaPrev.current;
    staminaPrev.current = stamina;
    const denied =
      stamina <= SPRINT_FLOOR && (prev > SPRINT_FLOOR || isHeld("sprint"));
    if (!denied) return;
    setStaminaSpent(true);
    const t = window.setTimeout(() => setStaminaSpent(false), 900);
    return () => window.clearTimeout(t);
  }, [stamina]);

  const vitals = vitalsTone(health);

  // A fragment, so the panel-glass container's space-y still sees each bar as
  // a direct child.
  return (
    <>
      <Bar
        icon={VITALS_ICON}
        label="VITALS"
        value={health}
        color={vitals.bar}
        labelClass={vitals.label}
        pulse={vitals.pulse}
      />
      <Bar
        icon={STAMINA_ICON}
        label="STAMINA"
        value={stamina}
        color={staminaSpent ? "bg-warn" : "bg-primary"}
        labelClass={staminaSpent ? "text-warn" : "text-muted"}
        pulse={staminaSpent}
        note={staminaSpent ? "SPENT" : undefined}
      />
      <Bar
        icon={SIGNAL_ICON}
        label="ZPE SIG"
        value={signalMeter * 100}
        color="bg-warn"
      />
      <div className="flex flex-wrap justify-between gap-x-2 font-mono text-[11px]">
        {/* State carries a glyph and a border, not colour alone: ARMED vs
            SAFE must read for colour-blind operatives, and TRACKED must
            survive reduced-motion, which strips the pulse. */}
        <span
          className={`rounded-sm border px-1 ${
            combatEnabled
              ? "border-danger text-danger"
              : "border-border text-muted"
          }`}
        >
          {combatEnabled ? "◈ ARMED" : "○ SAFE"}
        </span>
        {trackedByFang && (
          <span className="animate-pulse rounded-sm border border-warn px-1 text-warn">
            ▲ TRACKED
          </span>
        )}
        <CoordReadout />
      </div>
    </>
  );
}

function ScannerOverlay() {
  const scannerActive = useGameStore((s) => s.scannerActive);
  const scanProgress = useGameStore((s) => s.scanProgress);
  const scanCount = useGameStore((s) => s.scannedIds.length);
  if (!scannerActive) return null;
  return (
    <div className="pointer-events-none absolute inset-0 border-2 border-accent/30">
      <div className="absolute inset-8 border border-accent/20" />
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/40" />
      <div className="absolute bottom-36 left-1/2 w-48 -translate-x-1/2">
        <p className="mb-1 flex items-center justify-center gap-1 font-mono text-[11px] text-accent">
          <Scan className="h-3 w-3" /> SCAN · {scanCount}
        </p>
        <div className="h-1 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full bg-accent transition-all duration-150"
            style={{ width: `${scanProgress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function InteractPrompt() {
  const interact = useGameStore((s) => s.interact);
  const [device, setDevice] = useState<Device>("keyboard");

  // Sampled rather than read during render: input.ts is a mutable module, not a
  // subscribable store, and the prompt only has to keep up with a thumb.
  useEffect(() => {
    const id = window.setInterval(() => setDevice(lastDevice()), 400);
    return () => window.clearInterval(id);
  }, []);

  if (!interact || interact.dist >= 8) return null;
  return (
    <div className="pointer-events-none absolute bottom-[38%] left-1/2 -translate-x-1/2">
      <div className="panel-glass flex items-center gap-3 rounded-md px-4 py-2.5">
        <InteractGlyph device={device} />
        <div>
          <p className="text-sm font-medium text-fg">{interact.label}</p>
          {interact.sub && (
            <p className="font-mono text-[11px] text-muted">{interact.sub}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Per-frame bridge for the bearing tape: outside the on-demand map, this is
 * the only subscriber to playerPos and compassBearing, so walking re-renders
 * this leaf and nothing above it.
 */
function CompassRig({
  markers,
  waypoint,
  trackedObjective,
}: {
  markers: WorldMarker[];
  waypoint: Vec2 | null;
  trackedObjective: Objective | null;
}) {
  const playerPos = useGameStore((s) => s.playerPos);
  const compass = useGameStore((s) => s.compassBearing);
  const weather = useGameStore((s) => s.weather);

  // Memoised so the tape's memo holds when only weather notifies.
  const pips = useMemo(() => {
    const ranged = markers
      .map((m) => ({ marker: m, dist: distanceTo(playerPos, m) }))
      .sort((a, b) => a.dist - b.dist);
    const trackedSites = trackedObjective
      ? (OBJECTIVE_SITES[trackedObjective.id] ?? [])
      : [];
    const trackedSite =
      ranged.find(({ marker }) => trackedSites.includes(marker.id)) ?? null;

    const out: TapePip[] = [];
    if (waypoint) {
      out.push({
        id: "waypoint",
        label: "WAYPOINT",
        dist: distanceTo(playerPos, waypoint),
        rel: relativeBearing(bearingTo(playerPos, waypoint), compass),
        tone: "text-fern",
        shape: "waypoint",
      });
    }
    if (trackedSite && trackedObjective) {
      out.push({
        id: `tracked-${trackedSite.marker.id}`,
        label: trackedObjective.title,
        dist: trackedSite.dist,
        rel: relativeBearing(bearingTo(playerPos, trackedSite.marker), compass),
        tone: "text-accent",
        shape: MARKER_STYLE[trackedSite.marker.kind].shape,
        tracked: true,
      });
    }
    let pipped = 0;
    for (const { marker, dist } of ranged) {
      if (pipped >= MAX_MARKER_PIPS) break;
      if (marker.id === trackedSite?.marker.id) continue;
      const rel = relativeBearing(bearingTo(playerPos, marker), compass);
      if (Math.abs(rel) > TAPE_HALF_DEG) continue;
      const style = MARKER_STYLE[marker.kind];
      out.push({
        id: marker.id,
        label: marker.label,
        dist,
        rel,
        tone: style.tone,
        shape: style.shape,
      });
      pipped += 1;
    }
    return out;
  }, [markers, playerPos, compass, waypoint, trackedObjective]);

  return (
    <CompassTape
      compass={compass}
      bearingLabel={cardinalOf(compass)}
      pips={pips}
      weather={weather}
    />
  );
}

const CompassTape = memo(function CompassTape({
  compass,
  bearingLabel,
  pips,
  weather,
}: {
  compass: number;
  bearingLabel: string;
  pips: TapePip[];
  weather: WeatherKind;
}) {
  const ticks: { deg: number; rel: number; label?: string }[] = [];
  const first =
    Math.ceil((compass - TAPE_HALF_DEG) / TICK_STEP_DEG) * TICK_STEP_DEG;
  for (let d = first; d <= compass + TAPE_HALF_DEG; d += TICK_STEP_DEG) {
    const norm = ((d % 360) + 360) % 360;
    ticks.push({ deg: norm, rel: d - compass, label: CARDINALS[norm] });
  }

  const tracked = pips.find((p) => p.tracked);
  const heading = `Heading ${bearingLabel}, ${Math.round(normalizeDeg(compass))} degrees`;
  const label = tracked
    ? `${heading}. Tracking ${tracked.label}, ${formatDist(tracked.dist)}.`
    : `${heading}.`;

  return (
    <div
      role="img"
      aria-label={label}
      className="panel-glass rounded-md px-2 py-1.5"
    >
      <div className="relative h-12 overflow-hidden">
        <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-accent/40" />
        {ticks.map((t) =>
          t.label ? (
            <div
              key={t.deg}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${50 + (t.rel / TAPE_SPAN_DEG) * 100}%` }}
            >
              <p className="text-center font-mono text-[11px] leading-none tracking-widest text-fg">
                {t.label}
              </p>
              <span className="mx-auto mt-1 block h-2 w-px bg-muted" />
            </div>
          ) : (
            <span
              key={t.deg}
              className="absolute top-[0.9rem] block h-1.5 w-px -translate-x-1/2 bg-dim"
              style={{ left: `${50 + (t.rel / TAPE_SPAN_DEG) * 100}%` }}
            />
          ),
        )}
        {pips.map((p) => {
          const off = Math.abs(p.rel) > TAPE_HALF_DEG;
          const rel = clamp(p.rel, -TAPE_HALF_DEG, TAPE_HALF_DEG);
          return (
            <div
              key={p.id}
              className={`absolute bottom-0 flex -translate-x-1/2 flex-col items-center gap-0.5 ${p.tone} ${
                p.tracked ? "border-b border-accent pb-px" : ""
              }`}
              style={{ left: `${50 + (rel / TAPE_SPAN_DEG) * 100}%` }}
            >
              <MarkerGlyph shape={p.shape} />
              <span className="flex items-center gap-0.5 whitespace-nowrap font-mono text-[11px] leading-none">
                {off && <span>{p.rel < 0 ? "‹" : "›"}</span>}
                {p.tracked && (
                  <span className="hidden max-w-[7rem] truncate uppercase sm:inline">
                    {p.label}
                  </span>
                )}
                <span className="tabular-nums">{formatDist(p.dist)}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[11px] text-muted">
        <span className="tabular-nums text-fg">
          {bearingLabel} {degLabel(compass)}°
        </span>
        <span className={`flex items-center gap-1 ${weatherClass(weather)}`}>
          <CloudRain className="h-3 w-3" /> WX {weather.toUpperCase()}
        </span>
      </div>
    </div>
  );
});

const TacticalMap = memo(function TacticalMap({
  markers,
  waypoint,
  onSet,
}: {
  markers: WorldMarker[];
  waypoint: Vec2 | null;
  onSet: (next: Vec2 | null) => void;
}) {
  // Mounted only while the map panel is open, so these per-frame reads are
  // scoped to the panel's lifetime — traversal with the map closed pays
  // nothing for them.
  const playerPos = useGameStore((s) => s.playerPos);
  const compass = useGameStore((s) => s.compassBearing);

  const legendKinds = useMemo(() => {
    const seen = new Set<WorldMarker["kind"]>();
    for (const m of markers) seen.add(m.kind);
    return [...seen];
  }, [markers]);

  const onPick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Keyboard activation carries no coordinates; dropping at the rect origin
    // would plant a waypoint in a corner nobody aimed at.
    if (e.detail === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const pz = ((e.clientY - rect.top) / rect.height) * 100;
    if (
      waypoint &&
      Math.hypot(projectX(waypoint.x) - px, projectZ(waypoint.z) - pz) <
        WAYPOINT_HIT_PCT
    ) {
      onSet(null);
      return;
    }
    onSet({
      x: clamp(unprojectX(px), MAP_MIN_X, MAP_MAX_X),
      z: clamp(unprojectZ(pz), MAP_MIN_Z, MAP_MAX_Z),
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={onPick}
        aria-label="Tactical map. Click the map to mark a waypoint, click the waypoint to clear it."
        className="relative block aspect-square w-full overflow-hidden rounded-sm border border-border bg-void"
      >
        <span className="absolute inset-0 bg-gradient-to-b from-surface/40 to-void" />
        {markers.map((m) => {
          const style = MARKER_STYLE[m.kind];
          return (
            <span
              key={m.id}
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${style.tone}`}
              style={{ left: `${projectX(m.x)}%`, top: `${projectZ(m.z)}%` }}
              title={m.label}
            >
              <MarkerGlyph shape={style.shape} />
            </span>
          );
        })}
        {waypoint && (
          <span
            className="absolute -translate-x-1/2 -translate-y-1/2 text-fern"
            style={{
              left: `${projectX(waypoint.x)}%`,
              top: `${projectZ(waypoint.z)}%`,
            }}
            title="Waypoint"
          >
            <MarkerGlyph shape="waypoint" />
          </span>
        )}
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${projectX(playerPos.x)}%`,
            top: `${projectZ(playerPos.z)}%`,
          }}
        >
          <HeadingArrow compass={compass} />
        </span>
      </button>

      <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px] text-muted">
        {waypoint ? (
          <span className="truncate tabular-nums text-fern">
            WPT {formatDist(distanceTo(playerPos, waypoint))} ·{" "}
            {degLabel(bearingTo(playerPos, waypoint))}°
          </span>
        ) : (
          <span className="truncate">MARK A WAYPOINT — TAP THE GRID</span>
        )}
        {waypoint && (
          <button
            type="button"
            onClick={() => onSet(null)}
            className="min-h-8 shrink-0 rounded-sm border border-border px-2 font-mono text-[11px] tracking-wide text-muted hover:border-muted hover:text-fg"
          >
            CLEAR
          </button>
        )}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
        <li className="flex items-center gap-1">
          <HeadingArrow compass={0} />
          <span>YOU</span>
        </li>
        {legendKinds.map((kind) => (
          <li key={kind} className={`flex items-center gap-1 ${MARKER_STYLE[kind].tone}`}>
            <MarkerGlyph shape={MARKER_STYLE[kind].shape} />
            <span className="text-muted">{MARKER_STYLE[kind].legend}</span>
          </li>
        ))}
        {waypoint && (
          <li className="flex items-center gap-1 text-fern">
            <MarkerGlyph shape="waypoint" />
            <span className="text-muted">WPT</span>
          </li>
        )}
      </ul>
    </>
  );
});

function MarkerGlyph({
  shape,
  className = "",
}: {
  shape: MarkerShape;
  className?: string;
}) {
  if (shape === "waypoint")
    return (
      <Crosshair aria-hidden="true" className={`h-3 w-3 shrink-0 ${className}`} />
    );
  const s = SHAPES[shape];
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 ${s.cls} ${className}`}
      style={s.clip ? { clipPath: s.clip } : undefined}
    />
  );
}

/** Rotation is applied on an inner node so it cannot fight the centring translate. */
function HeadingArrow({ compass }: { compass: number }) {
  return (
    <span
      aria-hidden="true"
      className="block h-3.5 w-3.5"
      style={{ transform: `rotate(${compass}deg)` }}
    >
      <span
        className="block h-full w-full bg-primary-glow"
        style={{ clipPath: "polygon(50% 0%, 90% 100%, 50% 74%, 10% 100%)" }}
      />
    </span>
  );
}

function InteractGlyph({ device }: { device: Device }) {
  const base =
    "flex h-8 items-center justify-center border border-accent/50 font-mono text-[11px] tracking-wide text-accent";
  if (device === "touch")
    return <span className={`${base} w-12 rounded-full`}>TAP</span>;
  // input.ts maps the standard-mapping X button to interact.
  if (device === "gamepad")
    return <span className={`${base} w-8 rounded-full`}>X</span>;
  return (
    <span className={`${base} w-8 rounded-sm`}>
      {keyLabel(getKeymap().interact[0] ?? "KeyE")}
    </span>
  );
}

const Bar = memo(function Bar({
  icon,
  label,
  value,
  color,
  labelClass = "text-muted",
  pulse = false,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  labelClass?: string;
  pulse?: boolean;
  note?: string;
}) {
  return (
    <div>
      <div
        className={`mb-0.5 flex items-center justify-between font-mono text-[11px] ${labelClass}`}
      >
        <span className="flex items-center gap-1">
          {icon} {label}
          {note ? ` · ${note}` : ""}
        </span>
        <span className="tabular-nums">{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className={`h-full ${color} transition-all duration-200 ${pulse ? "animate-pulse" : ""}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
});

function HudBtn({
  active,
  onClick,
  label,
  icon,
  dot = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  /** Subtle unread pip — codex advanced since the operative last looked. */
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dot ? `${label} — updated` : label}
      aria-pressed={active}
      className={`relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-md border px-1.5 font-mono text-[11px] tracking-wide transition sm:flex-row sm:gap-1.5 sm:px-2.5 ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-border bg-surface/80 text-muted hover:border-muted hover:text-fg"
      }`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent"
        />
      )}
      {icon}
      {/* Labelled at every size — two of the five icons used to be identical,
          leaving mobile with a row of indistinguishable glyphs. */}
      <span>{label}</span>
    </button>
  );
}
