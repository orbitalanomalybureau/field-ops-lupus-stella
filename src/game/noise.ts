/**
 * The acoustic footprint of the operative — how loud they have recently been.
 *
 * A gunshot cannot write the store's signalMeter: PlayerController recomputes
 * that value every frame from generators/ruin/storm and would erase the spike
 * one frame later. Loudness is therefore a decaying module transient, exactly
 * like the input and impulse modules: PlayerController folds the decayed level
 * into its signal computation, and Creatures reads the same level to widen
 * detection. Never store state — one loud hunt must never be confused with
 * `packsAggroed`, which is the Broadcast ending's permanent world state.
 */

/** Seconds for the level to fall to 1/e. Shots stay audible ~a quarter minute. */
const TAU = 6;

let level = 0;
let lastT = 0;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

function decayTo(t: number): void {
  if (lastT === 0) {
    lastT = t;
    return;
  }
  const dt = (t - lastT) / 1000;
  if (dt > 0) {
    level *= Math.exp(-dt / TAU);
    if (level < 0.001) level = 0;
    lastT = t;
  }
}

/** Report a noise event, 0..1 — a pulse-rifle discharge is ~0.6. Additive, capped. */
export function reportNoise(amount: number): void {
  const t = now();
  decayTo(t);
  level = Math.min(1, level + Math.max(0, amount));
  lastT = t;
}

/** Current decayed loudness, 0..1. Cheap; callable per frame. */
export function noiseLevel(): number {
  decayTo(now());
  return level;
}

/** Fresh-run hygiene: called on mission start/reset so noise never leaks runs. */
export function resetNoise(): void {
  level = 0;
  lastT = 0;
}
