import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { atmosphere } from "@/game/atmosphere";
import { colliders } from "@/game/entities";
import { QUALITY } from "@/game/quality";
import { useGameStore } from "@/game/store";
import { SEA_LEVEL, sampleBiome, sampleHeight } from "@/game/worldHeight";

/**
 * Ground cover.
 *
 * The blades are a fixed square patch of instances that never move on the CPU:
 * the vertex shader modulo-wraps each blade against a `uPlayer` uniform, so
 * walking the length of the map costs zero matrix writes. Everything the shader
 * needs about the world at the wrapped position — ground height, how much grass
 * belongs there, and what the ground under it looks like — is baked once into a
 * small RGBA half-float field texture, because the height field is analytic on
 * the CPU only and cannot be re-derived per vertex.
 */

/** Park–Miller LCG. Golden screenshots depend on this exact stream. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Wider than the 480 m terrain plane (x ±240, z −150..330), which is itself
 * wider than the walk box. The patch reaches tens of metres past the player, so
 * a field sized to the walk box would clamp its edge texels outward and hang a
 * fringe of grass over the void. Here the border texels are bare, so the clamp
 * extends nothing.
 */
const FIELD = { x0: -260, z0: -170, sx: 520, sz: 520 };

/** 1.6 m per texel. Bilinear across that is well inside a blade's own height. */
const FIELD_RES = 320;

/** Terrain.tsx's plane. Ground cover stops before the mesh does. */
function insideTerrain(x: number, z: number): number {
  return (
    (1 - THREE.MathUtils.smoothstep(Math.abs(x), 232, 239)) *
    THREE.MathUtils.smoothstep(z, -148, -140) *
    (1 - THREE.MathUtils.smoothstep(z, 320, 328))
  );
}

/** Blade bases sit this far under the sampled height so texel error never lifts them. */
const SINK = 0.14;

const BLADE_H = 0.44;

/** Blades and patch size at `grassDensity` 1; both fall off the quality ladder. */
const BASE_BLADES = 42000;
const BASE_SPAN = 66;

/**
 * The landing-pad apron from Terrain.tsx, then the surfaced road and the game
 * trail the beacon line continues out to the ruin approach. 0 on bare ground,
 * 1 where things may grow. Kept identical in Forest.tsx — file ownership this
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

/** Low-frequency bare patches so the cover is never a uniform carpet. */
function patchNoise(x: number, z: number): number {
  const a = Math.sin(x * 0.041 + z * 0.023);
  const b = Math.cos(z * 0.031 - x * 0.018);
  return 0.42 + 0.72 * (0.5 + 0.5 * a * b);
}

type Field = { texture: THREE.DataTexture; dispose: () => void };

/**
 * R: ground height (already sunk). G: blade density. B/A: ridge and forest
 * weights, which the shader mixes into the blade tint so grass reads as growing
 * out of the ground rather than stuck onto it.
 */
function buildField(res: number): Field {
  const n = res;
  const stepX = FIELD.sx / n;
  const stepZ = FIELD.sz / n;
  const height = new Float32Array(n * n);
  const density = new Float32Array(n * n);
  const ridge = new Float32Array(n * n);
  const forest = new Float32Array(n * n);
  const shells = colliders();

  for (let j = 0; j < n; j++) {
    const z = FIELD.z0 + (j + 0.5) * stepZ;
    const shore = shoreFade(z);
    for (let i = 0; i < n; i++) {
      const x = FIELD.x0 + (i + 0.5) * stepX;
      const k = j * n + i;
      const h = sampleHeight(x, z);
      height[k] = h - SINK;
      const b = sampleBiome(x, z);
      ridge[k] = b.ridge;
      forest[k] = b.forest;
      // Water.tsx's plane starts at z = 186, so the waterline only means
      // anything down there — a third of the inland map dips below SEA_LEVEL as
      // perfectly dry basins, and testing height alone would strip them bare.
      if (z > 182 && h < SEA_LEVEL + 0.4) continue;
      const mask = clearedGround(x, z) * shore * insideTerrain(x, z);
      if (mask <= 0.001) continue;
      const d =
        (0.34 + 0.52 * b.forest + 0.16 * b.colony - 0.3 * b.ridge - 0.95 * b.coast) *
        mask *
        patchNoise(x, z);
      if (d <= 0) continue;
      let blocked = false;
      for (const c of shells) {
        if (Math.hypot(x - c.x, z - c.z) < c.radius + 1.5) {
          blocked = true;
          break;
        }
      }
      density[k] = blocked ? 0 : Math.min(1, d);
    }
  }

  // Slope from the height field we already have, rather than 4 more analytic
  // samples per texel: nothing takes root on a basalt face.
  const data = new Uint16Array(n * n * 4);
  for (let j = 0; j < n; j++) {
    const jUp = Math.min(n - 1, j + 1);
    const jDown = Math.max(0, j - 1);
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const gx =
        (height[j * n + Math.min(n - 1, i + 1)] - height[j * n + Math.max(0, i - 1)]) /
        (2 * stepX);
      const gz = (height[jUp * n + i] - height[jDown * n + i]) / (2 * stepZ);
      const flat = 1 - THREE.MathUtils.smoothstep(Math.hypot(gx, gz), 0.55, 1.1);
      const o = k * 4;
      data[o] = THREE.DataUtils.toHalfFloat(height[k]);
      data[o + 1] = THREE.DataUtils.toHalfFloat(density[k] * flat);
      data[o + 2] = THREE.DataUtils.toHalfFloat(ridge[k]);
      data[o + 3] = THREE.DataUtils.toHalfFloat(forest[k]);
    }
  }

  const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, dispose: () => texture.dispose() };
}

