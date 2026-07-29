import { useState } from "react";
import { TerminalDialog } from "@/components/ui/TerminalDialog";
import { useGameStore } from "@/game/store";

export function JournalPanel() {
  const journal = useGameStore((s) => s.journal);
  const close = useGameStore((s) => s.closeOverlay);
  const exportJournal = useGameStore((s) => s.exportJournal);
  const addJournal = useGameStore((s) => s.addJournal);
  const pushMessage = useGameStore((s) => s.pushMessage);
  const character = useGameStore((s) => s.getCharacter());
  const discoveries = useGameStore((s) => s.discoveries);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const download = () => {
    const text = exportJournal();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `field-ops-journal-${character?.callsign ?? "ops"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportJournal());
      pushMessage("JOURNAL — copied to clipboard");
    } catch {
      download();
    }
  };

  const file = () => {
    const text = body.trim();
    if (!text) return;
    // Third arg marks the entry operative-authored: only these count toward
    // the survey's three-entry log requirement — the store enforces it.
    addJournal(title.trim() || "Field note", text, true);
    setTitle("");
    setBody("");
    pushMessage("JOURNAL — note filed");
  };

  const authoredCount = journal.filter((j) => j.authored).length;

  // Keystrokes reach the global input listener, which would queue panel and
  // photo actions to fire the moment the journal closes. Tab and Escape are
  // let through because the dialog shell owns them.
  const holdKeys = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "Escape") return;
    e.stopPropagation();
  };

  return (
    <TerminalDialog
      title="Field journal"
      onClose={close}
      className="flex max-h-[85vh] max-w-lg flex-col"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-accent">
            FIELD JOURNAL
          </p>
          <h2 className="mt-1 text-xl font-semibold text-fg">
            {character?.name ?? "Operative"} · {discoveries} codex
          </h2>
        </div>
        <button
          type="button"
          onClick={close}
          className="min-h-10 rounded-md border border-border px-3 font-mono text-xs text-muted hover:text-fg"
        >
          Close
        </button>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {journal.length === 0 ? (
          <p className="text-sm text-muted">
            No entries yet. Complete objectives and unlock codex to fill the
            log.
          </p>
        ) : (
          journal.map((j) => (
            <article
              key={j.id}
              className={`rounded-md border p-3 ${
                j.authored
                  ? "border-accent/40 bg-accent/5"
                  : "border-border bg-surface/40"
              }`}
            >
              <p className="font-mono text-[10px] text-dim">
                {new Date(j.t).toLocaleString()} · {j.x.toFixed(0)},
                {j.z.toFixed(0)}
                {j.authored ? (
                  <span className="text-accent"> · OPERATIVE AUTHORED</span>
                ) : (
                  " · SYSTEM"
                )}
              </p>
              <h3 className="mt-1 text-sm font-semibold text-fg">{j.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {j.body}
              </p>
            </article>
          ))
        )}
      </div>

      <div className="mt-4 rounded-md border border-border bg-surface/40 p-3">
        <p className="font-mono text-[10px] tracking-widest text-muted">
          NEW ENTRY · STAMPED AT CURRENT POSITION
          {authoredCount < 3 ? ` · FILED ${authoredCount}/3` : ""}
        </p>
        <input
          type="text"
          value={title}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={holdKeys}
          onKeyUp={holdKeys}
          placeholder="Subject line"
          className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-dim"
        />
        <textarea
          value={body}
          rows={3}
          maxLength={600}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={holdKeys}
          onKeyUp={holdKeys}
          placeholder="Observation, bearing, anything the survey should carry."
          className="mt-2 w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-fg placeholder:text-dim"
        />
        <button
          type="button"
          onClick={file}
          disabled={!body.trim()}
          className="mt-2 min-h-11 w-full rounded-md border border-accent/40 bg-accent/15 text-sm font-semibold text-accent hover:bg-accent/25 disabled:border-border disabled:bg-transparent disabled:text-dim"
        >
          File note
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-fg hover:bg-primary-glow"
        >
          Copy log
        </button>
        <button
          type="button"
          onClick={download}
          className="min-h-11 rounded-md border border-border px-4 text-sm text-muted hover:text-fg"
        >
          Download .txt
        </button>
      </div>
    </TerminalDialog>
  );
}
