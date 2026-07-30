import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { atmosphere } from "@/game/atmosphere";
import { useGameStore } from "@/game/store";
import { SEA_LEVEL, sampleHeight } from "@/game/worldHeight";

/**
 * The crimson sea south of Kaguyahime Coast.
 *
 * The north edge tucks well under the beach (the shoreline falls between
 * z~198 and z~219) so the plane never shows an edge, and the south edge sits
 * past the sky dome at z=300, where fog has already taken over.
 */
const MIN_X = -200;
const MAX_X = 200;
const MIN_Z = 186;
const MAX_Z = 330;

/** Plane tessellation. Lighting detail comes from the fragment-side wave
 *  normal, so the mesh only has to carry the long-wave silhouette. */
const SEG_X = 140;
const SEG_Z = 64;

/** Seabed lookup for the fragment shader: ~1.0 x 0.9 m per texel. */
const GROUND_W = 384;
const GROUND_H = 160;

/**
 * The waterline comes from worldHeight, which authors the beach shelf the sea
 * has to meet. Probing the terrain for it here looked more robust but was the
 * opposite: it let the noise decide, and put the memorial and the coast cache
 * a metre under water.
 */

function buildGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(
    MAX_X - MIN_X,
    MAX_Z - MIN_Z,
    SEG_X,
    SEG_Z,
  );
  geo.rotateX(-Math.PI / 2);
  geo.translate((MIN_X + MAX_X) / 2, 0, (MIN_Z + MAX_Z) / 2);

  // Seabed height per vertex, so the vertex shader can flatten the swell in
  // the shallows without a vertex texture fetch.
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const ground = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    ground[i] = sampleHeight(pos.getX(i), pos.getZ(i));
  }
  geo.setAttribute("aGround", new THREE.BufferAttribute(ground, 1));
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  return geo;
}

/**
 * The whole point of this water: the seabed is a pure function, so the shore
 * is known analytically and foam needs no depth prepass and no scene depth
 * texture. Baking it to a half-float R16F lookup gives per-pixel foam off one
 * bilinear fetch instead of tessellating the plane to the foam's resolution.
 */
