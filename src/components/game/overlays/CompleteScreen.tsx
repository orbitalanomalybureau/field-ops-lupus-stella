import { useEffect, useState } from "react";
import { ArmedButton } from "@/components/ui/ArmedButton";
import { useGameStore } from "@/game/store";
import { fetchProtocolStats, postEnding } from "@/lib/telemetry";

/**
 * Below this many total runs the communal stat reads as noise, not signal, so
 * the screen shows a sealed-tally line instead of a jumpy percentage.
 */
const TALLY_QUORUM = 25;

/** Where the doorway out of the game points; one env var overrides for staging. */
const NOVEL_SITE_URL =
  (import.meta.env.VITE_NOVEL_SITE_URL as string | undefined) ??
  "https://exodus2121.com";

export function CompleteScreen() {
  const character = useGameStore((s) => s.getCharacter());
  const discoveries = useGameStore((s) => s.discoveries);
  const ending = useGameStore((s) => s.ending);
  const reset = useGameStore((s) => s.reset);
  const setPhase = useGameStore((s) => s.setPhase);
  const exportJournal = useGameStore((s) => s.exportJournal);
  const total = useGameStore((s) => s.visibleObjectives().length);
  const done = useGameStore(
    (s) => s.visibleObjectives().filter((o) => o.done).length,
  );
  const [copied, setCopied] = useState(false);
  const [tally, setTally] = useState<{
    broadcast: number;
    silent: number;
  } | null>(null);
  const broadcast = ending === "broadcast";
  // This screen only mounts after gameplay, so navigator exists; the guard is
  // for the share API itself — desktop browsers mostly lack it and get the
  // clipboard path instead.
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  // Communal quiet-protocol tally. Each completed run is counted exactly once:
  // the guard flag persists with the save, so remounting this screen (or
  // reloading onto it) never double-counts, and reset() clears it for the next
  // operative's run. Network failure never blocks or errors the screen —
  // postEnding is fire-and-forget and fetchProtocolStats resolves null.
  useEffect(() => {
    if (!ending) return;
    const s = useGameStore.getState();
    if (!s.flags["protocol-tallied"]) {
      s.raiseFlag("protocol-tallied");
      void postEnding(ending).catch(() => undefined);
    }
    let cancelled = false;
    void fetchProtocolStats()
      .then((stats) => {
        if (!cancelled && stats) setTally(stats);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ending]);

  const tallyRuns = tally ? tally.broadcast + tally.silent : 0;
  const violatedPct =
    tally && tallyRuns > 0
      ? ((tally.broadcast / tallyRuns) * 100).toFixed(1)
      : "0.0";

  const downloadLog = () => {
    const blob = new Blob([exportJournal()], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `field-ops-journal-${character?.callsign ?? "ops"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareLog = async () => {
    if (canShare) {
      try {
        await navigator.share({
          title: "Field Ops — expedition log",
          text: exportJournal(),
        });
      } catch {
        // Share sheet dismissed or payload refused; the download path remains.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(exportJournal());
      setCopied(true);
    } catch {
      // Clipboard refused (permissions, insecure context) — fall back to the
      // file the download button already produces.
      downloadLog();
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-void px-4">
      <div className="panel-glass w-full max-w-md rounded-lg p-8 text-center">
        <p
          className={`font-mono text-[11px] tracking-[0.3em] ${
            broadcast ? "text-danger" : "text-accent"
          }`}
        >
          {broadcast ? "SIM-012 COMPLETE · PROTOCOL BREACH" : "SIM-012 COMPLETE"}
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-fg">
          {broadcast ? "Transmission logged" : "Field log sealed"}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {character?.name} · {done}/{total} objectives · {discoveries} codex
        </p>
        {broadcast ? (
          <>
            <p className="mt-6 text-sm leading-relaxed text-muted">
              Colony net filed it at 04:12 local — eleven seconds of uncollared
              carrier out of the southern chamber, countersigned and archived.
              Thornhill recorded no collar drift that night. The paperwork is
              immaculate.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Forty minutes later the ridge mast logged a return in the same
              band, from somewhere past the water, eleven seconds long. Voss
              filed a request for clarification with Odyssey. It is still open.
              The colony keeps its lights on the same schedule.
            </p>
            <p className="mt-5 font-mono text-sm tracking-[0.3em] text-danger">
              REMEMBERED.
            </p>
            <p className="mt-4 font-mono text-xs text-dim">
              Book I path complete · breach on record · Book II ops available
              later
            </p>
          </>
        ) : (
          <>
            <p className="mt-6 text-sm leading-relaxed text-muted">
              The survey mesh is archived to the Odyssey training database.
              Lupus Stella is not empty. It is patient. The far continent is
              already listening — and so is the thing that feeds on light.
            </p>
            <p className="mt-4 font-mono text-xs text-dim">
              Book I path complete · Book II ops available later
            </p>
          </>
        )}

        {tally && (
          <p className="mt-4 font-mono text-[10px] leading-relaxed text-dim">
            {tallyRuns >= TALLY_QUORUM
              ? `ODYSSEY COMMAND — ${violatedPct}% of field operatives have violated quiet protocol.`
              : "ODYSSEY COMMAND — survey rotation tally sealed pending quorum."}
          </p>
        )}

        <div className="mt-6 rounded-md border border-border bg-surface/40 p-3 text-left">
          <p className="font-mono text-[10px] tracking-widest text-muted">
            EXPEDITION LOG · CLEARED FOR RELEASE
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadLog}
              className="min-h-11 rounded-md border border-border px-4 text-sm text-muted hover:border-muted hover:text-fg"
            >
              Download log
            </button>
            <button
              type="button"
              onClick={() => void shareLog()}
              className="min-h-11 rounded-md border border-border px-4 text-sm text-muted hover:border-muted hover:text-fg"
            >
              {canShare ? "Share log" : copied ? "COPIED" : "Copy log"}
            </button>
          </div>
          <a
            href={`${NOVEL_SITE_URL}?utm_source=fieldops&utm_medium=complete&utm_campaign=complete`}
            target="_blank"
            rel="noopener"
            className="mt-3 inline-block break-words font-mono text-[11px] leading-snug text-accent underline decoration-accent/40 underline-offset-2 hover:text-primary-glow"
          >
            The full record — 2121: EXODUS
          </a>
        </div>

        {/* Wraps so the armed caption — a full-width sibling of the button it
            describes — drops to its own line under the row. */}
        <div className="mt-6 flex flex-col flex-wrap gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => setPhase("playing")}
            className="min-h-11 rounded-md border border-border px-5 py-2.5 text-sm text-muted hover:text-fg"
          >
            Return to surface
          </button>
          <ArmedButton
            idleLabel="New operative"
            armedLabel="CONFIRM — ERASES FIELD LOG"
            consequence="PROGRESS IS NOT RECOVERABLE"
            onConfirm={reset}
            className="min-h-11 rounded-md px-5 py-2.5 font-semibold"
            idleClassName="bg-primary text-sm text-void hover:bg-primary-glow"
            armedClassName="border border-danger bg-danger/15 font-mono text-[11px] tracking-wide text-danger"
            hintClassName="w-full font-mono text-[10px] text-dim"
          />
        </div>
      </div>
    </div>
  );
}
