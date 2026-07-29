import { useGameStore } from "@/game/store";

export function CompleteScreen() {
  const objectives = useGameStore((s) => s.objectives);
  const character = useGameStore((s) => s.getCharacter());
  const discoveries = useGameStore((s) => s.discoveries);
  const reset = useGameStore((s) => s.reset);
  const setPhase = useGameStore((s) => s.setPhase);
  const done = objectives.filter((o) => o.done).length;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-void px-4">
      <div className="panel-glass w-full max-w-md rounded-lg p-8 text-center">
        <p className="font-mono text-[11px] tracking-[0.3em] text-accent">
          SIM-012 COMPLETE
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-fg">Field log sealed</h2>
        <p className="mt-2 text-sm text-muted">
          {character?.name} · {done}/{objectives.length} objectives ·{" "}
          {discoveries} codex
        </p>
        <p className="mt-6 text-sm leading-relaxed text-muted">
          The survey mesh is archived to the Odyssey training database. Lupus
          Stella is not empty. It is patient. The far continent is already
          listening — and so is the thing that feeds on light.
        </p>
        <p className="mt-4 font-mono text-xs text-dim">
          Book I path complete · Book II ops available later
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => setPhase("playing")}
            className="min-h-11 rounded-md border border-border px-5 py-2.5 text-sm text-muted hover:text-fg"
          >
            Return to surface
          </button>
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-fg hover:bg-primary-glow"
          >
            New operative
          </button>
        </div>
      </div>
    </div>
  );
}
