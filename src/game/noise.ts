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
 *
 * The decay runs on SIM time, not wall time: Creatures' frame loop advances
 * it through tickNoise() with the same clamped, hit-stopped delta the rest of
 * combat uses, so a slow device cannot fade a spike faster than the action it
 * belongs to, and a shot fired into a pause is still ringing on resume.
 */

/** Seconds for the level to fall to 1/e. Shots stay audible ~a quarter minute. */
const TAU = 6;

let level = 0;

/** Report a noise event, 0..1 — a pulse-rifle discharge is ~0.6. Additive, capped. */
export function reportNoise(amount: number): void {
  level = Math.min(1, level + Math.max(0, amount));
}

/** Advance the decay by one sim step. Creatures owns the single call site. */
export function tickNoise(dt: number): void {
  if (dt <= 0 || level === 0) return;
  level *= Math.exp(-dt / TAU);
  if (level < 0.001) level = 0;
}

/** Current decayed loudness, 0..1. Cheap; callable per frame. */
export function noiseLevel(): number {
  return level;
}

/** Fresh-run hygiene: called on mission start/reset so noise never leaks runs. */
export function resetNoise(): void {
  level = 0;
}
