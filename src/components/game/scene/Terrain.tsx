import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { atmosphere } from "@/game/atmosphere";
import { useGameStore } from "@/game/store";
import { COLONY_Y, sampleBiome, sampleHeight } from "@/game/worldHeight";

/**
 * The ground, as a grid of analytically generated tiles.
 *
 * It used to be one 480-unit plane at 100 segments — 4.8 m per quad, and a
 * single mesh three.js can only cull as a whole, which capped the world at a
 * diorama. Tiles give near-field resolution where it is looked at, real
 * frustum culling, and a world that can grow by widening the grid rather than
 * by subdividing a plane that is already too coarse.
 *
 * Generation is analytic and cheap (a 64-segment tile is about a millisecond of
 * sampleHeight), so it stays on the main thread and is throttled to one tile
 * per frame; fillTile() writes nothing but the buffers it is handed and reads
 * nothing but (origin, segments), so it could move to a Worker without
 * touching anything else here.
 */

/** Tile edge in world units. */
const TILE = 64;
/** Quads per tile edge: 1 m, 2 m and 4 m per quad. */
const LOD_SEGMENTS = [64, 32, 16] as const;
/**
 * Distance from the player at which each LOD gives way. Measured against tile
 * centres, so 84 keeps metre quads out to roughly 40 m of open ground ahead
 * while holding the resident vertex count near 75k — five times the plane it
 * replaces for five times the near-field resolution, and the grass field in
 * front of it needs the rest of the budget.
 */
const LOD_NEAR = 84;
const LOD_MID = 180;
/** Refine at the boundary, coarsen only well past it, or tiles thrash on it. */
const LOD_HYSTERESIS = 20;
/** Past this a tile is not drawn; fog closes long before, the camera far is 420. */
const DRAW_DISTANCE = 340;
/**
 * Downward rim on every tile edge. Two neighbouring LODs disagree about the
 * surface between their shared vertices, and a skirt hides that crack for the
 * cost of one vertex ring — stitching the two resolutions together instead
 * would need per-edge index variants and still break at the corners.
 */
const SKIRT = 2.5;

/**
 * The grid covers the whole box PlayerController clamps to (it derives its walk
 * limits from a 480-unit plane centred on z=90) plus a tile of margin, so the
 * player can never see the edge of the world.
 */
const GRID_X0 = -256;
const GRID_Z0 = -160;
const GRID_COLS = 8;
const GRID_ROWS = 8;

/** Ground textures repeat once every 9 world units, in world space, not per tile. */
const TEXTURE_SCALE = 1 / 9;

/** Deterministic texture grain — golden screenshots diff the ground pixel-wise. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

type GroundSpec = {
  size: number;
  from: string;
  to: string;
  grain: { count: number; rgb: [number, number, number]; vary: number; max: number };
  blotch?: { count: number; rgb: [number, number, number]; radius: number; alpha: number };
};

function groundTexture(spec: GroundSpec, seed: number): THREE.CanvasTexture {
  const size = spec.size;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, spec.from);
  g.addColorStop(1, spec.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const rand = seeded(seed);
  const blotch = spec.blotch;
  if (blotch) {
    for (let i = 0; i < blotch.count; i++) {
      const r = blotch.radius * (0.4 + rand() * 1.3);
      ctx.fillStyle = `rgba(${blotch.rgb[0]},${blotch.rgb[1]},${blotch.rgb[2]},${(
        blotch.alpha * rand()
      ).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(
        rand() * size,
        rand() * size,
        r,
        r * (0.45 + rand() * 0.8),
        rand() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  const grain = spec.grain;
  for (let i = 0; i < grain.count; i++) {
    const v = 1 - grain.vary * rand();
    ctx.fillStyle = `rgba(${(grain.rgb[0] * v) | 0},${(grain.rgb[1] * v) | 0},${
      (grain.rgb[2] * v) | 0
    },${(0.15 + rand() * 0.5).toFixed(3)})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * grain.max, 1 + rand() * grain.max);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Four surfaces, blended in the shader. The palettes stay in the range of the
 * single texture they replace, because the material colour that multiplies them
 * is unchanged and the whole scene's exposure was lit against it.
 */
