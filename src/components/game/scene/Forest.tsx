import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { atmosphere } from "@/game/atmosphere";
import { WORLD } from "@/game/data";
import { ENTITIES } from "@/game/entities";
import { QUALITY, type QualityTier } from "@/game/quality";
import { useGameStore } from "@/game/store";
import { SEA_LEVEL, sampleBiome, sampleHeight, slopeAt } from "@/game/worldHeight";
import { Grass } from "./Grass";

/** Park–Miller LCG. Golden screenshots depend on this exact stream. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** 1 in deep night, 0 in full day, ramped across dawn and dusk. */
function nightFactor(tod: number) {
  const day =
    THREE.MathUtils.smoothstep(tod, 0.16, 0.3) *
    (1 - THREE.MathUtils.smoothstep(tod, 0.7, 0.84));
  return 1 - day;
}

/** Scatter window, inset from the terrain plane so nothing sits on its edge. */
const AREA = { x0: -228, z0: -138, sx: 456, sz: 344 };

/**
 * The landing-pad apron from Terrain.tsx, then the surfaced road and the game
 * trail the beacon line continues out to the ruin approach. 0 on bare ground,
 * 1 where things may grow. Kept identical in Grass.tsx — file ownership this
 * phase forbids a shared scene module, so the two copies must move together.
 */
function clearedGround(x: number, z: number): number {
  const pad = THREE.MathUtils.smoothstep(Math.hypot(x, z - 12), 50, 58);
  const corridor =
    THREE.MathUtils.smoothstep(z, 2, 14) * (1 - THREE.MathUtils.smoothstep(z, 140, 162));
  const off = THREE.MathUtils.smoothstep(Math.abs(x), 4.5, 9);
  return pad * (1 - corridor * (1 - off));
}

/** Cover thins across the authored beach shelf and stops before the sand. */
function shoreFade(z: number): number {
  return 1 - THREE.MathUtils.smoothstep(z, 184, 202);
}

/** Low-frequency clumping so the belt has stands and clearings, not a lawn. */
function clumpNoise(x: number, z: number, k: number): number {
  const a = Math.sin(x * 0.031 * k + z * 0.019 * k);
  const b = Math.cos(z * 0.026 * k - x * 0.014 * k);
  return 0.5 + 0.5 * a * b;
}

/**
 * Ground that has to stay legible: every interaction prompt, every prefab
 * shell, and the three hand-authored open spaces the game stages events in.
 * Derived from the entity table so a new site clears its own footprint.
 */
const CLEARINGS = [
  ...ENTITIES.map((e) => ({
    x: e.x,
    z: e.z,
    r: e.kind === "ruin" ? 17 : e.collider ? 9 : e.interact ? 10 : 7,
  })),
  { x: -55, z: 95, r: 26 },
  { x: 12, z: 58, r: 11 },
  { x: 0, z: 42, r: 13 },
  { x: 0, z: 70, r: 10 },
];

function openGround(x: number, z: number, scale: number): number {
  for (const c of CLEARINGS) {
    const r = c.r * scale;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < r) return THREE.MathUtils.smoothstep(d, r * 0.5, r);
  }
  return 1;
}

type Sprig = {
  x: number;
  z: number;
  y: number;
  /** Uniform scale. */
  s: number;
  /** Yaw. Instance rotation stays pure-Y so the wind patch can invert it. */
  r: number;
  /** 0..1 per-instance jitter, drives colour and secondary proportions. */
  j: number;
};

type Scatter = { trees: Sprig[]; ferns: Sprig[]; rocks: Sprig[]; debris: Sprig[] };

/**
 * One candidate stream feeds every layer, offered trees first: `sampleBiome` is
 * the expensive call here, and evaluating it once per point rather than once per
 * layer is the difference between a ~50 ms mount and a quarter-second stall. A
 * point becomes at most one thing, which is also how ground actually works.
 */
