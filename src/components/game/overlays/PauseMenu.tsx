import { useMemo } from "react";
import { useGameStore } from "@/game/store";

export function PauseMenu() {
  const togglePause = useGameStore((s) => s.togglePause);
  const reset = useGameStore((s) => s.reset);
  const character = useGameStore((s) => s.getCharacter());
  const objectivesRaw = useGameStore((s) => s.objectives);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const openJournal = useGameStore((s) => s.openJournal);
  const togglePhoto = useGameStore((s) => s.togglePhotoMode);

  const objectives = useMemo(
    () => objectivesRaw.filter((o) => !o.book2 || spoiler !== "book1"),
    [objectivesRaw, spoiler],
  );
  const done = objectives.filter((o) => o.done).length;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-void/80 px-4 backdrop-blur-sm">
      <div className="panel-glass w-full max-w-sm rounded-lg p-6">
        <p className="font-mono text-[11px] tracking-[0.3em] text-accent">
          SYSTEMS HOLD
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-fg">Paused</h2>
        <p className="mt-1 text-sm text-muted">
          {character?.name} · {done}/{objectives.length} objectives
        </p>
        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={togglePause}
            className="min-h-11 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-fg hover:bg-primary-glow"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={() => {
              const s = useGameStore.getState();
              useGameStore.setState({
                prevPhase: s.prevPhase ?? "playing",
                phase: "settings",
              });
            }}
            className="min-h-11 w-full rounded-md border border-border px-4 py-2.5 text-sm text-muted hover:text-fg"
          >
            Settings / mission board
          </button>
          <button
            type="button"
            onClick={() => {
              useGameStore.setState({ prevPhase: "playing", phase: "playing" });
              openJournal();
            }}
            className="min-h-11 w-full rounded-md border border-border px-4 py-2.5 text-sm text-muted hover:text-fg"
          >
            Field journal
          </button>
          <button
            type="button"
            onClick={() => {
              useGameStore.setState({ phase: "playing", prevPhase: null });
              togglePhoto();
            }}
            className="min-h-11 w-full rounded-md border border-border px-4 py-2.5 text-sm text-muted hover:text-fg"
          >
            Photo mode
          </button>
          <button
            type="button"
            onClick={reset}
            className="min-h-11 w-full rounded-md border border-border px-4 py-2.5 text-sm text-muted hover:text-fg"
          >
            Abort / change operative
          </button>
        </div>
        <p className="mt-5 font-mono text-[10px] leading-relaxed text-dim">
          WASD · Q scan · E interact · F combat · J journal · P photo · K
          settings · Esc pause
        </p>
      </div>
    </div>
  );
}
