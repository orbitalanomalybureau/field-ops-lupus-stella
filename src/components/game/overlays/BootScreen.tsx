import { useCallback, useEffect, useState } from "react";
import { useGameStore } from "@/game/store";

type BootLine = {
  text: string;
  tone: string;
};

const BOOT_LINES: BootLine[] = [
  { text: "ODYSSEY TRAINING DATABASE", tone: "text-fg" },
  { text: "SIM-012 · FIELD OPS: LUPUS STELLA", tone: "text-muted" },
  { text: "ACCESS: DANIEL, T. — COLONEL, USSF (RET.)", tone: "text-muted" },
  { text: "Survey mesh — checksum holds.", tone: "text-dim" },
  { text: "EM lattice — hydrated.", tone: "text-dim" },
  { text: "Link stable.", tone: "text-accent" },
];

const CHAR_MS = 7;
/** Pause between lines, expressed in characters so one cursor drives both. */
const LINE_GAP = 7;
const HOLD_MS = 300;

const SPAN = BOOT_LINES.map((l) => l.text.length + LINE_GAP);
const TOTAL = SPAN.reduce((a, b) => a + b, 0);

/** Lines started so far, each cut at the cursor. */
function revealed(cursor: number): string[] {
  const out: string[] = [];
  let left = cursor;
  for (let i = 0; i < BOOT_LINES.length && left > 0; i++) {
    out.push(BOOT_LINES[i].text.slice(0, left));
    left -= SPAN[i];
  }
  return out;
}

