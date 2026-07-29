import { useGameStore } from "@/game/store";
import { getAudio } from "@/game/audio";

export function Briefing() {
  const character = useGameStore((s) => s.getCharacter());
  const startMission = useGameStore((s) => s.startMission);
  const reset = useGameStore((s) => s.reset);
  const embed = useGameStore((s) => s.embedMode);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const pending = useGameStore((s) => s.pendingSpawn);

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

        <ul className="mt-6 space-y-2.5 text-sm leading-relaxed text-muted">
          <li>· Talk to colony staff; enter command dome for ops board.</li>
          <li>· South perimeter, collars, ferns, optional fauna notes.</li>
          <li>
            · <strong className="text-fg">Q</strong> scan ·{" "}
            <strong className="text-fg">J</strong> journal ·{" "}
            <strong className="text-fg">P</strong> photo ·{" "}
            <strong className="text-fg">K</strong> settings
          </li>
          <li>· West Ridge-7 beacon; weather ion storms carefully.</li>
          {spoiler !== "book1" && (
            <li>· South coast: Kaguyahime memorial (early Book II).</li>
          )}
          <li>· Southern ruin chamber — catalog. Do not broadcast.</li>
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
