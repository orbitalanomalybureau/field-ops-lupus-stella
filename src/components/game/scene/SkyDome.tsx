import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { atmosphere } from "@/game/atmosphere";
import { useGameStore } from "@/game/store";

/**
 * Height of the mist layer's base, and the metres over which its density drops
 * by 1/e. At 0.13 the air above Ridge-7's 14 m crest carries ~16% of the valley
 * density, which is the whole point of the ridge: you climb out of the weather.
 */
const FOG_BASE_Y = 1;
const FOG_FALLOFF = 0.13;

/**
 * Height fog, installed globally by rewriting three's four fog chunks.
 *
 * The scene's materials live in files this module does not own, so per-material
 * `onBeforeCompile` is not available — patching the shared chunks reaches every
 * fogged material (standard, basic, points) at once, and costs one varying.
 *
 * `fogNear` / `fogFar` keep their weather-driven meaning as distances; they are
 * converted to an extinction coefficient here rather than driving a smoothstep,
 * because the density has to be integrated along the ray to get height falloff.
 * The colour still comes straight from `scene.fog.color`, which DayNight copies
 * from `atmosphere.fog` — that is what stops the horizon from seaming.
 */
let heightFogInstalled = false;

function installHeightFog(): void {
  if (heightFogInstalled) return;
  heightFogInstalled = true;

  THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogWorldY;
#endif
`;

  // `mvPosition` is the only thing in scope at this point in every stock vertex
  // shader — sprites and skinned meshes have no usable `transformed` — so world
  // height is recovered by rotating the view-space offset back with the second
  // row of the (rigid, therefore orthonormal) view matrix.
  THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldY = dot( viewMatrix[ 1 ].xyz, mvPosition.xyz ) + cameraPosition.y;
#endif
`;

  THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogWorldY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;

  THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogAtten = fogDensity;
    float fogDist = vFogDepth;
  #else
    float fogAtten = 1.9 / max( 1.0, fogFar - fogNear );
    float fogDist = max( 0.0, vFogDepth - fogNear * 0.5 );
  #endif

  // Optical depth of an exponentially stratified medium along the view ray,
  // integrated analytically: eye density x the slab factor over the ray's
  // vertical span. The clamps keep it finite when the camera drops below the
  // coast shelf or looks down off the ridge.
  float fogEye = min( exp( - ${FOG_FALLOFF.toFixed(3)} * ( cameraPosition.y - ${FOG_BASE_Y.toFixed(1)} ) ), 3.0 );
  float fogKd = ${FOG_FALLOFF.toFixed(3)} * ( vFogWorldY - cameraPosition.y );
  float fogSlab = abs( fogKd ) > 1e-4 ? min( ( 1.0 - exp( - fogKd ) ) / fogKd, 16.0 ) : 1.0;
  float fogFactor = 1.0 - exp( - fogAtten * fogDist * fogEye * fogSlab );

  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, clamp( fogFactor, 0.0, 1.0 ) );
#endif
`;
}

installHeightFog();

const SKY_VERT = /* glsl */ `
varying vec3 vDir;

void main() {
  // Exact view ray even though the dome's rig tracks the camera a frame late.
  vDir = ( modelMatrix * vec4( position, 1.0 ) ).xyz - cameraPosition;

  // Pinned to the far plane so the dome early-Zs against every pixel the world
  // already covered — it shades sky only — and can never z-fight the terrain
  // that runs past the 420 m far plane.
  vec4 clip = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = clip.xyww;
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uDay;
uniform float uStorm;
uniform vec2 uCloudDrift;

varying vec3 vDir;

float hash21( vec2 p ) {
  p = fract( p * vec2( 127.31, 311.7 ) );
  p += dot( p, p + 34.53 );
  return fract( p.x * p.y );
}

float vnoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = hash21( i );
  float b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) );
  float d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

