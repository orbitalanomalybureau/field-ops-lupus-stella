import { Link } from "@tanstack/react-router";
import { CHARACTERS } from "@/game/data";
import { useGameStore } from "@/game/store";
import type { CharacterId, SpoilerCeiling } from "@/game/types";

export function CharacterSelect() {
  const selectCharacter = useGameStore((s) => s.selectCharacter);
  const embed = useGameStore((s) => s.embedMode);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const setSpoiler = useGameStore((s) => s.setSpoilerCeiling);

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

        <label className="mb-6 block max-w-sm">
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

        <p className="mb-4 font-mono text-xs uppercase tracking-widest text-muted">
          Select operative · loadout
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectCharacter(c.id as CharacterId)}
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
