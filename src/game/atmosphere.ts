import * as THREE from "three";

/**
 * The live atmospheric state, written once per frame by DayNight and read by
 * anything that has to agree with the sky.
 *
 * Fog, water fresnel, and the sky dome all need the same sun direction and the
 * same horizon colour. When each computed its own, they visibly disagreed —
 * the old linear fog (#3a2218) met a flat sky sphere (#8a4020) in a hard seam
 * along the horizon. A plain mutable module rather than store state because
 * this changes every frame and no React component should re-render for it.
 */
export type Atmosphere = {
  /** Unit vector toward the sun. */
  sunDir: THREE.Vector3;
  /** 0 at night, 1 at midday — the same curve that drives light intensity. */
  dayFactor: number;
  /** Colour at the horizon, and at the zenith. */
  horizon: THREE.Color;
  zenith: THREE.Color;
  /** What fog should be tinted, derived from the horizon and the weather. */
  fog: THREE.Color;
  /** Sun tint, for scatter lobes and specular highlights. */
  sunColor: THREE.Color;
  /** 0..1, drives cloud coverage and wave amplitude. */
  storminess: number;
  /** Shared wind vector so grass, canopy and rain drift agree. */
  wind: THREE.Vector2;
};

export const atmosphere: Atmosphere = {
  sunDir: new THREE.Vector3(0.4, 0.8, -0.3).normalize(),
  dayFactor: 0.6,
  horizon: new THREE.Color("#8a4520"),
  zenith: new THREE.Color("#2a1c30"),
  fog: new THREE.Color("#3a2218"),
  sunColor: new THREE.Color("#ffb070"),
  storminess: 0,
  wind: new THREE.Vector2(0.6, 0.35),
};