function buildGroundTexture(): THREE.DataTexture {
  const data = new Uint16Array(GROUND_W * GROUND_H);
  for (let j = 0; j < GROUND_H; j++) {
    const z = MIN_Z + ((j + 0.5) / GROUND_H) * (MAX_Z - MIN_Z);
    for (let i = 0; i < GROUND_W; i++) {
      const x = MIN_X + ((i + 0.5) / GROUND_W) * (MAX_X - MIN_X);
      data[j * GROUND_W + i] = THREE.DataUtils.toHalfFloat(sampleHeight(x, z));
    }
  }
  const tex = new THREE.DataTexture(
    data,
    GROUND_W,
    GROUND_H,
    THREE.RedFormat,
    THREE.HalfFloatType,
  );
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const VERTEX_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

attribute float aGround;

uniform float uPhase;
uniform float uLevel;
uniform float uAmp;
uniform float uChop;
uniform vec2 uWindDir;

varying vec3 vWorld;
varying vec2 vBase;

vec2 rot2(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

vec3 waveDisp(vec2 p, vec2 dir, float len, float amp, float steep) {
  float k = PI2 / len;
  float w = sqrt(9.81 * k) * 0.7;
  float ph = k * dot(dir, p) - uPhase * w;
  float q = steep * uChop;
  return vec3(
    q * amp * dir.x * cos(ph),
    amp * sin(ph),
    q * amp * dir.y * cos(ph)
  );
}

void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vBase = world.xz;

  float damp = smoothstep(0.0, 2.2, uLevel - aGround);
  vec2 d0 = uWindDir;
  vec2 d1 = rot2(uWindDir, 0.62);
  vec2 d2 = rot2(uWindDir, -0.95);
  world += waveDisp(vBase, d0, 27.0, 0.46 * uAmp * damp, 0.55);
  world += waveDisp(vBase, d1, 15.0, 0.26 * uAmp * damp, 0.75);
  world += waveDisp(vBase, d2, 8.5, 0.13 * uAmp * damp, 0.9);

  vWorld = world;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>

uniform float uPhase;
uniform float uLevel;
uniform float uAmp;
uniform float uChop;
uniform float uDay;
uniform float uStorm;
uniform vec2 uWindDir;
uniform vec2 uGroundMin;
uniform vec2 uGroundSize;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform sampler2D uGround;

varying vec3 vWorld;
varying vec2 vBase;

vec2 rot2(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

// One Gerstner term packed as (dNormal.x, dNormal.z, dSlope, height) so four
// of them sum into a single accumulator carrying both the analytic normal and
// the surface height (GPU Gems 1, ch.1).
vec4 waveTerm(vec2 p, vec2 dir, float len, float amp, float steep) {
  float k = PI2 / len;
  float w = sqrt(9.81 * k) * 0.7;
  float ph = k * dot(dir, p) - uPhase * w;
  float c = cos(ph);
  float s = sin(ph);
  float ka = k * amp;
  return vec4(-dir.x * ka * c, -dir.y * ka * c, steep * uChop * ka * s, amp * s);
}

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.x, p.y, p.x) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 guv = clamp((vWorld.xz - uGroundMin) / uGroundSize, 0.0, 1.0);
  float ground = texture2D(uGround, guv).r;
  float depth = uLevel - ground;

  if (gl_FrontFacing) {
    float damp = smoothstep(0.0, 2.2, depth);
    vec3 toEye = cameraPosition - vWorld;
    float dist = length(toEye);
    vec3 V = toEye / max(dist, 0.001);
    // The 3.4 m ripple is below a pixel past ~30 m; fading it out is the only
    // thing keeping the far water from shimmering.
    float detail = 1.0 - smoothstep(30.0, 95.0, dist);
    // The 1.7 m ripple drops below a pixel even sooner, so it fades first.
    float detail2 = 1.0 - smoothstep(12.0, 45.0, dist);

    vec2 d0 = uWindDir;
    vec2 d1 = rot2(uWindDir, 0.62);
    vec2 d2 = rot2(uWindDir, -0.95);
    vec2 d3 = rot2(uWindDir, 1.7);
    vec2 d4 = rot2(uWindDir, -2.3);

    vec4 acc = waveTerm(vBase, d0, 27.0, 0.46 * uAmp * damp, 0.55);
    acc += waveTerm(vBase, d1, 15.0, 0.26 * uAmp * damp, 0.75);
    acc += waveTerm(vBase, d2, 8.5, 0.13 * uAmp * damp, 0.9);
    acc += waveTerm(vBase, d3, 3.4, 0.05 * uAmp * damp * detail, 0.9);
    // Fragment-only fifth octave: fine near-field texture the vertex swell
    // never needs to carry, and the surface the sparkle glint keys off.
    acc += waveTerm(vBase, d4, 1.7, 0.045 * uAmp * damp * detail2, 0.85);

    vec3 N = normalize(vec3(acc.x, 1.0 - acc.z, acc.y));
    float clearance = depth + acc.w;

    vec3 body = mix(uShallow, uDeep, smoothstep(0.25, 6.0, depth));
    body *= 0.12 + uDay * 0.95;

    vec3 R = reflect(-V, N);
    vec3 sky = mix(uHorizon, uZenith, pow(saturate(R.y), 0.55));
    float fres = mix(0.02, 1.0, pow(1.0 - saturate(dot(N, V)), 5.0));
    vec3 col = mix(body, sky, fres * (0.45 + 0.55 * uDay));

    float sunAmt = saturate(dot(R, uSunDir));
    // The 260 lobe rides the fine octave: a few pixels wide, so bloom picks
    // out individual glints without lifting the whole sea into the threshold.
    float glint = pow(sunAmt, 90.0 - 55.0 * uStorm) * 1.6
      + pow(sunAmt, 260.0) * 1.2 * detail2
      + pow(sunAmt, 8.0) * 0.06;
    col += uSunColor * glint * uDay;

    float n1 = vnoise(vBase * 0.32 + uWindDir * uPhase * 0.09);
    float n2 = vnoise(vBase * 1.05 - uWindDir * uPhase * 0.22);
    float band = 1.0 - smoothstep(0.0, 0.85, max(clearance, 0.0));
    // Wider ramp than the shipped 0.42-0.9, with the noise inside it: the foam
    // line gains a soft, ragged edge instead of tracing a level contour.
    float foam = smoothstep(0.34, 0.98, band * (0.55 + 0.65 * n1 + 0.18 * n2));
    foam = max(foam, 1.0 - smoothstep(0.0, 0.2 + 0.12 * n1, max(clearance, 0.0)));
    float caps = smoothstep(0.55, 0.95, acc.w / max(0.45 * uAmp, 0.001));
    foam = saturate(foam + caps * uStorm * (0.3 + 0.5 * n2) * damp);
    col = mix(col, uFoam * (0.2 + 0.85 * uDay), foam);

    float alpha = mix(0.6, 0.94, smoothstep(0.0, 3.5, depth));
    alpha *= smoothstep(-0.04, 0.45, clearance);
    gl_FragColor = vec4(col, max(alpha, foam * 0.85));
  } else {
    // Waded in: seen from below there is no sky term, just murk.
    gl_FragColor = vec4(uDeep * (0.2 + 0.6 * uDay), 0.92);
  }

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/**
 * Kaguyahime Coast water: one plane, one ShaderMaterial, no reflection pass
 * and no lights. Sky agreement comes from the shared `atmosphere` record, so
 * the sea, the fog and the dome cannot drift apart across the day cycle.
 */
export function Water() {
  const geometry = useMemo(buildGeometry, []);
  const groundTex = useMemo(buildGroundTexture, []);
  const phase = useRef(0);

  const uniforms = useMemo(
    () => ({
      uPhase: { value: 0 },
      uLevel: { value: SEA_LEVEL },
      uAmp: { value: 0.6 },
      uChop: { value: 0.6 },
      uDay: { value: atmosphere.dayFactor },
      uStorm: { value: atmosphere.storminess },
      uWindDir: { value: new THREE.Vector2(0.86, 0.5) },
      uGroundMin: { value: new THREE.Vector2(MIN_X, MIN_Z) },
      uGroundSize: { value: new THREE.Vector2(MAX_X - MIN_X, MAX_Z - MIN_Z) },
      uSunDir: { value: atmosphere.sunDir.clone() },
      uSunColor: { value: atmosphere.sunColor.clone() },
      uHorizon: { value: atmosphere.horizon.clone() },
      uZenith: { value: atmosphere.zenith.clone() },
      uDeep: { value: new THREE.Color("#2a0812") },
      uShallow: { value: new THREE.Color("#8a2130") },
      uFoam: { value: new THREE.Color("#f2ccc0") },
      uGround: { value: groundTex },
      // Declared so the renderer's fog refresh has somewhere to write; the
      // built-in chunks then keep the sea on exactly the scene's fog curve.
      fogColor: { value: new THREE.Color("#3a2218") },
      fogNear: { value: 20 },
      fogFar: { value: 150 },
      fogDensity: { value: 0.00025 },
    }),
    [groundTex],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        fog: true,
        side: THREE.DoubleSide,
      }),
    [uniforms],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      groundTex.dispose();
    };
  }, [geometry, material, groundTex]);

  useFrame((_, delta) => {
    if (useGameStore.getState().phase === "paused") return;
    const d = Math.min(delta, 0.05);
    const storm = atmosphere.storminess;

    // Phase is accumulated rather than derived from elapsed time so a change
    // in swell speed eases in instead of snapping the whole surface.
    phase.current += d * (0.85 + storm * 0.75);
    uniforms.uPhase.value = phase.current;
    uniforms.uAmp.value = 0.55 + storm * 1.25;
    uniforms.uChop.value = 0.55 + storm * 0.4;
    uniforms.uDay.value = atmosphere.dayFactor;
    uniforms.uStorm.value = storm;
    uniforms.uSunDir.value.copy(atmosphere.sunDir);
    uniforms.uSunColor.value.copy(atmosphere.sunColor);
    uniforms.uHorizon.value.copy(atmosphere.horizon);
    uniforms.uZenith.value.copy(atmosphere.zenith);

    const wind = atmosphere.wind;
    const len = Math.hypot(wind.x, wind.y);
    if (len > 1e-3) uniforms.uWindDir.value.set(wind.x / len, wind.y / len);
  });

  // renderOrder -1: the sea is the backmost transparent in the scene, so it has
  // to draw before rain and the haze shells rather than sorting against them by
  // the centre of a 400 m plane.
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, SEA_LEVEL, 0]}
      renderOrder={-1}
    />
  );
}