export function BootScreen({ onDone }: { onDone: () => void }) {
  const reduced = useGameStore((s) => s.reducedMotion);
  const [cursor, setCursor] = useState(0);

  const skip = useCallback(() => setCursor(TOTAL), []);

  useEffect(() => {
    if (reduced) {
      setCursor(TOTAL);
      return;
    }
    let raf = 0;
    const started = performance.now();
    const step = (now: number) => {
      const next = Math.min(TOTAL, Math.floor((now - started) / CHAR_MS));
      setCursor((c) => (c >= next ? c : next));
      if (next < TOTAL) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  useEffect(() => {
    if (cursor < TOTAL) return;
    const t = window.setTimeout(onDone, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [cursor, onDone]);

  useEffect(() => {
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, [skip]);

  const lines = revealed(cursor);
  const complete = lines.filter(
    (text, i) => text.length === BOOT_LINES[i].text.length,
  ).length;

  return (
    <div
      onClick={skip}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-void px-6"
    >
      <div className="w-full max-w-lg font-mono text-sm">
        <p className="mb-6 text-xs tracking-[0.35em] text-accent">
          CLASSIFIED // ODYSSEY COMMAND
        </p>
        {/* Per-character churn would be read out as noise; the step counter
            below carries the same information once per line. */}
        <div aria-hidden="true" className="min-h-[10rem] space-y-2 text-muted">
          {lines.map((text, i) => (
            <p key={BOOT_LINES[i].text} className={BOOT_LINES[i].tone}>
              {text}
              {i === lines.length - 1 && cursor < TOTAL && (
                <span className="ml-0.5 animate-pulse text-accent">▌</span>
              )}
            </p>
          ))}
        </div>

        {/*
          Handshake steps completed — the only work on this screen that is
          actually finishing. The 3D payload is not requested until the
          operative deploys, so nothing here can honestly drive a percentage.
        */}
        <div className="mt-10">
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-accent transition-[width] duration-150"
              style={{ width: `${(complete / BOOT_LINES.length) * 100}%` }}
            />
          </div>
          <p
            role="status"
            className="mt-2 text-[11px] tracking-[0.25em] text-dim"
          >
            HANDSHAKE {complete}/{BOOT_LINES.length}
            {cursor < TOTAL ? " · ANY KEY SKIPS" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

type AssetProgress = {
  active: boolean;
  progress: number;
  total: number;
};

/**
 * drei's loading store, reached the only way that keeps three out of the menu
 * bundle: a dynamic deep import, made after the world chunk is already on its
 * way down. It reports on anything routed through three's DefaultLoadingManager
 * — today the world is fully procedural and there is nothing to report, so the
 * transition falls back to the milestones below rather than inventing motion.
 */
function useAssetProgress(): AssetProgress | null {
  const [state, setState] = useState<AssetProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    import("@react-three/drei/core/Progress.js")
      .then(({ useProgress }) => {
        if (cancelled) return;
        setState(useProgress.getState());
        unsubscribe = useProgress.subscribe(setState);
      })
      .catch(() => {
        /* no loader store — the milestone read-out still stands on its own */
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return state;
}

/** Beats of fiction the insertion holds for even on an instant load. */
const MIN_BEAT_MS = 1100;
/** Never trap the player behind the transition, whatever the GPU is doing. */
const MAX_HOLD_MS = 12000;
const FADE_MS = 500;
/** Frames drawn after the canvas exists before the world counts as live. */
const FRAME_LOCK_TICKS = 3;

/**
 * Covers the gap between "Deploy to surface" and the first drawn frame — the
 * lazy chunk still has to arrive and every shader in the scene has to compile,
 * which used to be spent staring at a black rectangle.
 *
 * Non-interactive by construction: the player may click through it to take
 * pointer lock while it fades.
 */
export function InsertionTransition({
  ready,
  onDone,
}: {
  ready: boolean;
  onDone: () => void;
}) {
  const assets = useAssetProgress();
  const [renderer, setRenderer] = useState(false);
  const [frameLock, setFrameLock] = useState(false);
  const [beatDone, setBeatDone] = useState(false);
  const [capped, setCapped] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let raf = 0;
    let ticks = 0;
    const step = () => {
      if (document.querySelector("canvas")) {
        setRenderer(true);
        ticks += 1;
        if (ticks >= FRAME_LOCK_TICKS) {
          setFrameLock(true);
          return;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const beat = window.setTimeout(() => setBeatDone(true), MIN_BEAT_MS);
    const cap = window.setTimeout(() => setCapped(true), MAX_HOLD_MS);
    return () => {
      window.clearTimeout(beat);
      window.clearTimeout(cap);
    };
  }, []);

  const payload = assets && assets.total > 0 ? assets : null;
  const assetsBusy = Boolean(
    payload && payload.active && payload.progress < 100,
  );
  const complete = capped || (beatDone && ready && frameLock && !assetsBusy);

  useEffect(() => {
    if (!complete) return;
    setLeaving(true);
    const t = window.setTimeout(onDone, FADE_MS);
    return () => window.clearTimeout(t);
  }, [complete, onDone]);

  return (
    <div
      role="status"
      aria-label="Insertion in progress"
      className={`pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center bg-void px-6 transition-opacity duration-500 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="w-full max-w-sm font-mono">
        <p className="text-[11px] tracking-[0.35em] text-accent">
          INSERTION // POD 12
        </p>
        <p className="mt-3 text-sm text-fg">Entry interface. Hold.</p>
        <p className="mt-1 text-[11px] leading-relaxed text-dim">
          Ninety seconds of hull noise. Telemetry resumes on the ground.
        </p>

        <div className="mt-8 space-y-1.5 text-[11px]">
          <Stage label="MESH STREAM" done={ready} />
          <Stage label="OPTICS" done={renderer} />
          <Stage label="FRAME LOCK" done={frameLock} />
        </div>

        {payload && (
          <div className="mt-6">
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full bg-accent transition-[width] duration-150"
                style={{ width: `${Math.min(100, payload.progress)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] tracking-[0.25em] text-dim">
              PAYLOAD {Math.round(payload.progress)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stage({ label, done }: { label: string; done: boolean }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className={done ? "text-muted" : "text-dim"}>{label}</span>
      <span
        className={`tracking-[0.25em] ${done ? "text-accent" : "text-dim"}`}
      >
        {done ? "LOCKED" : "STANDBY"}
      </span>
    </p>
  );
}
