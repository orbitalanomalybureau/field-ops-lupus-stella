import { useEffect, useState } from "react";
import { TerminalDialog } from "@/components/ui/TerminalDialog";
import { MISSION_BOARD } from "@/game/data";
import {
  DEFAULT_KEYMAP,
  getKeymap,
  resetKeymap,
  setInvertY,
  setKeymap,
  setLookSensitivity,
} from "@/game/input";
import type { Action, Keymap } from "@/game/input";
import { useGameStore } from "@/game/store";
import type { SpawnPoint, SpoilerCeiling } from "@/game/types";

/**
 * Bindings and look preferences are device settings, not run state, so they
 * live outside the save blob: abandoning a run must not reset them.
 */
const INPUT_PREFS_KEY = "lupus-fieldops-input-v1";

type InputPrefs = {
  keymap: Keymap;
  sensitivity: number;
  invertY: boolean;
};

const ACTIONS = Object.keys(DEFAULT_KEYMAP) as Action[];

const ACTION_LABELS: Record<Action, string> = {
  forward: "Move forward",
  back: "Move back",
  left: "Strafe left",
  right: "Strafe right",
  sprint: "Sprint",
  jump: "Jump",
  scan: "Field scanner",
  interact: "Interact",
  combat: "Combat stance",
  journal: "Field journal",
  photo: "Photo mode",
  settings: "This panel",
  map: "Map",
  codex: "Codex",
  objectives: "Objectives",
  pause: "Pause",
};

function prettyCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5).toUpperCase();
  if (code.startsWith("Shift")) return "SHIFT";
  if (code === "Space") return "SPACE";
  if (code === "Escape") return "ESC";
  return code.toUpperCase();
}

function sanitizeKeymap(raw: unknown): Partial<Keymap> {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const out: Partial<Keymap> = {};
  for (const action of ACTIONS) {
    const codes = source[action];
    if (Array.isArray(codes) && codes.every((c) => typeof c === "string")) {
      out[action] = codes as string[];
    }
  }
  return out;
}

function readPrefs(): Partial<InputPrefs> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(INPUT_PREFS_KEY);
    return raw ? (JSON.parse(raw) as Partial<InputPrefs>) : {};
  } catch {
    return {};
  }
}

function writePrefs(prefs: InputPrefs): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(INPUT_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage denied — the session still honours the live settings */
  }
}

// Applied at import rather than on mount: most players never open this panel,
// and their bindings still have to be live from the first frame.
if (typeof window !== "undefined") {
  const stored = readPrefs();
  setKeymap(sanitizeKeymap(stored.keymap));
  if (typeof stored.sensitivity === "number") {
    setLookSensitivity(stored.sensitivity);
  }
  if (typeof stored.invertY === "boolean") setInvertY(stored.invertY);
}

