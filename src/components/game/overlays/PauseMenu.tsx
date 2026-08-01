import { useMemo } from "react";
import { ArmedButton } from "@/components/ui/ArmedButton";
import { TerminalDialog } from "@/components/ui/TerminalDialog";
import { useGameStore } from "@/game/store";
import { visibleObjectivesOf } from "@/game/selectors";

export function PauseMenu() {
  const togglePause = useGameStore((s) => s.togglePause);
  const reset = useGameStore((s) => s.reset);
  const character = useGameStore((s) => s.getCharacter());
  const objectivesRaw = useGameStore((s) => s.objectives);
  const revealed = useGameStore((s) => s.revealedObjectives);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const openJournal = useGameStore((s) => s.openJournal);
  const togglePhoto = useGameStore((s) => s.togglePhotoMode);

  const objectives = useMemo(
    () => visibleObjectivesOf(objectivesRaw, revealed, spoiler),
    [objectivesRaw, revealed, spoiler],
  );
  const done = objectives.filter((o) => o.done).length;

  return (
    <TerminalDialog title="Paused" eyebrow="SYSTEMS HOLD" onClose={togglePause}>
      <h2 className="mt-2 text-2xl font-semibold text-fg">Paused</h2>
      <p className="mt-1 text-sm text-muted">
        {character?.name} · {done}/{objectives.length} objectives
      </p>
      <div className="mt-6 space-y-2">
        <button
          type="button"
          onClick={togglePause}
          className="min-h-11 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-void hover:bg-primary-glow"
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
        <ArmedButton
          idleLabel="Abort / change operative"
          armedLabel="CONFIRM — SEALS AND ERASES FIELD LOG"
          consequence="PROGRESS IS NOT RECOVERABLE"
          onConfirm={reset}
          className="min-h-11 w-full rounded-md border px-4 py-2.5"
          idleClassName="border-border text-sm text-muted hover:text-fg"
          armedClassName="border-danger bg-danger/15 font-mono text-[11px] tracking-wide text-danger"
          hintClassName="font-mono text-[10px] text-dim"
        />
      </div>
      <p className="mt-5 font-mono text-[10px] leading-relaxed text-dim">
        WASD · Q scan · E interact · F combat · J journal · P photo · M map · C
        codex · Tab objectives · K settings (full list) · Esc pause
      </p>
    </TerminalDialog>
  );
}