float fbm( vec2 p ) {
  float v = 0.0;
  float a = 0.5;
  for ( int i = 0; i < 4; i ++ ) {
    v += a * vnoise( p );
    p = p * 2.07 + 19.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize( vDir );

  // The 0.42 exponent holds a wide band of horizon colour, so fully fogged
  // terrain dissolves into the sky instead of meeting it at a line.
  vec3 sky = mix( uHorizon, uZenith, pow( clamp( dir.y, 0.0, 1.0 ), 0.42 ) );
  sky = mix( sky, uHorizon * 0.42, clamp( - dir.y * 3.5, 0.0, 1.0 ) );

  // Scatter lobe. It widens as the sun drops, which is what makes dawn and dusk
  // bleed along the horizon rather than switch to a dusk colour.
  float sd = max( dot( dir, uSunDir ), 0.0 );
  float low = 1.0 - clamp( uSunDir.y * 2.2, 0.0, 1.0 );
  float lobe = pow( sd, 3.0 ) * ( 0.22 + 0.75 * low ) + pow( sd, 48.0 ) * 0.85;
  float above = clamp( uSunDir.y * 3.0 + 0.35, 0.0, 1.0 );
  sky += uSunColor * lobe * above * ( 1.0 - uStorm * 0.7 );

  // Clouds are skipped below the horizon; the branch is screen-coherent and
  // saves the whole FBM on the lower half of a typical vista.
  float band = smoothstep( 0.015, 0.30, dir.y );
  if ( band > 0.001 ) {
    vec2 cp = dir.xz / max( dir.y, 0.06 ) * 0.22 + uCloudDrift;
    float warp = vnoise( cp * 0.6 + uCloudDrift * 0.4 );
    float n = fbm( cp + warp * 0.7 );
    float cover = mix( 0.66, 0.24, uStorm );
    float dens = smoothstep( cover, cover + 0.26, n ) * band;

    vec3 bright = mix( uHorizon, uSunColor, 0.35 ) * ( 0.75 + 0.9 * uDay );
    vec3 dark = mix( uZenith, vec3( 0.02, 0.022, 0.028 ), 0.55 );
    vec3 cloud = mix( bright, dark, clamp( uStorm * 0.85 + ( 1.0 - n ) * 0.35, 0.0, 1.0 ) );
    cloud += uSunColor * pow( sd, 8.0 ) * 0.5 * ( 1.0 - uStorm * 0.5 );

    sky = mix( sky, cloud, dens * ( 0.55 + 0.45 * uStorm ) );
  }

  gl_FragColor = vec4( sky, 1.0 );

  // No tone mapping: three applies fog after tonemapping and after the colour
  // space transform, so the dome has to take the same path for the horizon and
  // the fog to land on the same value.
  #include <colorspace_fragment>
}
`;

/**
 * Sky, sun, moon and stars, all parented to a rig that tracks the camera so
 * nothing swims as the operative walks. Replaces the flat BackSide sphere and
 * the transparent haze sphere that used to snap between four hex values.
 */
export function SkyDome() {
  const rig = useRef<THREE.Group>(null);
  const sunDisc = useRef<THREE.Mesh>(null);
  const moonDisc = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.Points>(null);
  const drift = useMemo(() => new THREE.Vector2(), []);

  const sky = useMemo(() => {
    const uniforms = {
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uDay: { value: 0.6 },
      uStorm: { value: 0 },
      uCloudDrift: { value: new THREE.Vector2() },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    // Radius only has to enclose the camera; depth comes from the vertex shader.
    const geometry = new THREE.SphereGeometry(200, 32, 16);
    return { uniforms, material, geometry };
  }, []);

  useEffect(() => {
    return () => {
      sky.material.dispose();
      sky.geometry.dispose();
    };
  }, [sky]);

  const starPos = useMemo(() => {
    const n = 1000;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.48;
      const r = 240;
      a[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      a[i * 3 + 1] = Math.cos(ph) * r * 0.55 + 30;
      a[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    }
    return a;
  }, []);

  useFrame((state, delta) => {
    const paused = useGameStore.getState().phase === "paused";
    const d = Math.min(delta, 0.05);

    if (rig.current) rig.current.position.copy(state.camera.position);

    if (!paused) {
      drift.addScaledVector(atmosphere.wind, d * 0.02);
    }

    const u = sky.uniforms;
    u.uHorizon.value.copy(atmosphere.horizon);
    u.uZenith.value.copy(atmosphere.zenith);
    u.uSunColor.value.copy(atmosphere.sunColor);
    u.uSunDir.value.copy(atmosphere.sunDir);
    u.uDay.value = atmosphere.dayFactor;
    u.uStorm.value = atmosphere.storminess;
    u.uCloudDrift.value.copy(drift);

    const elev = atmosphere.sunDir.y;
    const nightFactor = 1 - atmosphere.dayFactor;

    if (sunDisc.current) {
      sunDisc.current.position.copy(atmosphere.sunDir).multiplyScalar(170);
      const mat = sunDisc.current.material as THREE.MeshBasicMaterial;
      mat.color.copy(atmosphere.sunColor);
      mat.opacity =
        THREE.MathUtils.smoothstep(elev, -0.25, -0.02) *
        (1 - atmosphere.storminess * 0.75);
      sunDisc.current.visible = mat.opacity > 0.01;
    }

    if (moonDisc.current) {
      // Antipodal to the sun, so it is up exactly when the sun is down.
      moonDisc.current.position.copy(atmosphere.sunDir).multiplyScalar(-165);
      const mat = moonDisc.current.material as THREE.MeshBasicMaterial;
      mat.opacity =
        THREE.MathUtils.smoothstep(-elev, -0.12, 0.12) *
        0.9 *
        (1 - atmosphere.storminess * 0.8);
      moonDisc.current.visible = mat.opacity > 0.01;
    }

    if (stars.current) {
      const mat = stars.current.material as THREE.PointsMaterial;
      mat.opacity =
        THREE.MathUtils.smoothstep(nightFactor, 0.52, 0.78) *
        0.8 *
        (1 - atmosphere.storminess * 0.85);
      stars.current.visible = mat.opacity > 0.01;
    }
  });

  return (
    <group ref={rig}>
      {/* Opaque and last in the opaque pass, so the world's depth rejects it. */}
      <mesh
        geometry={sky.geometry}
        material={sky.material}
        renderOrder={900}
        frustumCulled={false}
      />

      {/* Negative render order keeps the celestials under the rain and dust. */}
      <points ref={stars} renderOrder={-10}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffe8d0"
          size={0.5}
          sizeAttenuation
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </points>

      <mesh ref={sunDisc} renderOrder={-9}>
        <sphereGeometry args={[6, 16, 12]} />
        <meshBasicMaterial
          color="#ffb070"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>

      <mesh ref={moonDisc} renderOrder={-9}>
        <sphereGeometry args={[6.5, 16, 12]} />
        <meshBasicMaterial
          color="#c8d0e0"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}