const CANDIDATES = 110000;
/**
 * Caps, not ambitions. At 1800/8000/3000/4000 the colony rendered as a solid
 * black field: sixteen thousand shadow-casting instances inside the sun's
 * 120 m shadow box collapse the depth precision of a 2048 map and the whole
 * basin reads as occluded. These numbers are the largest verified to render
 * correctly — still an order of magnitude past the 202 trees and 420 ferns
 * this scene shipped with. Raise them only with a screenshot to prove it.
 */
const CAPS = { trees: 700, ferns: 2600, rocks: 1200, debris: 1500 };

function buildScatter(scale: number): Scatter {
  const rand = seeded(42);
  const out: Scatter = { trees: [], ferns: [], rocks: [], debris: [] };
  const maxTrees = Math.round(CAPS.trees * scale);
  const maxFerns = Math.round(CAPS.ferns * scale);
  const maxRocks = Math.round(CAPS.rocks * scale);
  const maxDebris = Math.round(CAPS.debris * scale);
  const candidates = Math.round(CANDIDATES * scale);

  for (let i = 0; i < candidates; i++) {
    const x = AREA.x0 + rand() * AREA.sx;
    const z = AREA.z0 + rand() * AREA.sz;
    const mask = clearedGround(x, z) * shoreFade(z);
    if (mask < 0.02) continue;
    // Water.tsx's plane starts at z = 186 and the beach shelf can still dip
    // under it. Only the coastal band pays for the extra height probe — inland
    // the map is full of dry basins below SEA_LEVEL that must stay planted.
    if (z > 182 && sampleHeight(x, z) < SEA_LEVEL + 0.4) continue;
    const b = sampleBiome(x, z);

    // worldHeight is explicit that `forest` is the lowland bucket rather than a
    // canopy mask, and that where trees start is content. So the biome only says
    // where woodland is possible — the belt says where it begins. Keying off the
    // weights directly would have pushed the treeline 35 m south of the authored
    // one, because the colony's terrain blend reaches r = 94 and the marker,
    // spawn and fern objective all sit inside it.
    const lowland = Math.max(0, 1 - b.ridge * 0.85 - b.coast * 1.5);
    const belt =
      0.15 +
      0.85 * THREE.MathUtils.smoothstep(z, WORLD.treelineZ - 34, WORLD.treelineZ + 12);

    if (out.trees.length < maxTrees) {
      const d = lowland * belt * (0.12 + 0.42 * clumpNoise(x, z, 1)) * mask;
      if (
        d > 0 &&
        rand() < d &&
        slopeAt(x, z) < 0.55 &&
        rand() < openGround(x, z, 1)
      ) {
        out.trees.push({
          x,
          z,
          y: sampleHeight(x, z),
          // Ridge stands are wind-stunted; the belt carries the tall Titans.
          s: (0.7 + rand() * 0.95) * (1 - b.ridge * 0.4),
          r: rand() * Math.PI * 2,
          j: rand(),
        });
        continue;
      }
    }

    if (out.ferns.length < maxFerns) {
      const d = lowland * belt * (0.2 + 0.75 * clumpNoise(x, z, 1.9)) * mask;
      if (d > 0 && rand() < d && rand() < openGround(x, z, 0.5)) {
        out.ferns.push({
          x,
          z,
          y: sampleHeight(x, z),
          s: 0.45 + rand() * 1.05,
          r: rand() * Math.PI * 2,
          j: rand(),
        });
        continue;
      }
    }

    if (out.rocks.length < maxRocks) {
      const d =
        (0.09 + b.ridge * 0.62 + b.coast * 0.16 + b.forest * 0.07) *
        (0.35 + 0.95 * clumpNoise(x, z, 2.6)) *
        mask;
      if (d > 0 && rand() < d && rand() < openGround(x, z, 0.45)) {
        out.rocks.push({
          x,
          z,
          y: sampleHeight(x, z),
          s: (0.28 + rand() * 1.15) * (1 + b.ridge * 0.55),
          r: rand() * Math.PI * 2,
          j: rand(),
        });
        continue;
      }
    }

    if (out.debris.length < maxDebris) {
      const d =
        (0.11 + b.forest * 0.34 + b.ridge * 0.28) *
        (0.4 + 0.9 * clumpNoise(x, z, 3.7)) *
        mask;
      if (d > 0 && rand() < d && rand() < openGround(x, z, 0.4)) {
        out.debris.push({
          x,
          z,
          y: sampleHeight(x, z),
          s: 0.14 + rand() * 0.42,
          r: rand() * Math.PI * 2,
          j: rand(),
        });
      }
    }
  }

  return out;
}