function groundTextures() {
  return {
    soil: groundTexture(
      {
        size: 512,
        from: "#4a3a2a",
        to: "#2a2820",
        grain: { count: 9000, rgb: [150, 124, 78], vary: 0.55, max: 3 },
        blotch: { count: 40, rgb: [26, 22, 16], radius: 44, alpha: 0.35 },
      },
      1013,
    ),
    moss: groundTexture(
      {
        size: 512,
        from: "#33402c",
        to: "#1f2a22",
        grain: { count: 8000, rgb: [96, 150, 96], vary: 0.6, max: 3 },
        blotch: { count: 70, rgb: [30, 74, 52], radius: 38, alpha: 0.4 },
      },
      2029,
    ),
    rock: groundTexture(
      {
        size: 256,
        from: "#6a6560",
        to: "#3e3c3a",
        grain: { count: 4200, rgb: [180, 176, 168], vary: 0.7, max: 5 },
        blotch: { count: 34, rgb: [42, 40, 38], radius: 26, alpha: 0.5 },
      },
      3049,
    ),
    sand: groundTexture(
      {
        size: 256,
        from: "#8d7a62",
        to: "#6d5f4c",
        grain: { count: 5200, rgb: [214, 196, 164], vary: 0.4, max: 2 },
        blotch: { count: 22, rgb: [92, 76, 60], radius: 22, alpha: 0.3 },
      },
      4073,
    ),
  };
}

type Uniforms = {
  uSoil: THREE.IUniform<THREE.Texture>;
  uMoss: THREE.IUniform<THREE.Texture>;
  uRock: THREE.IUniform<THREE.Texture>;
  uSand: THREE.IUniform<THREE.Texture>;
  uTexScale: THREE.IUniform<number>;
  uDay: THREE.IUniform<number>;
  uNightTint: THREE.IUniform<THREE.Color>;
};

const VERTEX_HEAD = /* glsl */ `
attribute vec3 aBiome;
varying vec3 vGroundWorld;
varying vec3 vGroundBiome;
varying float vGroundSlope;
`;

const VERTEX_BODY = /* glsl */ `
#include <begin_vertex>
vGroundWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vGroundBiome = aBiome;
// Tiles are translated, never rotated, so the object normal is already the
// world one. Its horizontal length is sin(incline) — the same number
// worldHeight's slopeAt returns, so the rock line can be reasoned about in the
// units the movement code uses.
vGroundSlope = length( normal.xz );
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D uSoil;
uniform sampler2D uMoss;
uniform sampler2D uRock;
uniform sampler2D uSand;
uniform float uTexScale;
uniform float uDay;
uniform vec3 uNightTint;
varying vec3 vGroundWorld;
varying vec3 vGroundBiome;
varying float vGroundSlope;

float groundHash( vec2 p ) {
  vec3 q = fract( vec3( p.x, p.y, p.x ) * 0.1031 );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}

float groundNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( groundHash( i ), groundHash( i + vec2( 1.0, 0.0 ) ), f.x ),
    mix( groundHash( i + vec2( 0.0, 1.0 ) ), groundHash( i + vec2( 1.0, 1.0 ) ), f.x ),
    f.y );
}
`;

/**
 * Slope and biome pick the surface: ridge tops and steep faces read as rock,
 * the colony as compacted soil, the shore as sand, everything else as moss.
 *
 * Each mask goes through a smoothstep with the noise added *inside* it rather
 * than to the result — perturbing the result instead floors every surface in a
 * little of every other one, and the whole world picks up a wash of beach sand.
 * Two value-noise taps and four texture fetches: cheap enough for the phone,
 * and it is what stops the ground reading as one tiled swatch from pad to coast.
 */
