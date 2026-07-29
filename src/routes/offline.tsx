import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/offline")({
  component: OfflinePage,
  head: () => ({
    meta: [{ title: "Offline — Field Ops: Lupus Stella" }],
  }),
});

/**
 * Served by the service worker when a navigation fails and no cached shell is
 * available. Kept in the terminal fiction so losing connectivity reads as part
 * of the world rather than as a browser error page.
 */
function OfflinePage() {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-6 bg-void px-6 text-center font-mono text-fg">
      <div className="text-[10px] tracking-[0.3em] text-primary">
        ODYSSEY COMMAND // LINK STATUS
      </div>
      <div className="text-lg tracking-widest">CARRIER LOST</div>
      <p className="max-w-md text-xs leading-relaxed text-muted">
        The survey mesh is unreachable from this terminal. Cached field data
        remains available offline; live command traffic resumes when the link is
        restored.
      </p>
      <Link
        to="/"
        className="min-h-11 rounded border border-border px-5 py-2 text-xs tracking-widest text-accent transition-colors hover:border-accent hover:text-fg"
      >
        RETRY LINK
      </Link>
      <div className="text-[10px] text-dim">
        The dead do not correct the living.
      </div>
    </div>
  );
}