export function SettingsPanel() {
  const close = useGameStore((s) => s.closeOverlay);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const setSpoiler = useGameStore((s) => s.setSpoilerCeiling);
  const volume = useGameStore((s) => s.masterVolume);
  const setVol = useGameStore((s) => s.setMasterVolume);
  const reduced = useGameStore((s) => s.reducedMotion);
  const setReduced = useGameStore((s) => s.setReducedMotion);
  const setSpawn = useGameStore((s) => s.setPendingSpawn);
  const pushMessage = useGameStore((s) => s.pushMessage);
  const character = useGameStore((s) => s.getCharacter());

  const [bindings, setBindings] = useState<Keymap>(() => getKeymap());
  const [listening, setListening] = useState<Action | null>(null);
  const [sensitivity, setSensitivity] = useState(
    () => readPrefs().sensitivity ?? 1,
  );
  const [invert, setInvert] = useState(() => readPrefs().invertY ?? false);

  const missions = MISSION_BOARD.filter(
    (m) => !m.book2 || spoiler !== "book1",
  );

  const persist = (patch: Partial<InputPrefs>) => {
    writePrefs({
      keymap: getKeymap(),
      sensitivity,
      invertY: invert,
      ...patch,
    });
  };

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      // Capture phase: the bind key must not reach the game's own listeners.
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setListening(null);
        return;
      }
      const next: Partial<Keymap> = {};
      next[listening] = [e.code];
      // A code bound twice would fire two actions at once, so it is taken
      // away from whatever held it.
      const current = getKeymap();
      for (const action of ACTIONS) {
        if (action === listening) continue;
        const kept = current[action].filter((c) => c !== e.code);
        if (kept.length !== current[action].length) next[action] = kept;
      }
      setKeymap(next);
      setBindings(getKeymap());
      writePrefs({ keymap: getKeymap(), sensitivity, invertY: invert });
      setListening(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, sensitivity, invert]);

  return (
    <TerminalDialog
      title="Settings"
      onClose={close}
      className="max-h-[90vh] max-w-md overflow-y-auto"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-accent">
            SYSTEMS
          </p>
          <h2 className="mt-1 text-xl font-semibold text-fg">Settings</h2>
        </div>
        <button
          type="button"
          onClick={close}
          className="min-h-10 rounded-md border border-border px-3 font-mono text-xs text-muted hover:text-fg"
        >
          Close
        </button>
      </div>

      {character && (
        <div className="mt-4 rounded-md border border-border bg-surface/40 p-3">
          <p className="font-mono text-[10px] text-dim">ACTIVE LOADOUT</p>
          <p className="mt-1 text-sm font-semibold text-fg">
            {character.callsign}
          </p>
          <p className="mt-1 text-xs text-muted">{character.loadout}</p>
          <p className="mt-2 font-mono text-[10px] text-dim">
            SPD {character.speed} · STM {character.stamina} · STL{" "}
            {character.stealth} · SCAN×{character.scanBonus} · CBT×
            {character.combatBonus}
          </p>
        </div>
      )}

      <label className="mt-5 block">
        <span className="font-mono text-[10px] tracking-widest text-muted">
          SPOILER CEILING
        </span>
        <select
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg"
          value={spoiler}
          onChange={(e) => setSpoiler(e.target.value as SpoilerCeiling)}
        >
          <option value="book1">Book I only</option>
          <option value="book2early">Book I + early Book II</option>
        </select>
      </label>

      <label className="mt-4 block">
        <span className="font-mono text-[10px] tracking-widest text-muted">
          MASTER VOLUME · {Math.round(volume * 100)}%
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVol(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--color-accent)]"
        />
      </label>

      <label className="mt-4 block">
        <span className="font-mono text-[10px] tracking-widest text-muted">
          LOOK SENSITIVITY · {sensitivity.toFixed(2)}×
        </span>
        <input
          type="range"
          min={0.2}
          max={3}
          step={0.05}
          value={sensitivity}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSensitivity(v);
            setLookSensitivity(v);
            persist({ sensitivity: v });
          }}
          className="mt-2 w-full accent-[var(--color-accent)]"
        />
      </label>

      <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={invert}
          onChange={(e) => {
            setInvert(e.target.checked);
            setInvertY(e.target.checked);
            persist({ invertY: e.target.checked });
          }}
          className="h-4 w-4"
        />
        <span className="text-sm text-muted">Invert vertical look</span>
      </label>

      <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={reduced}
          onChange={(e) => setReduced(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm text-muted">Reduced motion / lighter FX</span>
      </label>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] tracking-widest text-muted">
            CONTROL BINDINGS
          </p>
          <button
            type="button"
            onClick={() => {
              resetKeymap();
              setBindings(getKeymap());
              setListening(null);
              persist({ keymap: getKeymap() });
            }}
            className="min-h-10 rounded-md border border-border px-3 font-mono text-[10px] tracking-wide text-muted hover:text-fg"
          >
            RESTORE DEFAULTS
          </button>
        </div>
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-dim">
          Select a row, then press a key. Esc cancels the capture.
        </p>
        <ul className="mt-2 space-y-1">
          {ACTIONS.map((action) => (
            <li key={action}>
              <button
                type="button"
                onClick={() => setListening(action)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left ${
                  listening === action
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-accent/40"
                }`}
              >
                <span className="text-sm text-fg">{ACTION_LABELS[action]}</span>
                <span className="font-mono text-[11px] tracking-wide text-accent">
                  {listening === action
                    ? "AWAITING KEY…"
                    : bindings[action].map(prettyCode).join(" / ") || "UNBOUND"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <p className="font-mono text-[10px] tracking-widest text-muted">
          MISSION BOARD · FAST TRAVEL MARK
        </p>
        <ul className="mt-2 space-y-2">
          {missions.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-left text-sm text-fg hover:border-accent/40"
                onClick={() => {
                  if (m.spawn) {
                    setSpawn(m.spawn as SpawnPoint);
                    pushMessage(`BOARD — ${m.title} marked for next deploy`);
                  }
                }}
              >
                <span className="font-medium">{m.title}</span>
                <span className="mt-0.5 block text-xs text-dim">
                  {m.detail}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 font-mono text-[10px] text-dim">
          Marks apply on next deploy (reset → redeploy) or deep-link spawn.
        </p>
      </div>

      <button
        type="button"
        onClick={close}
        className="mt-6 min-h-11 w-full rounded-md bg-primary text-sm font-semibold text-fg hover:bg-primary-glow"
      >
        Resume
      </button>
    </TerminalDialog>
  );
}