/**
 * Two crossed tapered quads. Untextured on purpose — a tapered blade reads
 * without an alpha cutout, which keeps the whole ring in the opaque pass with
 * no sorting and no discard.
 */
function bladeGeometry(count: number, span: number): THREE.InstancedBufferGeometry {
  const w = 0.052;
  const tip = 0.011;
  const h = BLADE_H;
  // Quad one spans local x, quad two spans local z; both taper to a near-point.
  const pos = new Float32Array([
    -w, 0, 0,
    w, 0, 0,
    tip, h, 0,
    -tip, h, 0,
    0, 0, -w,
    0, 0, w,
    0, h, tip,
    0, h, -tip,
  ]);
  const col = new Float32Array(24);
  for (let i = 0; i < 8; i++) {
    // Darker at the base, brighter at the tip: fake self-shadowing inside the sward.
    const v = pos[i * 3 + 1] > 0 ? 1.15 : 0.55;
    col[i * 3] = v;
    col[i * 3 + 1] = v;
    col[i * 3 + 2] = v;
  }
  const nrm = new Float32Array(24);
  for (let i = 0; i < 8; i++) nrm[i * 3 + 1] = 1;

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);

  const ring = new Float32Array(count * 2);
  const rot = new Float32Array(count * 2);
  const tune = new Float32Array(count * 2);
  const rand = seeded(1777);
  for (let i = 0; i < count; i++) {
    ring[i * 2] = (rand() - 0.5) * span;
    ring[i * 2 + 1] = (rand() - 0.5) * span;
    // Crossed quads repeat every half turn, so half a turn is the whole range.
    const a = rand() * Math.PI;
    rot[i * 2] = Math.cos(a);
    rot[i * 2 + 1] = Math.sin(a);
    tune[i * 2] = 0.7 + rand() * 0.7;
    tune[i * 2 + 1] = rand();
  }
  geo.setAttribute("aRing", new THREE.InstancedBufferAttribute(ring, 2));
  geo.setAttribute("aRot", new THREE.InstancedBufferAttribute(rot, 2));
  geo.setAttribute("aTune", new THREE.InstancedBufferAttribute(tune, 2));
  geo.instanceCount = count;
  // The patch is glued to the camera, so a world-space bound would be a lie.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), span);
  return geo;
}

type GrassUniforms = {
  uPlayer: { value: THREE.Vector2 };
  uSpan: { value: number };
  uField: { value: THREE.Vector4 };
  uFieldMap: { value: THREE.Texture };
  uFade: { value: THREE.Vector2 };
  uWindDir: { value: THREE.Vector2 };
  uGust: { value: number };
  uTime: { value: number };
  uSoil: { value: THREE.Color };
  uMoss: { value: THREE.Color };
  uRock: { value: THREE.Color };
};

const GRASS_DECLS = /* glsl */ `
attribute vec2 aRing;
attribute vec2 aRot;
attribute vec2 aTune;
uniform vec2 uPlayer;
uniform float uSpan;
uniform vec4 uField;
uniform sampler2D uFieldMap;
uniform vec2 uFade;
uniform vec2 uWindDir;
uniform float uGust;
uniform float uTime;
uniform vec3 uSoil;
uniform vec3 uMoss;
uniform vec3 uRock;
`;