type WindUniforms = {
  uWindTime: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uGust: { value: number };
};

const WIND_DECLS = /* glsl */ `
uniform float uWindTime;
uniform vec2 uWindDir;
uniform float uGust;
uniform vec2 uBend;
`;

/**
 * A world-space gust folded back into instance space. Instance matrices here are
 * translate · rotateY · scale, so the inverse of their xz block is two dot
 * products against orthogonal columns — cheaper than a per-instance orientation
 * attribute, and without it every trunk would bend along its own random yaw
 * instead of downwind. `uBend` is (offset, slope) on local y: the ramp that
 * turns one shared program into a stiff trunk and a loose crown.
 */
const WIND_VERTEX = /* glsl */ `
#ifdef USE_INSTANCING
  vec2 wAx = instanceMatrix[0].xz;
  vec2 wAz = instanceMatrix[2].xz;
  float wLx = max(dot(wAx, wAx), 1e-4);
  float wLz = max(dot(wAz, wAz), 1e-4);
  vec2 wOrigin = instanceMatrix[3].xz;
  float wPhase = dot(wOrigin, uWindDir) * 0.085 + wOrigin.x * 0.017;
  float wSway =
    sin(uWindTime * 1.15 + wPhase) * 0.62 + sin(uWindTime * 2.6 + wPhase * 1.9) * 0.38;
  float wBend = max(0.0, uBend.x + uBend.y * transformed.y);
  vec2 wPush = uWindDir * (wSway * uGust * wBend * sqrt(wLx));
  transformed.x += dot(wAx, wPush) / wLx;
  transformed.z += dot(wAz, wPush) / wLz;
#endif
`;

