/** Shared height field so player, creatures, and markers sit on the same ground. */
export function sampleHeight(x: number, z: number): number {
  const colony = Math.hypot(x, z - 10);
  const plateau = smoothNear(colony, 58, 42) * 0.15;

  const h =
    Math.sin(x * 0.035) * Math.cos(z * 0.028) * 1.1 +
    Math.sin(x * 0.09 + z * 0.04) * 0.55 +
    Math.cos(z * 0.07) * 0.4 +
    Math.sin((x + z) * 0.02) * 0.8;

  const ridgeSouth = Math.max(0, (z - 100) / 80) * 1.8;

  // Ridge-7 west
  const ridgeX = -105;
  const ridgeDist = Math.abs(x - ridgeX);
  const alongRidge = Math.max(0, 1 - Math.abs(z - 50) / 70);
  const ridge7 =
    Math.exp(-((ridgeDist * ridgeDist) / (28 * 28))) * alongRidge * 14 +
    Math.exp(-((ridgeDist * ridgeDist) / (12 * 12))) * alongRidge * 6;

  // Coast drop south of z~190
  const coastDrop = z > 185 ? -Math.min(6, (z - 185) * 0.12) : 0;

  if (colony < 50) {
    const t = 1 - colony / 50;
    return h * (1 - t * t) * 0.25 + plateau;
  }

  return h + ridgeSouth + ridge7 + plateau + coastDrop;
}

function smoothNear(dist: number, outer: number, inner: number) {
  const t = Math.max(0, Math.min(1, (outer - dist) / (outer - inner)));
  return t * t * (3 - 2 * t);
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
 * Steepness at which footing goes. Ridge-7's midsection peaks near 0.65 and
 * the beacon flank sits around 0.55, so this turns the climb into a fight
 * without sealing off the overlook the survey objective sends the player to.
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
