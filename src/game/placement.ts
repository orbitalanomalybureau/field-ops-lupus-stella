/**
 * Relocating the operative from outside the frame loop.
 *
 * PlayerController owns the rig's transform: it seeds from `playerPos` once at
 * mount and writes the store every frame after that. So a store write alone
 * cannot move the player mid-run — the next frame overwrites it with wherever
 * the rig actually is. Fast travel looked like it worked only because the
 * panel was open and the loop was stalled; on resume the operative snapped
 * back.
 *
 * This is the placement contract: the controller registers a placer, and
 * anything that relocates the operative (fast travel, the auto-evac after a
 * flatline) calls `placeOperative`. Callers must STILL write the store — the
 * save blob, the map and the creature sim read it, and the placer is a no-op
 * when no controller is mounted (menus, SSR, the briefing screen).
 *
 * Deliberately not the `__controlsTest` window seam: that is a test-only hook
 * and production paths must not depend on QA scaffolding being installed.
 */

type Placer = (x: number, z: number, yaw?: number) => void;

let placer: Placer | null = null;

/** PlayerController registers here; returns the unregister for effect cleanup. */
export function registerPlacer(fn: Placer): () => void {
  placer = fn;
  return () => {
    if (placer === fn) placer = null;
  };
}

/**
 * Move the mounted operative. Returns false when nothing is mounted, so a
 * caller can tell "deferred to the next mount" from "done".
 */
export function placeOperative(x: number, z: number, yaw?: number): boolean {
  if (!placer) return false;
  placer(x, z, yaw);
  return true;
}
