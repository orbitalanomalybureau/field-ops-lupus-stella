import type * as THREE from "three";

/**
 * Hand-off point for the god-rays light source: DayNight owns and animates the
 * sun-source mesh, PostFX feeds it to the postprocessing GodRays effect.
 *
 * A module handle in the style of `atmosphere.ts` rather than store state —
 * a THREE.Mesh must never sit in the Zustand store (it would be dragged through
 * persistence and devtools serialization). Unlike `atmosphere`, this one needs
 * a subscription: React renders PostFX before DayNight's refs attach, so PostFX
 * has to be told when the mesh appears, and `useSyncExternalStore` needs a
 * subscribe/snapshot pair. Type-only three import keeps the module SSR-inert.
 */

type Listener = () => void;

let mesh: THREE.Mesh | null = null;
const listeners = new Set<Listener>();

/** Written by DayNight's ref callback; null again when the tier drops it. */
export function setGodRaySource(next: THREE.Mesh | null): void {
  if (mesh === next) return;
  mesh = next;
  for (const listener of listeners) listener();
}

export function getGodRaySource(): THREE.Mesh | null {
  return mesh;
}

export function subscribeGodRaySource(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