const FRAGMENT_BODY = /* glsl */ `
#include <color_fragment>
vec2 groundUv = vGroundWorld.xz * uTexScale;
float edge = groundNoise( vGroundWorld.xz * 0.11 ) - 0.5;
float rock = max(
  smoothstep( 0.32, 0.60, vGroundSlope + edge * 0.22 ),
  smoothstep( 0.30, 0.62, vGroundBiome.y + edge * 0.30 ) );
float sand = smoothstep( 0.34, 0.66, vGroundBiome.z + edge * 0.30 );
float soil = smoothstep( 0.30, 0.62, vGroundBiome.x + edge * 0.26 );
vec3 ground = texture2D( uMoss, groundUv ).rgb;
ground = mix( ground, texture2D( uSand, groundUv ).rgb, sand );
ground = mix( ground, texture2D( uSoil, groundUv ).rgb, soil );
ground = mix( ground, texture2D( uRock, groundUv * 0.77 ).rgb, rock );
ground *= 0.80 + 0.42 * groundNoise( vGroundWorld.xz * 0.017 );
ground *= mix( uNightTint, vec3( 1.0 ), uDay );
diffuseColor.rgb *= ground;
`;

function terrainMaterial(uniforms: Uniforms): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: "#9a8068",
    roughness: 0.94,
    metalness: 0.04,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", VERTEX_BODY);
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      FRAGMENT_BODY,
    );
  };
  // One program for every tile, and one that never collides with the stock
  // standard material's cache entry.
  material.customProgramCacheKey = () => "fieldops-terrain-splat";
  return material;
}

/**
 * Triangle indices for one LOD. Shared by every geometry of that LOD: the data
 * is identical, and it is only ever disposed when the whole grid goes away.
 */
function buildIndex(dim: number): THREE.BufferAttribute {
  const quads = dim - 1;
  const index = new Uint16Array(quads * quads * 6);
  let o = 0;
  for (let j = 0; j < quads; j++) {
    for (let i = 0; i < quads; i++) {
      const a = j * dim + i;
      const b = a + dim;
      index[o++] = a;
      index[o++] = b;
      index[o++] = a + 1;
      index[o++] = a + 1;
      index[o++] = b;
      index[o++] = b + 1;
    }
  }
  return new THREE.BufferAttribute(index, 1);
}

/**
 * A tile carries one ring of vertices beyond its own edge. The ring is drawn at
 * the clamped edge position dropped by SKIRT — that is the skirt — but the
 * heights behind it are sampled at the true outside position, so the edge row's
 * central difference sees its real neighbour. Two adjacent tiles therefore
 * compute bit-identical normals along a shared edge and the seam disappears
 * from the shading as well as from the silhouette.
 */
function fillTile(
  geometry: THREE.BufferGeometry,
  segments: number,
  originX: number,
  originZ: number,
  scratch: Float32Array,
) {
  const dim = segments + 3;
  const step = TILE / segments;
  const position = geometry.attributes.position.array as Float32Array;
  const normal = geometry.attributes.normal.array as Float32Array;
  const biome = geometry.attributes.aBiome.array as Float32Array;

  for (let j = 0; j < dim; j++) {
    const wz = originZ + (j - 1) * step;
    const row = j * dim;
    for (let i = 0; i < dim; i++) {
      scratch[row + i] = sampleHeight(originX + (i - 1) * step, wz);
    }
  }

  const ny = 2 * step;
  for (let j = 1; j < dim - 1; j++) {
    const lz = (j - 1) * step;
    const wz = originZ + lz;
    for (let i = 1; i < dim - 1; i++) {
      const k = j * dim + i;
      const v = k * 3;
      const lx = (i - 1) * step;
      position[v] = lx;
      position[v + 1] = scratch[k];
      position[v + 2] = lz;

      const nx = scratch[k - 1] - scratch[k + 1];
      const nz = scratch[k - dim] - scratch[k + dim];
      const len = Math.hypot(nx, ny, nz) || 1;
      normal[v] = nx / len;
      normal[v + 1] = ny / len;
      normal[v + 2] = nz / len;

      const b = sampleBiome(originX + lx, wz);
      biome[v] = b.colony;
      biome[v + 1] = b.ridge;
      biome[v + 2] = b.coast;
    }
  }

  const last = dim - 1;
  for (let j = 0; j < dim; j++) {
    const inner = j > 0 && j < last;
    for (let i = 0; i < dim; i++) {
      if (inner && i > 0 && i < last) continue;
      const cj = j === 0 ? 1 : j === last ? last - 1 : j;
      const ci = i === 0 ? 1 : i === last ? last - 1 : i;
      const src = (cj * dim + ci) * 3;
      const v = (j * dim + i) * 3;
      position[v] = position[src];
      position[v + 1] = position[src + 1] - SKIRT;
      position[v + 2] = position[src + 2];
      normal[v] = normal[src];
      normal[v + 1] = normal[src + 1];
      normal[v + 2] = normal[src + 2];
      biome[v] = biome[src];
      biome[v + 1] = biome[src + 1];
      biome[v + 2] = biome[src + 2];
    }
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  geometry.attributes.aBiome.needsUpdate = true;
  geometry.computeBoundingSphere();
}

function createGeometry(lod: number, index: THREE.BufferAttribute): THREE.BufferGeometry {
  const dim = LOD_SEGMENTS[lod] + 3;
  const count = dim * dim;
  const geometry = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "aBiome"]) {
    const attribute = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    // Pooled buffers are rewritten whenever a tile changes LOD, never per frame.
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
  }
  geometry.setIndex(index);
  return geometry;
}

