import * as THREE from "three";

/**
 * Game-feel transients: camera impulses, hit-stop, the avatar's attack-pose
 * window, and the aim telemetry event the HUD reticle listens to.
 *
 * A module, not store state — these change at impact frequency and nothing
 * should re-render for them. PlayerController consumes the camera kick each
 * frame; combat code calls kick()/hitStop()/flashAttackPose(); the HUD
 * subscribes to AIM_EVENT at the emitter's cadence (~10 Hz), never per frame.
 */

/** Window event carrying aim/ammo state to the reticle. */
export const AIM_EVENT = "fieldops:aim";

export type AimTelemetry = {
  aiming: boolean;
  /** Charged bolts and capacity, for the cell pips. */
  cells: number;
  maxCells: number;
  /** A live predator sits inside the assist cone — reticle goes hot. */
  hot: boolean;
  /** Monotonic counters; the reticle animates on change. */
  hits: number;
  kills: number;
  /**
   * Monotonic dry-fire counter. The trigger pulled on empty cells is
   * audio-only otherwise; the reticle flashes on change so muted and
   * hard-of-hearing players get the same refusal.
   */
  dry: number;
  /**
   * Fill fraction (0..1) of the cell currently recharging, 0 when nothing is
   * charging. Lets the pips show the 1.4 s/cell cadence instead of snapping
   * empty→full.
   */
  recharge: number;
};

export function emitAim(t: AimTelemetry): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AimTelemetry>(AIM_EVENT, { detail: t }));
}

/* ------------------------------ camera kick ------------------------------ */

const kickVel = new THREE.Vector2();
const kickOff = new THREE.Vector2();
/** Spring constants tuned for a ~120 ms settle. */
const STIFFNESS = 180;
const DAMPING = 16;

/**
 * Punch the camera. `bearing` (radians, world yaw) aims the shove — damage
 * from the left shoves right — otherwise it kicks back toward the camera.
 */
export function kick(strength: number, bearing?: number): void {
  const s = Math.min(1, Math.max(0, strength));
  if (bearing === undefined) {
    kickVel.y -= s * 3.2;
  } else {
    kickVel.x += Math.cos(bearing) * s * 2.6;
    kickVel.y += Math.sin(bearing) * s * 2.6;
  }
}

/**
 * Integrate and return the current offset in metres (x = camera-right,
 * y = camera-forward). Call once per frame from the camera owner with clamped
 * delta; the spring pulls the offset back to zero.
 */
export function consumeKick(dt: number, out: { x: number; y: number }): void {
  kickVel.x += (-kickOff.x * STIFFNESS - kickVel.x * DAMPING) * dt;
  kickVel.y += (-kickOff.y * STIFFNESS - kickVel.y * DAMPING) * dt;
  kickOff.x += kickVel.x * dt;
  kickOff.y += kickVel.y * dt;
  out.x = kickOff.x * 0.05;
  out.y = kickOff.y * 0.05;
}

/* -------------------------------- hit-stop -------------------------------- */

let stopUntil = 0;

/** Freeze simulation deltas briefly — the kill-confirm grammar. ~70 ms. */
export function hitStop(ms = 70): void {
  const t = typeof performance !== "undefined" ? performance.now() : 0;
  stopUntil = Math.max(stopUntil, t + ms);
}

/** Scale a frame delta through any active hit-stop. */
export function throughHitStop(delta: number): number {
  const t = typeof performance !== "undefined" ? performance.now() : 0;
  return t < stopUntil ? 0 : delta;
}

/* ------------------------------ attack pose ------------------------------ */

let poseUntil = 0;

/** Hold the avatar's strike pose for the swing window. */
export function flashAttackPose(ms = 220): void {
  const t = typeof performance !== "undefined" ? performance.now() : 0;
  poseUntil = Math.max(poseUntil, t + ms);
}

export function attackPoseActive(): boolean {
  const t = typeof performance !== "undefined" ? performance.now() : 0;
  return t < poseUntil;
}

/* --------------------------- last-hit direction --------------------------- */

let hitBearing: number | null = null;
let hitAt = 0;

/** World bearing (radians) the last damage came FROM. Read by the HUD arc. */
export function reportHitFrom(bearing: number): void {
  hitBearing = bearing;
  hitAt = typeof performance !== "undefined" ? performance.now() : 0;
}

export function lastHitFrom(): { bearing: number; ageMs: number } | null {
  if (hitBearing === null) return null;
  const t = typeof performance !== "undefined" ? performance.now() : 0;
  return { bearing: hitBearing, ageMs: t - hitAt };
}
