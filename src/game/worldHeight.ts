/**
 * The shared height field. Player, creatures, props, markers and every terrain
 * vertex read the ground from here, so this file alone decides where the
 * world's surface is.
 *
 * The base is six octaves of seeded simplex noise under a mild domain warp.
 * Every hand-authored feature — the colony pad, the Ridge-7 gaussian, the
 * southward rise, the coast drop — is a mask applied on top of that base, so
 * the authored layout survives a change to the noise and every placed
 * coordinate keeps the ground it was placed for.
 *
 * Determinism is a hard requirement: the golden-screenshot suite and every
 * seeded scatter in the scene assume the same (x, z) yields the same height on
 * every machine. The permutation table is therefore built from a fixed seed
 * with integer arithmetic, and the noise uses no transcendental functions.
 *
 * This is hot — several calls per frame per creature, one per terrain vertex.
 * Nothing here allocates, and the loops avoid Math.pow and Math.hypot.
 */

/**
 * Fisher-Yates over a fixed seed, doubled so the noise can index without
 * masking twice. The seed is not arbitrary: it was chosen so the authored
 * coordinates land on ground that plays — the Ridge-7 cache and beacon sit at
 * slope 0.50 and 0.54, just under SLIDE_SLOPE, while the ridge midsection
 * still passes it.
 */
const PERM = ((): Uint8Array => {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 2718281;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  p.copyWithin(256, 0, 256);
  return p;
})();

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const D = Math.SQRT1_2;
/** Eight unit-length gradients; unit length is what makes NOISE_SCALE hold. */
const GRAD = new Float32Array([
  1, 0, -1, 0, 0, 1, 0, -1, D, D, -D, D, D, -D, -D, -D,
]);
/** Measured reciprocal of the peak amplitude, so noise2 lands in ~[-1, 1]. */
const NOISE_SCALE = 99.2;

/** 2-D simplex noise. Deterministic, allocation-free, ~150 ns. */
function noise2(x: number, y: number): number {
  const skew = (x + y) * F2;
  const i = Math.floor(x + skew);
  const j = Math.floor(y + skew);
  const unskew = (i + j) * G2;
  const x0 = x - (i - unskew);
  const y0 = y - (j - unskew);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;

  let n = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    const g = (PERM[ii + PERM[jj]] & 7) << 1;
    t0 *= t0;
    n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    const g = (PERM[ii + i1 + PERM[jj + j1]] & 7) << 1;
    t1 *= t1;
    n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    const g = (PERM[ii + 1 + PERM[jj + 1]] & 7) << 1;
    t2 *= t2;
    n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2);
  }
  return n * NOISE_SCALE;
}

/**
 * Amplitude and gain are what keep the world walkable. Each octave of a
 * lacunarity-2 stack contributes roughly the same gradient, so a gain much
 * above 0.44 tips ordinary hillsides past SLIDE_SLOPE and the operative skids
 * everywhere. Measured: 99.96% of the playable area sits under slope 0.5.
 */
const FBM_AMPLITUDE = 9;
const FBM_FREQUENCY = 1 / 380;
const FBM_LACUNARITY = 2.15;
const FBM_GAIN = 0.44;
const FBM_OCTAVES = 6;
/** Domain warp: bends the ridgelines off the noise lattice's own diagonals. */
const WARP_FREQUENCY = 1 / 230;
const WARP_AMPLITUDE = 26;

function fbm(x: number, z: number): number {
  const wx = x + noise2(x * WARP_FREQUENCY + 3.1, z * WARP_FREQUENCY - 7.4) * WARP_AMPLITUDE;
  const wz = z + noise2(x * WARP_FREQUENCY - 5.7, z * WARP_FREQUENCY + 2.9) * WARP_AMPLITUDE;
  let amplitude = FBM_AMPLITUDE;
  let frequency = FBM_FREQUENCY;
  let sum = 0;
  for (let o = 0; o < FBM_OCTAVES; o++) {
    sum += amplitude * noise2(wx * frequency, wz * frequency);
    frequency *= FBM_LACUNARITY;
    amplitude *= FBM_GAIN;
  }
  return sum;
}

/* ---------------------------------------------------------------------- */
/* Hand-authored masks. Every constant here is world layout — the domes,    */
/* spawns, caches and NPCs were placed against these and must not move.     */
/* ---------------------------------------------------------------------- */

