import { useCallback, useEffect, useState } from "react";
import { useGameStore } from "@/game/store";
import { track } from "@/lib/telemetry";

/**
 * Paired with the listener in scene/GameCanvas.tsx (PhotoFovRig). A window
 * event rather than store state so this overlay stays out of the lazily
 * loaded 3D chunk. `fov: null` restores the gameplay FOV.
 */
const FOV_EVENT = "fieldops:photo-fov";

/** Gameplay FOV from GameCanvas's camera props; the slider's resting point. */
const FOV_DEFAULT = 56;
const FOV_MIN = 30;
const FOV_MAX = 90;

/** styles.css palette, inlined: 2D canvas text cannot read CSS variables. */
const INK = "#e8ebe6";
const VOID = "#05060a";
const FRAME = "rgba(232, 235, 230, 0.55)";
const ACCENT = "#3d9e8f";

/**
 * Local copy of the HUD's 28-hour clock label. The HUD is unmounted during
 * photo phase and does not export it; keep in step with overlays/HUD.tsx.
 */
function timeLabel(tod: number): string {
  const hours = Math.floor(tod * 28) % 28;
  const mins = Math.floor((tod * 28 * 60) % 60);
  const phase =
    tod < 0.22 ? "NIGHT" : tod < 0.35 ? "DAWN" : tod < 0.65 ? "DAY" : tod < 0.8 ? "DUSK" : "NIGHT";
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")} · ${phase}`;
}

/** Draw the diegetic frame around the raw render on an offscreen canvas. */
function composite(
  source: HTMLCanvasElement,
  meta: { callsign: string; clock: string; grid: string },
): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.drawImage(source, 0, 0, w, h);

  const pad = Math.max(14, Math.round(w * 0.02));
  const small = Math.max(11, Math.round(w / 90));
  const inset = Math.max(6, Math.round(pad * 0.5));

  ctx.strokeStyle = FRAME;
  ctx.lineWidth = Math.max(1, Math.round(w / 900));
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);

  ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.shadowColor = VOID;
  ctx.shadowBlur = small * 0.5;

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.fillText("CLASSIFIED // ODYSSEY COMMAND", pad, pad);
  ctx.textAlign = "right";
  ctx.fillStyle = ACCENT;
  ctx.fillText(meta.callsign, w - pad, pad);

  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.fillText(meta.clock, pad, h - pad);
  ctx.textAlign = "right";
  ctx.fillText(meta.grid, w - pad, h - pad);
  return out;
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Photo mode with an actual photograph at the end of it. Requires
 * `preserveDrawingBuffer: true` on the renderer (set in GameCanvas) so the
 * canvas can be read back on demand rather than inside the render loop.
 *
 * Mounted by FieldOpsApp during phase "photo". The on-screen EXIT control
 * lives in this panel — Phase 0's mobile softlock lesson: every mode a touch
 * player can enter needs a touch way out.
 */
export function PhotoMode() {
  const togglePhoto = useGameStore((s) => s.togglePhotoMode);
  const [fov, setFov] = useState(FOV_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [shareable] = useState(
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
  );

  // Whatever the slider did, leaving photo mode hands the camera back.
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent(FOV_EVENT, { detail: { fov: null } }));
    };
  }, []);

  const applyFov = (value: number) => {
    setFov(value);
    window.dispatchEvent(new CustomEvent(FOV_EVENT, { detail: { fov: value } }));
  };

  /** Composite the current render; file the journal entry and the event. */
  const snap = useCallback(async (): Promise<{
    blob: Blob;
    name: string;
  } | null> => {
    const source = document.querySelector<HTMLCanvasElement>("[data-fieldops-canvas] canvas");
    if (!source) return null;
    const s = useGameStore.getState();
    const callsign = s.getCharacter()?.callsign ?? "OPS";
    const { x, z } = s.playerPos;
    const clock = timeLabel(s.timeOfDay);
    const grid = `${x.toFixed(0)},${z.toFixed(0)}`;
    const framed = composite(source, {
      callsign,
      clock,
      grid: `GRID ${grid}`,
    });
    const blob = await new Promise<Blob | null>((resolve) => framed.toBlob(resolve, "image/png"));
    if (!blob) return null;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const name = `fieldops-${callsign.toLowerCase()}-${stamp}.png`;
    s.addJournal("Field photograph", `Exposure filed. Grid ${grid} · ${clock}.`, false);
    track("photo_capture", { x: Math.round(x), z: Math.round(z) });
    return { blob, name };
  }, []);

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const shot = await snap();
      if (shot) saveBlob(shot.blob, shot.name);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const shot = await snap();
      if (!shot) return;
      const file = new File([shot.blob], shot.name, { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator
          .share({ files: [file], title: "Field Ops — Lupus Stella" })
          .catch(() => undefined);
      } else {
        saveBlob(shot.blob, shot.name);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={togglePhoto}
        className="absolute right-3 top-3 z-40 min-h-11 min-w-11 rounded-md border border-border bg-surface/70 px-3 font-mono text-[10px] tracking-[0.2em] text-muted backdrop-blur-sm hover:text-fg"
      >
        EXIT
      </button>
      <div className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-md border border-border bg-surface/70 px-3 py-2 backdrop-blur-sm">
        <button
          type="button"
          onClick={capture}
          disabled={busy}
          className="min-h-11 rounded-md bg-primary px-4 font-mono text-xs font-semibold tracking-widest text-void hover:bg-primary-glow disabled:opacity-50"
        >
          CAPTURE
        </button>
        {shareable && (
          <button
            type="button"
            onClick={share}
            disabled={busy}
            className="min-h-11 rounded-md border border-border px-4 font-mono text-xs tracking-widest text-muted hover:text-fg disabled:opacity-50"
          >
            SHARE
          </button>
        )}
        <label className="flex min-h-11 items-center gap-2 font-mono text-[10px] text-muted">
          FOV {fov}
          <input
            type="range"
            min={FOV_MIN}
            max={FOV_MAX}
            step={1}
            value={fov}
            aria-label="Field of view"
            onChange={(e) => applyFov(Number(e.target.value))}
            className="w-28 accent-accent"
          />
        </label>
        <span className="font-mono text-[10px] text-dim">P · exit</span>
      </div>
    </>
  );
}
