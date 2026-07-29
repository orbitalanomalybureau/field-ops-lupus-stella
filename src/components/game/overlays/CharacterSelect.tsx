import { Link } from "@tanstack/react-router";
import { CHARACTERS, MARKERS } from "@/game/data";
import { useGameStore } from "@/game/store";
import type { CharacterId, SpoilerCeiling, WorldMarker } from "@/game/types";

/**
 * MARKERS are the only named places the fiction has, so the nearest one is a
 * good-enough "last position". NPC pips are people, not places, and book2
 * markers stay unnamed under a book1 ceiling.
 */
function lastPosition(
  pos: { x: number; z: number },
  ceiling: SpoilerCeiling,
): string {
  let best: WorldMarker | null = null;
  let bestDist = Infinity;
  for (const m of MARKERS) {
    if (m.kind === "npc") continue;
    if (m.book2 && ceiling === "book1") continue;
    const d = Math.hypot(m.x - pos.x, m.z - pos.z);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  if (!best) return "UNRESOLVED";
  const label = best.label.toUpperCase();
  return bestDist < 25 ? label : `${Math.round(bestDist)} M FROM ${label}`;
}

export function CharacterSelect() {
  const selectCharacter = useGameStore((s) => s.selectCharacter);
  const resumeMission = useGameStore((s) => s.resumeMission);
  const reset = useGameStore((s) => s.reset);
  const embed = useGameStore((s) => s.embedMode);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const setSpoiler = useGameStore((s) => s.setSpoilerCeiling);
  const hasSave = useGameStore((s) => s.hasSave);
  const saved = useGameStore((s) => s.getCharacter());
  const playerPos = useGameStore((s) => s.playerPos);
  const discoveries = useGameStore((s) => s.discoveries);
  const total = useGameStore((s) => s.visibleObjectives().length);
  const done = useGameStore(
    (s) => s.visibleObjectives().filter((o) => o.done).length,
  );

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-void">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgb(61_158_143/0.08),_transparent_55%)]" />
      <div className="relative mx-auto flex min-h-full max-w-4xl flex-col px-5 py-10 sm:px-8">
        <header className="mb-8 border-b border-border pb-6">
          <p className="font-mono text-[11px] tracking-[0.3em] text-accent">
            CLASSIFIED // FIELD OPS{embed ? " · EMBED" : ""}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            2121: EXODUS
          </h1>
          <p className="mt-2 max-w-xl text-muted leading-relaxed">
            Open-world survey of Lupus Stella — day cycle, weather, Ridge-7,
            Kaguyahime coast, colony voices, journal export.
          </p>
          {!embed && (
            <p className="mt-4 font-mono text-[11px] text-muted">
              <Link to="/embed" className="text-accent hover:underline">
                /embed
              </Link>
              {" · "}
              <Link to="/terminal" className="text-accent hover:underline">
                Classified Terminal
              </Link>
            </p>
          )}
        </header>

        {hasSave && saved && (
          <button
            type="button"
            onClick={resumeMission}
            className="group mb-8 w-full rounded-lg border border-accent/40 bg-surface p-5 text-left transition hover:border-accent hover:bg-surface-elevated active:scale-[0.99]"
          >
            <span className="block font-mono text-[10px] tracking-[0.3em] text-accent">
              FIELD LOG ON DISK · SURVEY MESH HELD
            </span>
            <span className="mt-2 flex flex-wrap items-baseline gap-x-3">
              <span className="text-lg font-semibold text-fg group-hover:text-accent">
                RESUME OPERATION
              </span>
              <span className="font-mono text-xs text-dim">
                {saved.callsign} · {saved.rank} {saved.name}
              </span>
            </span>
            <span className="mt-4 grid gap-1 border-t border-border pt-3 font-mono text-[11px] text-muted sm:grid-cols-3">
              <span>
                {done}/{total} OBJECTIVES
              </span>
              <span>{discoveries} CODEX</span>
              <span>LAST POSITION — {lastPosition(playerPos, spoiler)}</span>
            </span>
          </button>
        )}

        <div className="mb-6 max-w-sm">
          <label className="block">
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
          <p className="mt-2 text-xs leading-relaxed text-dim">
            Redaction level, not difficulty. Book I keeps every site, voice, and
            codex entry that Book II opens sealed until you have read that far.
          </p>
        </div>

        <p className="mb-4 font-mono text-xs uppercase tracking-widest text-muted">
          {hasSave && saved
            ? "Or select a fresh operative · loadout"
            : "Select operative · loadout"}
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                // A fresh operative from this grid starts a clean run; without
                // reset() the existing save's progress would ride along under
                // the new characterId. Only the RESUME card continues a run.
                if (hasSave) reset();
                selectCharacter(c.id as CharacterId);
              }}
              className="group panel-glass flex flex-col rounded-lg p-5 text-left transition hover:border-accent/50 hover:bg-surface-elevated active:scale-[0.99]"
            >
              <span
                className="font-mono text-[10px] tracking-widest"
                style={{ color: c.accent }}
              >
                {c.rank}
              </span>
              <span className="mt-2 text-lg font-semibold text-fg group-hover:text-accent">
                {c.name}
              </span>
              <span className="font-mono text-xs text-dim">{c.callsign}</span>
              <p className="mt-2 font-mono text-[10px] text-accent">
                {c.loadout}
              </p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                {c.blurb}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-3 font-mono text-[10px] text-dim">
                <span>SPD {c.speed.toFixed(2)}</span>
                <span>STM {c.stamina.toFixed(2)}</span>
                <span>STL {c.stealth.toFixed(2)}</span>
                <span>SCAN×{c.scanBonus.toFixed(2)}</span>
              </div>
            </button>
          ))}
        </div>

        <footer className="mt-auto pt-12 font-mono text-[11px] text-dim">
          SIM-012 · PWA-ready · embed for exodus2121.com Classified Terminal
        </footer>
      </div>
    </div>
  );
}