const COLONY_X = 0;
const COLONY_Z = 10;
/** Graded pad: dead flat, and wide enough to hold the 52-unit landing disc. */
const COLONY_FLAT_R = 56;
const COLONY_BLEND_R = 94;
/** The pad's altitude. Every colony prop was authored against this value. */
export const COLONY_Y = 0.15;

const RIDGE_X = -105;
const RIDGE_Z = 50;
const RIDGE_LENGTH = 70;
const RIDGE_REACH = 95;

const SOUTH_RISE_Z = 100;

/**
 * The shoreline is authored, not emergent.
 *
 * Letting the noise decide where the sea met the land put the Kaguyahime
 * memorial and the coast cache — a named objective and a lootable site the
 * player has to walk to — nearly a metre under water. Between SHORE_Z0 and
 * SHORE_Z1 the terrain is blended toward a flat beach shelf a little above
 * SEA_LEVEL, so those sites are guaranteed dry land whatever the noise does;
 * past SHORE_Z1 it falls away into the seabed.
 */
const SHORE_Z0 = 168;
const SHORE_Z1 = 208;
const SHORE_Y = -0.3;
const SEABED_SLOPE = 0.16;
const SEABED_MAX_DROP = 9;
/** How much of the natural surface survives into the shelf. See sampleHeight. */
const SHORE_BLEND_MAX = 0.86;
/**
 * Noise amplitude falls away over the same run, so the beach is a beach rather
 * than a shelf with hills on it. Tied to SHORE_Z0 rather than given its own
 * number: when the two drifted apart the swell survived into the shallows and
 * ate most of the shelf's clearance above SEA_LEVEL.
 */
const COAST_CALM_Z = SHORE_Z0;

/**
 * Where the water plane sits. Exported so Water.tsx cannot disagree with the
 * ground it is supposed to meet — there is one authority on the waterline and
 * this is it.
 */
export const SEA_LEVEL = -1.6;
/** The south road is graded, not bulldozed — enough that the decal lies flat. */
const ROAD_HALF_WIDTH = 16;
const ROAD_START_Z = 48;
const ROAD_END_Z = 96;

function smooth01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** 0 on the pad, 1 once the natural surface has fully resumed. */
function colonyBlend(x: number, z: number): number {
  const dx = x - COLONY_X;
  const dz = z - COLONY_Z;
  const r = Math.sqrt(dx * dx + dz * dz);
  return smooth01((r - COLONY_FLAT_R) / (COLONY_BLEND_R - COLONY_FLAT_R));
}

/** Ridge-7's two stacked gaussians: the broad shoulder and the sharp spine. */
function ridgeBump(x: number, z: number): number {
  const d = x - RIDGE_X;
  if (d <= -RIDGE_REACH || d >= RIDGE_REACH) return 0;
  const along = 1 - Math.abs(z - RIDGE_Z) / RIDGE_LENGTH;
  if (along <= 0) return 0;
  const d2 = d * d;
  return Math.exp(-d2 / 784) * along * 14 + Math.exp(-d2 / 144) * along * 6;
}

export function sampleHeight(x: number, z: number): number {
  const colonyK = colonyBlend(x, z);
  // The pad is the one place the ground is guaranteed level, and the whole
  // colony — domes, towers, fences, the landing disc — is built on that.
  if (colonyK <= 0) return COLONY_Y;

  let amplitude = 1;
  if (z > COAST_CALM_Z) amplitude *= 1 - 0.6 * smooth01((z - COAST_CALM_Z) / 44);
  const road =
    smooth01((ROAD_HALF_WIDTH - Math.abs(x)) / 8) *
    smooth01((z - ROAD_START_Z) / 14) *
    (1 - smooth01((z - ROAD_END_Z) / 16));
  amplitude *= 1 - 0.45 * road;

  let h = fbm(x, z) * amplitude;
  h += Math.max(0, (z - SOUTH_RISE_Z) / 80) * 1.8;
  h += ridgeBump(x, z);

  if (z > SHORE_Z0) {
    // Capped below 1 deliberately. At a full blend the shelf is exactly
    // SHORE_Y with no noise left in it, which puts the waterline on a dead
    // straight line across the entire map — the one thing a coast must never
    // look like. Leaving a fraction of the terrain in lets the shoreline
    // wander a few metres for free.
    const shoreK = smooth01((z - SHORE_Z0) / (SHORE_Z1 - SHORE_Z0)) * SHORE_BLEND_MAX;
    h = h * (1 - shoreK) + SHORE_Y * shoreK;
    if (z > SHORE_Z1) {
      h -= Math.min(SEABED_MAX_DROP, (z - SHORE_Z1) * SEABED_SLOPE);
    }
  }

  return colonyK < 1 ? COLONY_Y + (h - COLONY_Y) * colonyK : h;
}