/** Refine on the boundary, coarsen a band past it. */
function lodFor(distance: number, current: number): number {
  if (distance < (current <= 0 ? LOD_NEAR + LOD_HYSTERESIS : LOD_NEAR)) return 0;
  if (distance < (current <= 1 ? LOD_MID + LOD_HYSTERESIS : LOD_MID)) return 1;
  return 2;
}

type Tile = {
  mesh: THREE.Mesh;
  originX: number;
  originZ: number;
  centreX: number;
  centreZ: number;
  lod: number;
};

/** The south road follows the ground; the pad does not have to — see below. */
function roadGeometry(halfWidth: number, z0: number, z1: number, lift: number) {
  const cols = 4;
  const rows = Math.round((z1 - z0) / 1.5);
  const stride = cols + 1;
  const position = new Float32Array(stride * (rows + 1) * 3);
  const index = new Uint16Array(cols * rows * 6);
  for (let j = 0; j <= rows; j++) {
    const z = z0 + ((z1 - z0) * j) / rows;
    for (let i = 0; i < stride; i++) {
      const x = -halfWidth + (2 * halfWidth * i) / cols;
      const v = (j * stride + i) * 3;
      position[v] = x;
      position[v + 1] = sampleHeight(x, z) + lift;
      position[v + 2] = z;
    }
  }
  let o = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      const b = a + stride;
      index[o++] = a;
      index[o++] = b;
      index[o++] = a + 1;
      index[o++] = a + 1;
      index[o++] = b;
      index[o++] = b + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function createWorld() {
  const textures = groundTextures();
  const uniforms: Uniforms = {
    uSoil: { value: textures.soil },
    uMoss: { value: textures.moss },
    uRock: { value: textures.rock },
    uSand: { value: textures.sand },
    uTexScale: { value: TEXTURE_SCALE },
    uDay: { value: 1 },
    uNightTint: { value: new THREE.Color(0.44, 0.48, 0.66) },
  };
  const material = terrainMaterial(uniforms);
  const indices = LOD_SEGMENTS.map((segments) => buildIndex(segments + 3));
  const scratch = new Float32Array((LOD_SEGMENTS[0] + 3) * (LOD_SEGMENTS[0] + 3));
  const pooled: THREE.BufferGeometry[][] = [[], [], []];
  const owned: THREE.BufferGeometry[] = [];

  const acquire = (lod: number) => {
    const free = pooled[lod].pop();
    if (free) return free;
    const geometry = createGeometry(lod, indices[lod]);
    owned.push(geometry);
    return geometry;
  };

  // Every tile is handed a real geometry by the update() below before anything
  // renders; this only keeps the meshes constructible until then.
  const placeholder = new THREE.BufferGeometry();
  const group = new THREE.Group();
  const tiles: Tile[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const originX = GRID_X0 + col * TILE;
      const originZ = GRID_Z0 + row * TILE;
      const mesh = new THREE.Mesh(placeholder, material);
      mesh.position.set(originX, 0, originZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      tiles.push({
        mesh,
        originX,
        originZ,
        centreX: originX + TILE / 2,
        centreZ: originZ + TILE / 2,
        lod: -1,
      });
    }
  }

  const swap = (tile: Tile, lod: number) => {
    const geometry = acquire(lod);
    if (tile.lod >= 0) pooled[tile.lod].push(tile.mesh.geometry);
    fillTile(geometry, LOD_SEGMENTS[lod], tile.originX, tile.originZ, scratch);
    tile.mesh.geometry = geometry;
    tile.lod = lod;
  };

  let lastX = Number.NaN;
  let lastZ = Number.NaN;

  const update = (px: number, pz: number) => {
    // A spawn or a QA teleport invalidates the whole grid at once; dribbling
    // that out one tile a frame would leave the player standing on 4 m quads
    // for a second. Ordinary walking never trips this.
    const jumped = !(Math.abs(px - lastX) < TILE && Math.abs(pz - lastZ) < TILE);
    lastX = px;
    lastZ = pz;

    let candidate: Tile | null = null;
    let candidateLod = 0;
    let candidateDistance = Infinity;
    for (const tile of tiles) {
      const dx = tile.centreX - px;
      const dz = tile.centreZ - pz;
      const distance = Math.sqrt(dx * dx + dz * dz);
      tile.mesh.visible = distance < DRAW_DISTANCE;
      const wanted = lodFor(distance, tile.lod < 0 ? 2 : tile.lod);
      if (wanted === tile.lod) continue;
      if (jumped) {
        swap(tile, wanted);
      } else if (distance < candidateDistance) {
        candidate = tile;
        candidateLod = wanted;
        candidateDistance = distance;
      }
    }
    // One rebuild a frame: the near tile the player is walking into wins, and
    // the far field settles over the following frames without a hitch.
    if (candidate) swap(candidate, candidateLod);
  };

  const spawn = useGameStore.getState().playerPos;
  update(spawn.x, spawn.z);

  const road = roadGeometry(3.5, 10, 100, 0.09);
  const pad = new THREE.CircleGeometry(52, 64);
  pad.rotateX(-Math.PI / 2);

  return {
    group,
    uniforms,
    road,
    pad,
    update,
    dispose: () => {
      // Disposing every tile geometry also releases the index buffers they
      // share; nothing is left holding one, so the repeated release is a no-op.
      for (const geometry of owned) geometry.dispose();
      placeholder.dispose();
      road.dispose();
      pad.dispose();
      material.dispose();
      textures.soil.dispose();
      textures.moss.dispose();
      textures.rock.dispose();
      textures.sand.dispose();
    },
  };
}

export function Terrain() {
  const world = useMemo(() => createWorld(), []);

  useEffect(() => world.dispose, [world]);

  useFrame(() => {
    const pos = useGameStore.getState().playerPos;
    world.update(pos.x, pos.z);
    world.uniforms.uDay.value = atmosphere.dayFactor;
  });

  return (
    <group>
      <primitive object={world.group} />

      {/*
        The pad needs no displacement because the heightfield guarantees it is
        level: 52 units around (0, 12) never leaves the 56-unit flat core around
        (0, 10). All it needs is clearance and a polygon offset.
      */}
      <mesh geometry={world.pad} receiveShadow position={[0, COLONY_Y + 0.04, 12]}>
        <meshStandardMaterial
          color="#2c343c"
          roughness={0.78}
          metalness={0.22}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>

      {/* South approach road, displaced onto the graded corridor it runs along. */}
      <mesh geometry={world.road} receiveShadow>
        <meshStandardMaterial
          color="#3a4048"
          roughness={0.9}
          metalness={0.1}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  );
}
