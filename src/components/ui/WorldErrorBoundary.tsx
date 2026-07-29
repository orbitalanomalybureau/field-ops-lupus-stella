import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

/**
 * Last line of defence around the 3D world.
 *
 * Two real failure classes end here: a dynamically imported chunk that no
 * longer exists (a tab left open across a redeploy asks for the old hashed
 * filename), and a dev-session module mismatch (two dev-server generations
 * feed one page two React copies, which dies as
 * "Cannot read properties of null (reading 'useMemo')"). Both previously
 * presented as a dead black screen with no way forward.
 *
 * A stale-module failure is fixed by reloading, so the first occurrence
 * reloads automatically — once, guarded per session, so a genuinely broken
 * build cannot reload-loop. The second occurrence shows the diegetic panel.
 */

const RELOAD_GUARD = "fieldops-boundary-reload";

function isStaleModuleError(error: Error): boolean {
  return /Loading chunk|dynamically imported module|Importing a module script|Failed to fetch|reading 'use[A-Z]/.test(
    `${error.name}: ${error.message}`,
  );
}

/**
 * The fault panel. Shared by this boundary and the router's errorComponent so
 * a crash anywhere — a component throw the boundary catches, or something that
 * escapes to the route level — lands on the same diegetic screen instead of
 * the framework's raw "Something went wrong!".
 */
export function SurveyMeshFault({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-5 bg-void px-6 text-center font-mono">
      <p className="text-[10px] tracking-[0.3em] text-danger">
        ODYSSEY COMMAND // FAULT
      </p>
      <p className="text-lg tracking-widest text-fg">SURVEY MESH FAULT</p>
      <p className="max-w-md text-xs leading-relaxed text-muted">
        The ground link dropped mid-stream. Field progress is already on disk —
        autosave runs every thirty seconds and on every discovery.
        Re-establishing the link reloads the terminal and resumes.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded border border-accent/60 px-5 py-2 text-xs tracking-widest text-accent transition-colors hover:border-accent hover:bg-accent/10"
      >
        RE-ESTABLISH LINK
      </button>
      <p className="max-w-md text-[10px] text-dim">
        {error.name}: {error.message}
      </p>
    </div>
  );
}

function reloadClearingGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_GUARD);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/** Router-level errorComponent — the outermost net, themed like the rest. */
export function RouteErrorFault({ error }: { error: Error }) {
  return <SurveyMeshFault error={error} onRetry={reloadClearingGuard} />;
}

type Props = { children: ReactNode };
type State = { error: Error | null };

export class WorldErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[fieldops] world crashed:", error, info.componentStack);
    if (isStaleModuleError(error)) {
      try {
        if (!sessionStorage.getItem(RELOAD_GUARD)) {
          sessionStorage.setItem(RELOAD_GUARD, "1");
          window.location.reload();
        }
      } catch {
        /* storage denied — fall through to the panel */
      }
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <SurveyMeshFault error={this.state.error} onRetry={reloadClearingGuard} />
    );
  }
}