const GRASS_VERTEX = /* glsl */ `
  float gHalf = uSpan * 0.5;
  vec2 gWrap = mod(aRing - uPlayer + gHalf, uSpan) - gHalf + uPlayer;
  vec4 gField = texture2D(uFieldMap, (gWrap - uField.xy) * uField.zw);
  float gHash = aTune.y;
  float gFade = 1.0 - smoothstep(uFade.x, uFade.y, distance(gWrap, uPlayer));
  // Density is a survival threshold, not a scale: thinning by hash keeps the
  // blades that remain full height instead of leaving a lawn of stubs.
  float gScale = aTune.x * gFade * step(gHash, gField.g);
  float gBend = transformed.y * ${(1 / BLADE_H).toFixed(4)};
  vec3 gLocal = vec3(
    transformed.x * aRot.x - transformed.z * aRot.y,
    transformed.y,
    transformed.x * aRot.y + transformed.z * aRot.x
  ) * gScale;
  float gPhase = dot(gWrap, uWindDir) * 0.32 + gHash * 6.2832;
  float gSway = sin(uTime * 1.9 + gPhase) * 0.6 + sin(uTime * 3.7 + gPhase * 1.7) * 0.4;
  gLocal.xz += uWindDir * (gSway * uGust * gBend * gScale);
  transformed = vec3(gWrap.x, gField.r, gWrap.y) + gLocal;

  vec3 gTint = mix(uSoil, uMoss, clamp(gField.a, 0.0, 1.0));
  gTint = mix(gTint, uRock, clamp(gField.b, 0.0, 1.0));
  vColor.rgb *= gTint * (0.72 + 0.55 * gHash);
`;

function grassPatch(uniforms: GrassUniforms) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${GRASS_DECLS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${GRASS_VERTEX}`);
    // Every blade carries one upward normal so a crossed quad shades like ground
    // cover from either side; DOUBLE_SIDED would otherwise flip half the faces
    // and light them from underneath.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      "#include <normal_fragment_begin>\n  normal = normalize( vNormal );",
    );
  };
}

export function Grass() {
  const quality = useGameStore((s) => s.quality);
  const settings = QUALITY[quality];

  const count = Math.round(BASE_BLADES * settings.grassDensity);
  // Area scales with the blade budget so cover density stays constant and only
  // the radius the player sees it out to changes with the tier.
  const span = BASE_SPAN * Math.sqrt(settings.grassDensity);

  const field = useMemo(
    () => buildField(quality === "low" ? 224 : FIELD_RES),
    [quality],
  );
  const geometry = useMemo(() => bladeGeometry(count, span), [count, span]);

  const uniforms = useMemo<GrassUniforms>(
    () => ({
      uPlayer: { value: new THREE.Vector2() },
      uSpan: { value: span },
      uField: { value: new THREE.Vector4(FIELD.x0, FIELD.z0, 1 / FIELD.sx, 1 / FIELD.sz) },
      uFieldMap: { value: field.texture },
      // Blades are already invisible by the time the wrap teleports them across
      // the patch at half a span, so the ring edge never shows.
      uFade: { value: new THREE.Vector2(span * 0.32, span * 0.46) },
      uWindDir: { value: new THREE.Vector2(1, 0) },
      uGust: { value: 0.12 },
      uTime: { value: 0 },
      // Deliberately near-black in sRGB: Terrain.tsx multiplies a dark canvas
      // texture by #9a8068, so its albedo is only a couple of percent. Anything
      // brighter here reads as a decal laid over the ground rather than as part
      // of it.
      uSoil: { value: new THREE.Color("#35301f") },
      uMoss: { value: new THREE.Color("#1d3328") },
      uRock: { value: new THREE.Color("#2e302c") },
    }),
    [field, span],
  );

  const material = useMemo(() => {
    // Lambert rather than Standard: at 40k blades the specular lobe is invisible
    // and the per-fragment cost is not.
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    mat.onBeforeCompile = grassPatch(uniforms);
    return mat;
  }, [uniforms]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      field.dispose();
    };
  }, [geometry, material, field]);

  const dir = useRef(new THREE.Vector2(1, 0));

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    if (state.phase === "paused") return;
    const d = Math.min(delta, 0.05);
    const gust = atmosphere.storminess;

    dir.current.copy(atmosphere.wind);
    if (dir.current.lengthSq() < 1e-6) dir.current.set(1, 0);
    uniforms.uWindDir.value.copy(dir.current.normalize());
    uniforms.uPlayer.value.set(state.playerPos.x, state.playerPos.z);

    if (state.reducedMotion) {
      // A held bend rather than a frozen upright field: still reads as wind,
      // never animates.
      uniforms.uGust.value = 0.02 + gust * 0.05;
      return;
    }
    uniforms.uTime.value += d * (1 + gust * 1.4);
    uniforms.uGust.value = 0.07 + gust * 0.26;
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      receiveShadow={settings.shadowsEnabled}
      frustumCulled={false}
    />
  );
}
