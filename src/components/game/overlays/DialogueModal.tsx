import { useEffect } from "react";
import { TerminalDialog } from "@/components/ui/TerminalDialog";
import { DIALOGUES, NPCS } from "@/game/data";
import { useGameStore } from "@/game/store";

/** "Digit3" / "Numpad3" → 3, anything else → null. */
function digitOf(code: string): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) : null;
}

const CHIP_ID = "fieldops-comms-chip";

/**
 * Anti-flash threshold. A machine that gets the modal on screen inside this
 * window never sees the chip at all, so nothing blinks on hardware that was
 * never slow; long enough to clear a healthy commit, short enough that a stall
 * still reads as an answer to the keypress rather than a freeze.
 */
const CHIP_DELAY_MS = 200;

/** Set by the modal itself, not by the phase: the chip stands in for a panel. */
let dialogueOnScreen = false;

function hideCommsChip(): void {
  if (typeof document === "undefined") return;
  document.getElementById(CHIP_ID)?.remove();
}

/**
 * Written straight to the DOM rather than rendered, because React is exactly
 * what it is covering for: the phase flip re-renders the whole world tree, and
 * a chip inside that tree would land in the same commit as the modal it is
 * supposed to precede. Body-level and z-39 — above the HUD, under the dialog's
 * own backdrop, so the real panel simply covers it when it arrives.
 */
function showCommsChip(): void {
  if (typeof document === "undefined" || document.getElementById(CHIP_ID)) {
    return;
  }
  const chip = document.createElement("div");
  chip.id = CHIP_ID;
  chip.setAttribute("role", "status");
  chip.textContent = "COMMS…";
  // Never focusable and never clickable: the modal takes focus on mount and
  // this must not be in its way.
  chip.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:14%",
    "transform:translateX(-50%)",
    "z-index:39",
    "pointer-events:none",
    "padding:0.5rem 1rem",
    "border:1px solid var(--color-border)",
    "border-radius:var(--radius)",
    "background:rgb(10 12 18 / 0.9)",
    "color:var(--color-accent)",
    "font-family:var(--font-mono)",
    "font-size:11px",
    "letter-spacing:0.25em",
  ].join(";");
  document.body.appendChild(chip);
}

/**
 * Mounted for the whole run, so it is already listening when the phase flips.
 * Store listeners fire synchronously inside set(), which is what puts the chip
 * ahead of the render it is hiding.
 */
export function CommsPlaceholder() {
  useEffect(() => {
    let timer = 0;
    const stop = () => {
      window.clearTimeout(timer);
      timer = 0;
      hideCommsChip();
    };
    const unsubscribe = useGameStore.subscribe((s, prev) => {
      if (s.phase === prev.phase) return;
      if (s.phase !== "dialogue") {
        stop();
        return;
      }
      timer = window.setTimeout(() => {
        if (!dialogueOnScreen) showCommsChip();
      }, CHIP_DELAY_MS);
    });
    return () => {
      unsubscribe();
      stop();
    };
  }, []);

  return null;
}

export function DialogueModal() {
  const npcId = useGameStore((s) => s.dialogueNpcId);
  const nodeId = useGameStore((s) => s.dialogueNode);
  const choose = useGameStore((s) => s.chooseDialogue);
  const close = useGameStore((s) => s.closeDialogue);
  const visibleChoices = useGameStore((s) => s.visibleChoices);
  // Choice conditions read flags and inventory; subscribing to both keeps the
  // rendered list honest when an effect on this very node changes what
  // qualifies (a trade that spends the last quill hides the trade).
  useGameStore((s) => s.flags);
  useGameStore((s) => s.inventory);

  const open = Boolean(npcId && nodeId);

  // Clears the stand-in the moment the panel itself is committed — the chip
  // covers the wait for THIS render, not merely for the phase flip.
  useEffect(() => {
    if (!open) return;
    dialogueOnScreen = true;
    hideCommsChip();
    return () => {
      dialogueOnScreen = false;
    };
  }, [open]);

  // Number keys pick from the VISIBLE list, matching the rendered ordinals —
  // not from node.choices, where hidden entries would shift every hotkey.
  // Read through getState so the handler never closes over a stale list.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = digitOf(e.code);
      if (n === null) return;
      const picked = useGameStore.getState().visibleChoices()[n - 1];
      if (!picked) return;
      e.stopPropagation();
      useGameStore.getState().chooseDialogue(picked.index);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!npcId || !nodeId) return null;
  const npc = NPCS.find((n) => n.id === npcId);
  const tree = npc ? DIALOGUES[npc.dialogueId] : null;
  const node = tree?.nodes[nodeId];
  if (!npc || !node) return null;

  // Condition-gated trades render exactly like plain lines — the fiction
  // carries the gate; a differently-styled button would flag it as a shop.
  const choices = visibleChoices();
  const isEnd = choices.length === 0;

  return (
    <TerminalDialog
      title={`Comms — ${npc.name}`}
      onClose={close}
      // Choice indexes too, not just the node: a `once` line or a trade can
      // loop back to the SAME node with the clicked button gone.
      focusKey={`${nodeId}·${choices.map((c) => c.index).join(".")}`}
      className="flex max-h-[85vh] max-w-lg flex-col"
    >
      <div className="flex shrink-0 items-start justify-between gap-3">
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

      {/* The line and its choices scroll together: a long node on a short
          landscape phone must never push the choices off-screen. */}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <p className="text-sm leading-relaxed text-muted">{node.text}</p>

        <div className="mt-5 space-y-2">
        {isEnd ? (
          <button
            type="button"
            onClick={close}
            className="min-h-11 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-void hover:bg-primary-glow"
          >
            End conversation
          </button>
        ) : (
          choices.map((c, i) => (
            <button
              key={`${c.index}-${c.label}`}
              type="button"
              onClick={() => choose(c.index)}
              className="flex min-h-11 w-full items-baseline gap-2.5 rounded-md border border-border bg-surface/60 px-4 py-2.5 text-left text-sm text-fg transition hover:border-accent/50 hover:bg-surface-elevated"
            >
              <span
                aria-hidden="true"
                className="shrink-0 font-mono text-[11px] text-dim"
              >
                {i < 9 ? i + 1 : "·"}
              </span>
              <span>{c.label}</span>
            </button>
          ))
        )}
        </div>
      </div>
    </TerminalDialog>
  );
}
