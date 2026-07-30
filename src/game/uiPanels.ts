/**
 * Escape-key layering between the HUD's panels and the pause menu.
 *
 * PlayerController owns the pause edge, but the HUD owns its panel state
 * (map/codex/objectives are local component state, deliberately — they change
 * at UI frequency and nothing in the world reads them). Escape must close the
 * topmost panel first and only pause when nothing is open; without a shared
 * registry the two window listeners race and Escape stacks the pause dialog
 * on top of an open codex.
 *
 * A module-level closer keeps the ownership: the HUD registers a callback
 * that closes its open panel (returning true) or reports nothing open
 * (returning false); the pause path asks here before pausing. Same pattern as
 * the rest of src/game — module state for cross-tree signals that must not
 * cause renders.
 */

type PanelCloser = () => boolean;

const closers = new Set<PanelCloser>();

/** Register a closer; returns the unregister function for effect cleanup. */
export function registerPanelCloser(fn: PanelCloser): () => void {
  closers.add(fn);
  return () => closers.delete(fn);
}

/**
 * Ask every registered closer to dismiss its topmost open panel. True if any
 * of them closed something — the caller should treat Escape as consumed and
 * NOT pause.
 */
export function closeTopPanel(): boolean {
  let closed = false;
  for (const fn of closers) closed = fn() || closed;
  return closed;
}
