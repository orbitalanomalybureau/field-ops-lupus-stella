import { useMemo } from "react";
import { useGameStore } from "@/game/store";
import { getAudio } from "@/game/audio";

export function Briefing() {
  const character = useGameStore((s) => s.getCharacter());
  const startMission = useGameStore((s) => s.startMission);
  const reset = useGameStore((s) => s.reset);
  const embed = useGameStore((s) => s.embedMode);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const pending = useGameStore((s) => s.pendingSpawn);
  const objectives = useGameStore((s) => s.objectives);
  const revealed = useGameStore((s) => s.revealedObjectives);

  // Mirrors visibleObjectives(): the brief must never preview a task the
  // player has not yet earned the right to know about.
  const open = useMemo(
    () =>
      objectives.filter(
        (o) =>
          !o.done &&
          !o.optional &&
          (!o.book2 || spoiler !== "book1") &&
          (!o.hidden || revealed.includes(o.id)),
      ),
    [objectives, spoiler, revealed],
  );
  const preview = open.slice(0, 3);
  const rest = open.length - preview.length;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-void/95 px-4">
      <div className="panel-glass w-full max-w-xl rounded-lg p-6 sm:p-8">
        <p className="font-mono text-[11px] tracking-[0.3em] text-accent">
          MISSION BRIEF // DAY 247+
          {embed ? " · EMBED" : ""}
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-fg">
          Multi-sector field survey
        </h2>
        <p className="mt-1 font-mono text-xs text-primary">
          Operative: {character?.rank} {character?.name} · {character?.loadout}
        </p>
        <p className="mt-1 font-mono text-[10px] text-dim">
          Ceiling: {spoiler}
          {pending ? ` · spawn mark: ${pending}` : ""}
        </p>

        <p className="mt-6 text-sm leading-relaxed text-muted">
          You drop inside the wire. Colony staff are on shift and they talk —
          leave the gate carrying something you were told, not something you
          guessed.
        </p>
        <p className="mt-3 font-mono text-xs leading-relaxed text-muted">
          <strong className="text-fg">WASD</strong> move ·{" "}
          <strong className="text-fg">E</strong> interact ·{" "}
          <strong className="text-fg">Q</strong> scan
        </p>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-dim">
          REMAINING PROCEDURE IS ISSUED IN THE FIELD, WHERE IT APPLIES · ESC
          LISTS THE FULL KEYMAP
        </p>

        <p className="mt-6 font-mono text-[10px] tracking-widest text-muted">
          STANDING TASKS
        </p>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
          {preview.map((o) => (
            <li key={o.id}>· {o.title}</li>
          ))}
          {rest > 0 && <li className="text-dim">· {rest} more on the sheet.</li>}
          {open.length === 0 && (
            <li className="text-dim">
              · Sheet is clear. Walk it again or seal the log.
            </li>
          )}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              getAudio().resume();
              startMission();
            }}
            className="min-h-11 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-fg transition hover:bg-primary-glow active:scale-[0.98]"
          >
            Deploy to surface
          </button>
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-md border border-border px-5 py-2.5 text-sm text-muted hover:border-muted hover:text-fg"
          >
            Change operative
          </button>
        </div>
      </div>
    </div>
  );
}
