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
