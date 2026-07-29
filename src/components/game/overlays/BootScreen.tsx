export function BootScreen() {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-void px-6">
      <div className="w-full max-w-lg font-mono text-sm">
        <p className="mb-6 text-accent tracking-[0.35em] text-xs">
          CLASSIFIED // ODYSSEY COMMAND
        </p>
        <div className="space-y-2 text-muted">
          <p className="text-fg">ODYSSEY TRAINING DATABASE</p>
          <p>SIM-012 · FIELD OPS: LUPUS STELLA</p>
          <p>ACCESS: DANIEL, T. — COLONEL, USSF (RET.)</p>
          <p className="pt-4 text-dim">Loading survey mesh…</p>
          <p className="text-dim">Hydrating EM lattice…</p>
          <p className="text-accent">Link stable.</p>
        </div>
        <div className="mt-10 h-1 w-full overflow-hidden rounded-full bg-surface">
          <div className="h-full w-2/3 animate-pulse bg-accent" />
        </div>
      </div>
    </div>
  );
}
