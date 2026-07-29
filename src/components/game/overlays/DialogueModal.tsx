import { DIALOGUES, NPCS } from "@/game/data";
import { useGameStore } from "@/game/store";

export function DialogueModal() {
  const npcId = useGameStore((s) => s.dialogueNpcId);
  const nodeId = useGameStore((s) => s.dialogueNode);
  const choose = useGameStore((s) => s.chooseDialogue);
  const close = useGameStore((s) => s.closeDialogue);

  if (!npcId || !nodeId) return null;
  const npc = NPCS.find((n) => n.id === npcId);
  const tree = npc ? DIALOGUES[npc.dialogueId] : null;
  const node = tree?.nodes[nodeId];
  if (!npc || !node) return null;

  const choices = node.choices ?? [];
  const isEnd = choices.length === 0;

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-void/50 px-3 pb-6 pt-20 backdrop-blur-[2px] sm:items-center sm:pb-0">
      <div className="panel-glass w-full max-w-lg rounded-lg p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] text-accent">
              COMMS · LOCAL
            </p>
            <h2 className="mt-1 text-lg font-semibold text-fg">{npc.name}</h2>
            <p className="font-mono text-xs text-dim">{npc.role}</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="min-h-10 rounded-md border border-border px-3 font-mono text-xs text-muted hover:text-fg"
          >
            Close
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted">{node.text}</p>

        <div className="mt-5 space-y-2">
          {isEnd ? (
            <button
              type="button"
              onClick={close}
              className="min-h-11 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-fg hover:bg-primary-glow"
            >
              End conversation
            </button>
          ) : (
            choices.map((c, i) => (
              <button
                key={c.label}
                type="button"
                onClick={() => choose(i)}
                className="min-h-11 w-full rounded-md border border-border bg-surface/60 px-4 py-2.5 text-left text-sm text-fg transition hover:border-accent/50 hover:bg-surface-elevated"
              >
                {c.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