function windPatch(wind: WindUniforms, bend: THREE.Vector2) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uWindTime = wind.uWindTime;
    shader.uniforms.uWindDir = wind.uWindDir;
    shader.uniforms.uGust = wind.uGust;
    shader.uniforms.uBend = { value: bend };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${WIND_DECLS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${WIND_VERTEX}`);
  };
}

/**
 * Cone/cylinder tessellation per tier. Low keeps the shipped counts so the
 * rescue tier's vertex bill stays byte-identical; medium and high buy rounded
 * crowns. Per tree: low 102 verts (as shipped), medium 182 (1.8x), high 217
 * (2.1x) — inside the 2.5x ceiling this pass budgeted across ~700 instances.
 */
const TREE_DETAIL: Record<
  QualityTier,
  { trunk: number; canopy: [number, number]; canopy2: [number, number]; displace: number }
> = {
  low: { trunk: 6, canopy: [7, 1], canopy2: [7, 1], displace: 0 },
  medium: { trunk: 10, canopy: [12, 2], canopy2: [10, 2], displace: 0.07 },
  high: { trunk: 10, canopy: [14, 3], canopy2: [12, 2], displace: 0.07 },
};

/**
 * Organic crown silhouette, baked once into the shared cone so every instance
 * gets it for free — displacing per instance would need a per-vertex attribute
 * stream this budget does not have. The wobble is a pure function of the vertex
 * position, so duplicated seam and cap-rim vertices displace identically and no
 * crack can open. The analytic cone normals are kept: at 7% amplitude they
 * still shade correctly, and computeVertexNormals would split along the seam.
 */
function roughenCanopy(
  geo: THREE.BufferGeometry,
  height: number,
  amount: number,
  seed: number,
): void {
  if (amount <= 0) return;
  const rand = seeded(seed);
  // Incommensurate phases per cone species so the two layers never wobble in sync.
  const p1 = 2.1 + rand() * 1.7;
  const p2 = 3.3 + rand() * 2.2;
  const p3 = 0.31 + rand() * 0.27;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue; // the apex and cap centres stay put
    const wob = Math.sin((x / r) * p1 + y * p3) * Math.cos((z / r) * p2 - y * p3 * 1.7);
    // A ~9% base flare: boughs sag under their own weight, and the extra width
    // breaks the ruler-straight cone edge exactly where the silhouette is widest.
    const t = (y + height / 2) / height;
    const flare = 0.09 * (1 - THREE.MathUtils.smoothstep(t, 0, 0.3));
    const k = 1 + amount * wob + flare;
    pos.setXYZ(i, x * k, y, z * k);
  }
}

/** Beacon line down the forest path. Positions are load-bearing — do not move. */
const BEACON_Z = [48, 62, 78, 95, 115, 135, 148];

export function Forest() {
  const quality = useGameStore((s) => s.quality);
  const settings = QUALITY[quality];
  const scatter = useMemo(
    () => buildScatter(settings.vegetationScale),
    [settings.vegetationScale],
  );

  const wind = useMemo<WindUniforms>(
    () => ({
      uWindTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(1, 0) },
      uGust: { value: 0.4 },
    }),
    [],
  );

  const parts = useMemo(() => {
    const detail = TREE_DETAIL[quality];
    const fern = new THREE.CircleGeometry(1.35, 5);
    // Baked tilt keeps the instance rotation pure-Y, which is what lets the wind
    // patch invert the matrix with two dot products.
    fern.rotateX(-Math.PI / 2.25);

    const white = 0xffffff;
    const trunkMat = new THREE.MeshStandardMaterial({ color: white, roughness: 0.96 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: white, roughness: 0.9 });
    const canopy2Mat = new THREE.MeshStandardMaterial({ color: white, roughness: 0.88 });
    const fernMat = new THREE.MeshStandardMaterial({
      color: white,
      emissive: new THREE.Color("#3dffc8"),
      emissiveIntensity: 1.4,
      side: THREE.DoubleSide,
      roughness: 0.5,
    });
    trunkMat.onBeforeCompile = windPatch(wind, new THREE.Vector2(0.1, 0.012));
    canopyMat.onBeforeCompile = windPatch(wind, new THREE.Vector2(0.55, 0.035));
    canopy2Mat.onBeforeCompile = windPatch(wind, new THREE.Vector2(0.8, 0.03));
    fernMat.onBeforeCompile = windPatch(wind, new THREE.Vector2(0.1, 0));

    const canopy = new THREE.ConeGeometry(8.5, 13, detail.canopy[0], detail.canopy[1]);
    roughenCanopy(canopy, 13, detail.displace, 517);
    const canopy2 = new THREE.ConeGeometry(5.8, 9, detail.canopy2[0], detail.canopy2[1]);
    roughenCanopy(canopy2, 9, detail.displace, 941);

    return {
      trunk: new THREE.CylinderGeometry(1.5, 2.15, 16, detail.trunk),
      canopy,
      canopy2,
      fern,
      rock: new THREE.IcosahedronGeometry(1, 0),
      debris: new THREE.TetrahedronGeometry(1, 0),
      trunkMat,
      canopyMat,
      canopy2Mat,
      fernMat,
      rockMat: new THREE.MeshStandardMaterial({
        color: white,
        roughness: 0.92,
        metalness: 0.08,
        flatShading: true,
      }),
      debrisMat: new THREE.MeshStandardMaterial({
        color: white,
        roughness: 0.95,
        flatShading: true,
      }),
    };
  }, [wind, quality]);

  useEffect(() => {
    return () => {
      for (const part of Object.values(parts)) part.dispose();
    };
  }, [parts]);

  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const canopy2Ref = useRef<THREE.InstancedMesh>(null);
  const fernRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const debrisRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  /**
   * Per-instance albedo. These multiply a white base material, so the lightness
   * here is the surface's actual brightness, not a tint on top of one — set in
   * the 0.05-0.15 range the whole forest rendered as a black wall under this
   * world's dim red-dwarf light and ACES tone mapping.
   */
  const tint = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const trunk = trunkRef.current;
    const canopy = canopyRef.current;
    const canopy2 = canopy2Ref.current;
    if (!trunk || !canopy || !canopy2) return;

    scatter.trees.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.r, 0);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.07 + t.j * 0.03, 0.1 + t.j * 0.08, 0.24 + t.j * 0.1, THREE.SRGBColorSpace);
      trunk.setColorAt(i, tint);

      // A little lateral stretch per crown: the silhouette of a stand should not
      // be one cone repeated 1800 times.
      const spread = 0.86 + t.j * 0.3;
      dummy.position.set(t.x, t.y + 20 * t.s, t.z);
      dummy.scale.set(t.s * spread, t.s, t.s * spread);
      dummy.updateMatrix();
      canopy.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.4 + t.j * 0.1, 0.42 + t.j * 0.3, 0.26 + t.j * 0.12, THREE.SRGBColorSpace);
      canopy.setColorAt(i, tint);

      dummy.position.set(t.x, t.y + 27 * t.s, t.z);
      dummy.scale.setScalar(t.s * (0.78 + t.j * 0.18));
      dummy.updateMatrix();
      canopy2.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.42 + t.j * 0.09, 0.4 + t.j * 0.28, 0.3 + t.j * 0.13, THREE.SRGBColorSpace);
      canopy2.setColorAt(i, tint);
    });

    for (const mesh of [trunk, canopy, canopy2]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    // `parts` is a dep because a tier change swaps the geometry in `args`,
    // which rebuilds the InstancedMesh and zeroes every matrix written here.
  }, [scatter, parts, dummy, tint]);

  useLayoutEffect(() => {
    const fern = fernRef.current;
    if (!fern) return;
    scatter.ferns.forEach((f, i) => {
      dummy.position.set(f.x, f.y + 0.15, f.z);
      dummy.rotation.set(0, f.r, 0);
      dummy.scale.setScalar(f.s);
      dummy.updateMatrix();
      fern.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.43 + f.j * 0.07, 0.5 + f.j * 0.25, 0.32 + f.j * 0.12, THREE.SRGBColorSpace);
      fern.setColorAt(i, tint);
    });
    fern.instanceMatrix.needsUpdate = true;
    if (fern.instanceColor) fern.instanceColor.needsUpdate = true;
    fern.computeBoundingSphere();
  }, [scatter, parts, dummy, tint]);

  useLayoutEffect(() => {
    const rock = rockRef.current;
    const debris = debrisRef.current;
    if (!rock || !debris) return;
    scatter.rocks.forEach((r, i) => {
      dummy.position.set(r.x, r.y + r.s * 0.34, r.z);
      dummy.rotation.set(r.j * 0.5, r.r, 0.06 + r.j * 0.2);
      dummy.scale.set(r.s * (0.8 + r.j * 0.5), r.s * (0.6 + r.j * 0.5), r.s);
      dummy.updateMatrix();
      rock.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.58 + r.j * 0.05, 0.03 + r.j * 0.08, 0.3 + r.j * 0.16, THREE.SRGBColorSpace);
      rock.setColorAt(i, tint);
    });
    scatter.debris.forEach((r, i) => {
      dummy.position.set(r.x, r.y + r.s * 0.2, r.z);
      dummy.rotation.set(1.3 + r.j, r.r, r.j * 0.8);
      dummy.scale.set(r.s, r.s * 0.5, r.s);
      dummy.updateMatrix();
      debris.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.09 + r.j * 0.05, 0.12 + r.j * 0.14, 0.26 + r.j * 0.11, THREE.SRGBColorSpace);
      debris.setColorAt(i, tint);
    });
    for (const mesh of [rock, debris]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [scatter, parts, dummy, tint]);

  useLayoutEffect(() => {
    const post = postRef.current;
    const halo = haloRef.current;
    if (!post || !halo) return;
    BEACON_Z.forEach((z, i) => {
      const x = 1.5 + (i % 2) * 3.5;
      const y = sampleHeight(x, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.position.set(x, y + 0.45, z);
      dummy.updateMatrix();
      post.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, y + 1.05, z);
      dummy.updateMatrix();
      halo.setMatrixAt(i, dummy.matrix);
    });
    post.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;
    post.computeBoundingSphere();
    halo.computeBoundingSphere();
  }, [dummy]);

  const dir = useRef(new THREE.Vector2(1, 0));

  useFrame(({ clock }, delta) => {
    const state = useGameStore.getState();
    if (state.phase === "paused") return;
    const gust = atmosphere.storminess;

    dir.current.copy(atmosphere.wind);
    if (dir.current.lengthSq() < 1e-6) dir.current.set(1, 0);
    wind.uWindDir.value.copy(dir.current.normalize());

    if (state.reducedMotion) {
      wind.uGust.value = 0.1 + gust * 0.2;
    } else {
      wind.uWindTime.value += Math.min(delta, 0.05) * (0.75 + gust * 1.5);
      wind.uGust.value = 0.45 + gust * 2.4;
    }

    const t = clock.elapsedTime;
    const pulse = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / WORLD.fernPulse));
    parts.fernMat.emissiveIntensity =
      pulse * (0.1 + nightFactor(state.timeOfDay) * 2.3);
  });

  return (
    <group>
      <instancedMesh
        ref={trunkRef}
        args={[parts.trunk, parts.trunkMat, scatter.trees.length]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={canopyRef}
        args={[parts.canopy, parts.canopyMat, scatter.trees.length]}
        castShadow
      />
      <instancedMesh
        ref={canopy2Ref}
        args={[parts.canopy2, parts.canopy2Mat, scatter.trees.length]}
        castShadow
      />
      <instancedMesh
        ref={fernRef}
        args={[parts.fern, parts.fernMat, scatter.ferns.length]}
      />
      <instancedMesh
        ref={rockRef}
        args={[parts.rock, parts.rockMat, scatter.rocks.length]}
        castShadow
        receiveShadow
      />
      {/* Shards are ankle height: a shadow pass over 4k of them buys nothing the
          ambient-occlusion pass is not already giving them. */}
      <instancedMesh
        ref={debrisRef}
        args={[parts.debris, parts.debrisMat, scatter.debris.length]}
        receiveShadow
      />

      <Grass />

      {/* Path beacons. Emissive only — Bloom sells the glow, and seven always-on
          dynamic lights was the scene's largest mobile-GPU cost for no gain. */}
      <instancedMesh ref={postRef} args={[undefined, undefined, BEACON_Z.length]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 0.9, 6]} />
        <meshStandardMaterial
          color="#2a6b61"
          emissive="#3d9e8f"
          emissiveIntensity={2.6}
          toneMapped={false}
        />
      </instancedMesh>
      {/* A dim halo so the beacon still reads at distance, where the 0.9-unit
          post falls below a pixel. */}
      <instancedMesh ref={haloRef} args={[undefined, undefined, BEACON_Z.length]}>
        <sphereGeometry args={[0.22, 8, 6]} />
        <meshBasicMaterial
          color="#7fe8d8"
          transparent
          opacity={0.55}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
