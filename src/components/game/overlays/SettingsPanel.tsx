import { useEffect, useState } from "react";
import { TerminalDialog } from "@/components/ui/TerminalDialog";
import { MISSION_BOARD, SPAWNS } from "@/game/data";
import {
  DEFAULT_KEYMAP,
  getKeymap,
  resetKeymap,
  setInvertY,
  setKeymap,
  setLookSensitivity,
} from "@/game/input";
import type { Action, Keymap } from "@/game/input";
import { placeOperative } from "@/game/placement";
import { describeTier } from "@/game/quality";
import type { QualityTier } from "@/game/quality";
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
  attack: "Strike (also mouse 1)",
  journal: "Field journal",
  photo: "Photo mode",
  settings: "This panel",
  map: "Map",
  codex: "Codex",
  objectives: "Objectives",
  pause: "Pause",
};

/** Only one row captures at a time, so its hint can hold a fixed id. */
const CAPTURE_HINT_ID = "keybind-capture-hint";

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
  const presence = useGameStore((s) => s.presenceEnabled);
  const setPresence = useGameStore((s) => s.setPresenceEnabled);
  const quality = useGameStore((s) => s.quality);
  const qualityAuto = useGameStore((s) => s.qualityAuto);
  const setQuality = useGameStore((s) => s.setQuality);
  const setSpawn = useGameStore((s) => s.setPendingSpawn);
  const setPlayerPos = useGameStore((s) => s.setPlayerPos);
  const setPlayerYaw = useGameStore((s) => s.setPlayerYaw);
  // Settings overlays the run; prevPhase is the world phase Resume returns to.
  const prevPhase = useGameStore((s) => s.prevPhase);
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
          <p className="font-mono text-[10px] text-muted">ACTIVE LOADOUT</p>
          <p className="mt-1 text-sm font-semibold text-fg">
            {character.callsign}
          </p>
          <p className="mt-1 text-xs text-muted">{character.loadout}</p>
          <p className="mt-2 font-mono text-[10px] text-muted">
            SPD {character.speed} · STM {character.stamina} · STL{" "}
            {character.stealth} · SCAN×{character.scanBonus} · CBT×
            {character.combatBonus}
          </p>
        </div>
      )}

      <label className="mt-5 block">
        <span className="font-mono text-[10px] tracking-widest text-muted">
          GRAPHICS PRESET
        </span>
        <select
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg"
          value={qualityAuto ? "auto" : quality}
          onChange={(e) => setQuality(e.target.value as QualityTier | "auto")}
        >
          <option value="auto">Auto — match this device</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      {/* Outside the label so the select's accessible name stays the heading
          rather than the whole spec sheet. */}
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted">
        {qualityAuto ? `AUTO · ${quality.toUpperCase()} · ` : ""}
        {describeTier(quality)}
      </p>
      {qualityAuto && (
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted">
          Auto may step down once if frames run short. Choosing a tier makes it
          final.
        </p>
      )}

      <label className="mt-4 block">
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
        <span className="text-sm text-muted">Reduced motion</span>
      </label>
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted">
        Calms interface animation, weather particles and screen effects. This is
        an accessibility setting — use the graphics preset for performance.
      </p>

      <div className="mt-6">
        <p className="font-mono text-[10px] tracking-widest text-muted">
          PRESENCE
        </p>
        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={presence}
            onChange={(e) => setPresence(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm text-muted">
            SURVEY MESH — show other operatives' survey ghosts
          </span>
        </label>
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted">
          Silent holograms of other readers surveying right now. Callsign and
          position only — no chat, no names, nothing stored. Off is total:
          nothing sent, nothing shown.
        </p>
      </div>

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
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted">
          Select a row, then press a key. Esc cancels the capture.
        </p>
        <ul className="mt-2 space-y-1">
          {ACTIONS.map((action) => (
            <li key={action}>
              <button
                type="button"
                onClick={() => setListening(action)}
                aria-describedby={
                  listening === action ? CAPTURE_HINT_ID : undefined
                }
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
              {/* Under the captured row rather than above the list: the row is
                  where the player is looking, and the list scrolls. */}
              {listening === action && (
                <p
                  id={CAPTURE_HINT_ID}
                  className="mt-1 px-3 font-mono text-[10px] leading-relaxed text-muted"
                >
                  Keyboard only — mouse buttons cannot be bound. Mouse 1 always
                  strikes, right mouse always aims.
                </p>
              )}
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
                  if (!m.spawn) return;
                  const coords = SPAWNS[m.spawn];
                  // Fast travel now, not "next deploy": pendingSpawn is wiped by
                  // reset() and every entry point is mid-run, so staging it
                  // never fired. Teleport when a run is live under the panel.
                  const live = prevPhase === "playing" || prevPhase === "ruins";
                  if (live) {
                    setPlayerPos(coords.x, 0, coords.z);
                    setPlayerYaw(coords.yaw);
                    // The store write alone never moved the rig — the
                    // controller owns its transform and overwrites playerPos
                    // on the next frame, so the operative snapped back to
                    // where they were standing the moment play resumed.
                    placeOperative(coords.x, coords.z, coords.yaw);
                    setSpawn(null);
                    // The ruin chamber is its own scene; surfacing the operative
                    // on fast travel keeps Resume in the open world.
                    if (prevPhase === "ruins") {
                      useGameStore.setState({ prevPhase: "playing" });
                    }
                    pushMessage(`FAST TRAVEL — ${m.title}`);
                  } else {
                    setSpawn(m.spawn as SpawnPoint);
                    pushMessage(`BOARD — ${m.title} staged for deploy`);
                  }
                }}
              >
                <span className="font-medium">{m.title}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {m.detail}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 font-mono text-[10px] text-muted">
          Fast travel drops the operative at the marked site now — mid-survey
          only. Off-run marks fall back to the next deploy.
        </p>
      </div>

      <button
        type="button"
        onClick={close}
        className="mt-6 min-h-11 w-full rounded-md bg-primary text-sm font-semibold text-void hover:bg-primary-glow"
      >
        Resume
      </button>
    </TerminalDialog>
  );
}