/**
 * Terrain weights at a point, summing to 1. Vegetation scatter, terrain
 * splatting and anything else that has to agree with the shape of the ground
 * derives from the same masks sampleHeight uses, so material and planting can
 * never disagree with the surface.
 *
 * `forest` is the default lowland bucket rather than a canopy mask — where the
 * trees actually start is content (WORLD.treelineZ), not terrain.
 */
export type Biome = { colony: number; forest: number; ridge: number; coast: number };

export function sampleBiome(x: number, z: number): Biome {
  const colony = 1 - colonyBlend(x, z);
  const rest = 1 - colony;
  // A little noise on the rock line, or the ridge reads as a painted ellipse.
  const bump = ridgeBump(x, z);
  const ridgeRaw =
    bump <= 0
      ? 0
      : Math.min(1, (bump / 7) * (1 + 0.35 * noise2(x * 0.02, z * 0.02)));
  // The same run the beach shelf is blended over, so the sand the terrain is
  // painted with starts exactly where the ground starts flattening into shore.
  const coastRaw = smooth01((z - SHORE_Z0) / (SHORE_Z1 - SHORE_Z0));
  const coast = rest * coastRaw;
  const ridge = rest * ridgeRaw * (1 - coastRaw);
  const forest = rest * (1 - coastRaw) * (1 - ridgeRaw);
  return { colony, forest, ridge, coast };
}

export function sampleNormal(
  x: number,
  z: number,
): { nx: number; ny: number; nz: number } {
  const e = 0.6;
  const hL = sampleHeight(x - e, z);
  const hR = sampleHeight(x + e, z);
  const hD = sampleHeight(x, z - e);
  const hU = sampleHeight(x, z + e);
  const nx = hL - hR;
  const nz = hD - hU;
  const ny = 2 * e;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { nx: nx / len, ny: ny / len, nz: nz / len };
}

export type SlopeInfo = {
  /** 0 on the flat, 1 on a vertical face. */
  slope: number;
  /** Unit horizontal fall line. Zero-length where the ground is level. */
  dx: number;
  dz: number;
};

/**
 * Steepness at which footing goes.
 *
 * Re-measured against the noise base at 0.8 m resolution: outside Ridge-7 the
 * whole playable area peaks at 0.568 and the colony pad is exactly level, so
 * nothing the player merely walks across can slide. On the ridge 0.6% of the
 * surface passes this, peaking at 0.641 in the midsection — the climb is a
 * fight, and the cache (0.50) and the beacon the survey objective sends the
 * player to (0.54) stay standable.
 */
export const SLIDE_SLOPE = 0.6;

export function slopeInfoAt(x: number, z: number): SlopeInfo {
  const { nx, nz } = sampleNormal(x, z);
  // The normal is unit length, so its horizontal part is sin(incline).
  const h = Math.hypot(nx, nz);
  if (h < 1e-4) return { slope: 0, dx: 0, dz: 0 };
  return { slope: Math.min(1, h), dx: nx / h, dz: nz / h };
}

export function slopeAt(x: number, z: number): number {
  return slopeInfoAt(x, z).slope;
}

/**
 * Travel cost along (mx, mz): straight up a steep face costs most of the
 * speed, the fall line pays a little of it back. Takes a pre-sampled
 * SlopeInfo because the caller needs the fall line anyway.
 */
export function slopeSpeedFactor(
  info: SlopeInfo,
  mx: number,
  mz: number,
): number {
  const len = Math.hypot(mx, mz);
  if (len < 1e-4 || info.slope <= 0) return 1;
  // +1 straight down the fall line, -1 straight up it.
  const along = (info.dx * mx + info.dz * mz) / len;
  if (along >= 0) return 1 + along * info.slope * 0.18;
  return Math.max(0.3, 1 + along * info.slope * 0.6);
}
