import { useCallback, useEffect, useRef, useState } from "react";
import { TerminalDialog } from "@/components/ui/TerminalDialog";
import { SCAN_TARGETS } from "@/game/data";
import { DEFAULT_KEYMAP, clearHeld, getKeymap, lastDevice } from "@/game/input";
import type { Action, Device, Keymap } from "@/game/input";
import { passesCeiling } from "@/game/selectors";
import { useGameStore } from "@/game/store";

type StoreState = ReturnType<typeof useGameStore.getState>;

type HintId = "move" | "interact" | "scan" | "storm" | "tracked";

type HintDef = {
  id: HintId;
  eyebrow: string;
  /** Written at fire time so the prompt names the device actually in hand. */
  body: (device: Device) => string;
  /** The situation this hint exists for has arrived. */
  fires: (s: StoreState) => boolean;
  /** The situation has passed — pull the card early. */
  settled: (s: StoreState) => boolean;
  /** Already demonstrated, so never say it. Guards restored saves. */
  learned?: (s: StoreState) => boolean;
};

/**
 * Hints are device preferences, not run state: they live outside the save blob
 * so that abandoning a run and starting a fresh one does not re-teach WASD to
 * someone who has been playing for an hour.
 */
const HINTS_KEY = "lupus-fieldops-hints-v1";

const HINT_TTL_MS = 9000;
/** A card the player answers in the first second still has to be readable. */
const MIN_SHOW_MS = 2200;

function prettyCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5).toUpperCase();
  if (code.startsWith("Shift")) return "SHIFT";
  if (code === "Space") return "SPACE";
  if (code === "Escape") return "ESC";
  return code.toUpperCase();
}

function bind(action: Action): string {
  const codes = getKeymap()[action];
  return codes.length ? prettyCode(codes[0]) : "UNBOUND";
}

/** "WASD" — or whatever the four movement keys have been rebound to. */
function moveKeys(): string {
  const map = getKeymap();
  return (["forward", "left", "back", "right"] as Action[])
    .map((a) => prettyCode(map[a][0] ?? ""))
    .join("");
}

function nearScannable(s: StoreState): boolean {
  const { x, z } = s.playerPos;
  return SCAN_TARGETS.some(
    (t) =>
      passesCeiling(t, s.spoilerCeiling) &&
      !s.scannedIds.includes(t.id) &&
      Math.hypot(x - t.x, z - t.z) < t.radius,
  );
}

const HINTS: HintDef[] = [
  {
    id: "move",
    eyebrow: "FIELD PROCEDURE",
    body: (device) =>
      device === "touch"
        ? "Left thumb walks. Drag the right side to look. SPR runs."
        : device === "gamepad"
          ? "Left stick walks. Right stick looks."
          : `${moveKeys()} walks the survey. Mouse turns the head. ${bind("sprint")} runs.`,
    fires: () => true,
    settled: (s) => s.playerSpeed > 0.5,
    learned: (s) => s.playerSpeed > 0.5,
  },
  {
    id: "tracked",
    eyebrow: "TRACKED",
    body: (device) =>
      device === "touch"
        ? "A pack has your line. They average where you have been and cut to meet it — break the pattern. New heading, new ground."
        : `A pack has your line. They average where you have been and cut to meet it — break the pattern. ${bind("combat")} stands you up to fight it instead.`,
    fires: (s) => s.trackedByFang,
    settled: (s) => !s.trackedByFang,
  },
  {
    id: "storm",
    eyebrow: "WX ALERT",
    body: () =>
      "Ion cell overhead. Comms to noise, pace down. The ferns go dark under the charge — no understory light, and the packs hunt what that hides. Strikes take the high ground: get off the ridge.",
    fires: (s) => s.weather === "storm",
    settled: (s) => s.weather !== "storm",
    learned: (s) => s.stormSurvived,
  },
  {
    id: "interact",
    eyebrow: "CONTACT",
    body: (device) =>
      device === "touch"
        ? "TAP takes the action the prompt names."
        : device === "gamepad"
          ? "X takes the action the prompt names."
          : `${bind("interact")} takes the action the prompt names.`,
    fires: (s) => s.interact !== null && s.interact.dist < 7,
    settled: (s) => s.interact === null,
    learned: (s) =>
      s.domeEntered || s.cachesLooted.length > 0 || s.npcsTalked.length > 0,
  },
  {
    id: "scan",
    eyebrow: "SCANNER",
    body: (device) =>
      device === "touch"
        ? "Hold SCN on it. The suite logs what the eye only argues with."
        : `Hold ${bind("scan")} on it. The suite logs what the eye only argues with.`,
    fires: nearScannable,
    settled: (s) => s.scanProgress > 0.2 || !nearScannable(s),
    learned: (s) => s.scannedIds.length > 0,
  },
];

