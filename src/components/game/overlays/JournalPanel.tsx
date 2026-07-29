import { useGameStore } from "@/game/store";

export function JournalPanel() {
  const journal = useGameStore((s) => s.journal);
  const close = useGameStore((s) => s.closeOverlay);
  const exportJournal = useGameStore((s) => s.exportJournal);
  const character = useGameStore((s) => s.getCharacter());
  const discoveries = useGameStore((s) => s.discoveries);

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
      useGameStore.getState().pushMessage("JOURNAL — copied to clipboard");
    } catch {
      download();
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-void/80 px-3 backdrop-blur-sm">
      <div className="panel-glass flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg p-5 sm:p-6">
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
                className="rounded-md border border-border bg-surface/40 p-3"
              >
                <p className="font-mono text-[10px] text-dim">
                  {new Date(j.t).toLocaleString()} · {j.x.toFixed(0)},
                  {j.z.toFixed(0)}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-fg">{j.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {j.body}
                </p>
              </article>
            ))
          )}
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
      </div>
    </div>
  );
}