function readSeen(): Set<HintId> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(HINTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(parsed) ? (parsed as HintId[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<HintId>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(HINTS_KEY, JSON.stringify([...seen]));
  } catch {
    /* storage denied — hints simply repeat next session */
  }
}

type ActiveHint = {
  id: HintId;
  eyebrow: string;
  body: string;
};

/**
 * Just-in-time instruction. Each card fires once, on the first occurrence of
 * the situation it explains, and only after the player has taken control: until
 * pointer lock is held the only instruction that applies is ClickToPlay's line,
 * and the two must never be on screen together.
 *
 * Subscribes to the store imperatively rather than through hooks: playerPos
 * changes every frame, and a component that re-rendered with it would cost
 * more than the world it is explaining.
 */
export function Tutorial() {
  const [active, setActive] = useState<ActiveHint | null>(null);
  const activeRef = useRef<HintId | null>(null);
  const shownAtRef = useRef(0);
  const timerRef = useRef(0);

  const dismiss = useCallback(() => {
    window.clearTimeout(timerRef.current);
    activeRef.current = null;
    setActive(null);
  }, []);

  useEffect(() => {
    const seen = readSeen();
    let engaged = false;

    const markSeen = (id: HintId) => {
      seen.add(id);
      writeSeen(seen);
    };

    const evaluate = (s: StoreState) => {
      if (s.phase !== "playing" || s.photoMode) return;
      if (!engaged && s.playerSpeed > 0.5) engaged = true;

      const current = activeRef.current;
      if (current) {
        if (performance.now() - shownAtRef.current < MIN_SHOW_MS) return;
        const def = HINTS.find((h) => h.id === current);
        if (def && def.settled(s)) dismiss();
        return;
      }
      if (!engaged) return;

      for (const def of HINTS) {
        if (seen.has(def.id)) continue;
        if (def.learned?.(s)) {
          markSeen(def.id);
          continue;
        }
        if (!def.fires(s)) continue;
        markSeen(def.id);
        activeRef.current = def.id;
        shownAtRef.current = performance.now();
        setActive({
          id: def.id,
          eyebrow: def.eyebrow,
          body: def.body(lastDevice()),
        });
        timerRef.current = window.setTimeout(dismiss, HINT_TTL_MS);
        return;
      }
    };

    // Taking pointer lock, or touching the stick, is the player saying they
    // are driving. A screenshot of an idle world gets no instruction.
    const onLock = () => {
      if (document.pointerLockElement) engaged = true;
    };
    if (matchMedia("(pointer: coarse)").matches) engaged = true;
    if (navigator.maxTouchPoints > 0) engaged = true;
    document.addEventListener("pointerlockchange", onLock);

    const unsubscribe = useGameStore.subscribe(evaluate);
    evaluate(useGameStore.getState());

    return () => {
      document.removeEventListener("pointerlockchange", onLock);
      unsubscribe();
      window.clearTimeout(timerRef.current);
    };
  }, [dismiss]);

  if (!active) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-[30%] z-30 flex justify-center px-4"
    >
      <div
        key={active.id}
        className="panel-glass flex max-w-sm items-start gap-2 rounded-md px-3.5 py-2.5"
      >
        <div>
          <p className="font-mono text-[11px] tracking-[0.28em] text-accent">
            {active.eyebrow}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {active.body}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss hint"
          className="pointer-events-auto -mr-1 -mt-1 h-8 w-8 shrink-0 rounded-sm font-mono text-xs text-dim hover:text-fg"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

const ACTIONS = Object.keys(DEFAULT_KEYMAP) as Action[];

// Bindings are read live from input.ts, so the card cannot drift from what the
// keys actually do; only the prose belongs here.
const ACTION_LABELS: Record<Action, string> = {
  forward: "Move forward",
  back: "Move back",
  left: "Strafe left",
  right: "Strafe right",
  sprint: "Sprint",
  jump: "Jump",
  scan: "Field scanner (hold)",
  interact: "Interact",
  combat: "Combat stance",
  journal: "Field journal",
  photo: "Photo mode",
  settings: "Settings",
  map: "Tactical map",
  codex: "Field codex",
  objectives: "Objective log",
  pause: "Pause / menu",
};

/** A held Tab peeks the card; a tapped Tab still belongs to the objective log. */
const HOLD_MS = 350;

function KeymapCard({ bindings }: { bindings: Keymap }) {
  return (
    <>
      <p className="font-mono text-[11px] tracking-[0.3em] text-accent">
        CONTROL BINDINGS
      </p>
      <ul className="mt-3 space-y-1">
        {ACTIONS.map((action) => (
          <li
            key={action}
            className="flex items-center justify-between gap-4 border-b border-border/40 pb-1"
          >
            <span className="text-xs text-fg">{ACTION_LABELS[action]}</span>
            <span className="font-mono text-[11px] tracking-wide text-accent">
              {bindings[action].map(prettyCode).join(" / ") || "UNBOUND"}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-1 font-mono text-[11px] leading-relaxed text-dim">
        <p>TOUCH — LEFT THUMB WALKS · RIGHT SIDE LOOKS · TAP INTERACTS</p>
        <p>PAD — STICKS MOVE AND LOOK · A JUMPS · X INTERACTS · RB COMBAT</p>
        <p>? OPENS THIS CARD · HOLD TAB PEEKS IT</p>
      </div>
    </>
  );
}

/**
 * The full keymap, on demand. M, C and Tab were documented nowhere a player
 * could reach them mid-survey, and a pause menu footnote is not a reference.
 */
export function KeybindOverlay() {
  const [mode, setMode] = useState<"off" | "modal" | "peek">("off");
  const [bindings, setBindings] = useState<Keymap>(() => getKeymap());
  const modeRef = useRef<"off" | "modal" | "peek">("off");
  const holdRef = useRef(0);

  const close = useCallback(() => {
    modeRef.current = "off";
    setMode("off");
  }, []);

  useEffect(() => {
    const inField = () => {
      const s = useGameStore.getState();
      return (s.phase === "playing" || s.phase === "ruins") && !s.photoMode;
    };
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return Boolean(
        el &&
          (el.tagName === "INPUT" ||
            el.tagName === "TEXTAREA" ||
            el.isContentEditable),
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // HUD toggles the objective log on every Tab keydown without checking
      // for auto-repeat, so a held Tab would strobe it ~30 times a second.
      // Only swallowed in the field, where held Tab is this card rather than
      // someone walking the focus ring through a panel.
      if (e.code === "Tab" && e.repeat && !typing() && inField()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (e.code === "Escape" && modeRef.current === "modal") {
        // Swallowed, or the same press also pauses the game behind the card.
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
        return;
      }
      if (typing()) return;
      if (e.key === "?") {
        if (modeRef.current === "off" && !inField()) return;
        e.preventDefault();
        if (modeRef.current === "modal") {
          close();
          return;
        }
        setBindings(getKeymap());
        modeRef.current = "modal";
        setMode("modal");
        // The card is unreadable behind a captured cursor, and a key held
        // through the open would keep walking the operative into the dark.
        clearHeld();
        if (document.pointerLockElement) document.exitPointerLock();
        return;
      }
      if (e.code === "Tab" && modeRef.current === "off" && inField()) {
        e.preventDefault();
        window.clearTimeout(holdRef.current);
        holdRef.current = window.setTimeout(() => {
          setBindings(getKeymap());
          modeRef.current = "peek";
          setMode("peek");
        }, HOLD_MS);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Tab") return;
      window.clearTimeout(holdRef.current);
      if (modeRef.current === "peek") close();
    };

    // Alt-Tab is a Tab whose keyup never arrives; without this the peek card
    // is still on screen when the player comes back.
    const onBlur = () => {
      window.clearTimeout(holdRef.current);
      if (modeRef.current === "peek") close();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      window.clearTimeout(holdRef.current);
    };
  }, [close]);

  if (mode === "off") return null;

  if (mode === "peek") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-4"
      >
        <div className="panel-glass w-full max-w-md rounded-lg p-5">
          <KeymapCard bindings={bindings} />
        </div>
      </div>
    );
  }

  return (
    <TerminalDialog
      title="Control bindings"
      onClose={close}
      closeOnBackdrop
      className="max-h-[85vh] max-w-md overflow-y-auto"
    >
      <KeymapCard bindings={bindings} />
      <button
        type="button"
        onClick={close}
        className="mt-5 min-h-11 w-full rounded-md bg-primary text-sm font-semibold text-fg hover:bg-primary-glow"
      >
        Back to the survey
      </button>
    </TerminalDialog>
  );
}
