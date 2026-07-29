import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { WORLD } from "@/game/data";
import { atmosphere } from "@/game/atmosphere";
import { useGameStore } from "@/game/store";

/**
 * Sky palette as three stops blended by solar elevation, not four hex values
 * picked by `if`. Dawn and dusk are the same stop approached from opposite
 * directions, which is what makes the transition continuous.
 */
const HORIZON_NIGHT = new THREE.Color("#111a2e");
const HORIZON_DUSK = new THREE.Color("#d2582a");
const HORIZON_DAY = new THREE.Color("#b06034");
const ZENITH_NIGHT = new THREE.Color("#04060e");
const ZENITH_DUSK = new THREE.Color("#2c1c3a");
const ZENITH_DAY = new THREE.Color("#33305c");
const SUN_NIGHT = new THREE.Color("#6a80b0");
const SUN_DUSK = new THREE.Color("#ff7a34");
const SUN_DAY = new THREE.Color("#ffc79a");

const STORM_TINT = new THREE.Color("#171b23");
const SCANNER_FOG = new THREE.Color("#12211f");
const AMB_NIGHT = new THREE.Color("#304060");
const AMB_DAY = new THREE.Color("#d09060");
const AMB_SCAN = new THREE.Color("#60a090");
const HEMI_NIGHT = new THREE.Color("#203050");
const HEMI_DAY = new THREE.Color("#c87840");

function blend3(
  out: THREE.Color,
  night: THREE.Color,
  dusk: THREE.Color,
  day: THREE.Color,
  wn: number,
  wu: number,
  wd: number,
): void {
  out.setRGB(
    night.r * wn + dusk.r * wu + day.r * wd,
    night.g * wn + dusk.g * wu + day.g * wd,
    night.b * wn + dusk.b * wu + day.b * wd,
  );
}

/**
 * Full day cycle driving lights and fog (28h-feel), and the single writer of
 * `atmosphere` — the sky dome, the fog colour and anything else that has to
 * agree with the horizon read that object instead of recomputing their own.
 * Mount this before every consumer so they read the current frame's values.
 */
export function DayNight() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const clockAcc = useRef(0);
  const todPublish = useRef(0);
  const storm = useRef(0);
  const fogNear = useRef(20);
  const fogFar = useRef(150);
  const bgColor = useMemo(() => new THREE.Color("#2a1812"), []);
  const lightDir = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    if (useGameStore.getState().phase === "paused") return;
    const d = Math.min(delta, 0.05);
    clockAcc.current += d;
    const tod = (0.28 + clockAcc.current / WORLD.dayLengthSec) % 1;
    todPublish.current += d;
    if (todPublish.current > 0.5) {
      todPublish.current = 0;
      useGameStore.getState().setTimeOfDay(tod);
    }

    const scanner = useGameStore.getState().scannerActive;
    const weather = useGameStore.getState().weather;
    const wi = useGameStore.getState().weatherIntensity;

    const elev = Math.sin(tod * Math.PI * 2 - Math.PI * 0.5);
    const dayFactor = THREE.MathUtils.clamp(elev * 0.5 + 0.5, 0, 1);
    const nightFactor = 1 - dayFactor;

    // Storminess is filtered rather than stepped: the weather sim switches kind
    // in one frame, and a hard cut in cloud coverage is very visible.
    const base =
      weather === "storm"
        ? 1
        : weather === "rain"
          ? 0.55
          : weather === "haze"
            ? 0.28
            : 0.08;
    const stormTarget = THREE.MathUtils.clamp(base * (0.6 + wi * 0.6), 0, 1);
    storm.current += (stormTarget - storm.current) * Math.min(1, d * 0.55);

    // True celestial direction — it dips below the horizon, so the disc sets and
    // the scatter lobe sinks with it. Keeps the original azimuth sweep so the
    // sun still crosses the part of the sky the world was lit for.
    const az = tod * Math.PI * 2;
    const cosEl = Math.sqrt(Math.max(0, 1 - elev * elev));
    const hx = Math.cos(az);
    const hz = Math.sin(az) * 0.44 - 0.22;
    const hl = Math.hypot(hx, hz) || 1;
    atmosphere.sunDir
      .set((hx / hl) * cosEl, elev, (hz / hl) * cosEl)
      .normalize();
    atmosphere.dayFactor = dayFactor;
    atmosphere.storminess = storm.current;

    const wDay = THREE.MathUtils.smoothstep(elev, 0.02, 0.4);
    const wNight = 1 - THREE.MathUtils.smoothstep(elev, -0.32, -0.02);
    const wDusk = Math.max(0, 1 - wDay - wNight);
    blend3(
      atmosphere.horizon,
      HORIZON_NIGHT,
      HORIZON_DUSK,
      HORIZON_DAY,
      wNight,
      wDusk,
      wDay,
    );
    blend3(
      atmosphere.zenith,
      ZENITH_NIGHT,
      ZENITH_DUSK,
      ZENITH_DAY,
      wNight,
      wDusk,
      wDay,
    );
    // The sun tint stays untinted by weather: the light already loses most of
    // its intensity in a storm, and the sky shader damps its own lobe.
    blend3(
      atmosphere.sunColor,
      SUN_NIGHT,
      SUN_DUSK,
      SUN_DAY,
      wNight,
      wDusk,
      wDay,
    );
    atmosphere.horizon.lerp(STORM_TINT, storm.current * 0.6);
    atmosphere.zenith.lerp(STORM_TINT, storm.current * 0.75);

    // Fog is the horizon pulled a little toward the zenith, so distant terrain
    // resolves into exactly the colour the dome paints behind it.
    atmosphere.fog.copy(atmosphere.horizon).lerp(atmosphere.zenith, 0.14);
    if (scanner) atmosphere.fog.lerp(SCANNER_FOG, 0.55);

    // Slow wander so grass, canopy and rain drift agree and still change.
    const angle =
      0.7 +
      Math.sin(clockAcc.current * 0.011) * 1.1 +
      Math.sin(clockAcc.current * 0.037) * 0.28;
    const mag = 0.3 + storm.current * 1.7;
    atmosphere.wind.set(Math.cos(angle) * mag, Math.sin(angle) * mag);

    if (sun.current) {
      // The shadow box is only ±60, so it rides the player instead of the
      // origin; the default light target is outside the scene graph, hence
      // the manual matrix update. Elevation is floored well above the horizon
      // — the sky's sun may set, but a shadow caster below it would light the
      // terrain from underneath.
      const p = useGameStore.getState().playerPos;
      const ly = Math.max(elev, 0.16);
      const lcos = Math.sqrt(Math.max(0, 1 - ly * ly));
      const hlen = Math.hypot(atmosphere.sunDir.x, atmosphere.sunDir.z) || 1;
      lightDir.set(
        (atmosphere.sunDir.x / hlen) * lcos,
        ly,
        (atmosphere.sunDir.z / hlen) * lcos,
      );
      sun.current.position.set(
        p.x + lightDir.x * 90,
        p.y + lightDir.y * 90,
        p.z + lightDir.z * 90,
      );
      sun.current.target.position.set(p.x, p.y, p.z);
      sun.current.target.updateMatrixWorld();
      let intensity = 0.15 + dayFactor * 1.75;
      if (weather === "storm") intensity *= 0.35;
      else if (weather === "rain") intensity *= 0.55;
      else if (weather === "haze") intensity *= 0.85;
      if (scanner) intensity *= 0.7;
      sun.current.intensity = intensity;
      sun.current.color.copy(atmosphere.sunColor);
    }

    if (amb.current) {
      amb.current.intensity =
        (scanner ? 0.3 : 0.2 + dayFactor * 0.35) *
        (weather === "storm" ? 0.6 : 1);
      if (scanner) amb.current.color.copy(AMB_SCAN);
      else amb.current.color.copy(AMB_NIGHT).lerp(AMB_DAY, dayFactor);
    }
    if (hemi.current) {
      hemi.current.intensity = 0.35 + dayFactor * 0.4;
      hemi.current.color.copy(HEMI_NIGHT).lerp(HEMI_DAY, dayFactor);
      hemi.current.groundColor.set("#1a2a22");
    }
    if (fill.current) {
      fill.current.intensity = 0.15 + nightFactor * 0.25;
    }

    // Weather still sets the visibility envelope; it is filtered here and then
    // read as a density by the height-fog chunk SkyDome installs.
    let nearT = scanner ? 14 : 20 + dayFactor * 8;
    let farT = scanner ? 85 : 120 + dayFactor * 50;
    if (weather === "storm") {
      nearT = 8;
      farT = 55 + (1 - wi) * 30;
    } else if (weather === "rain") {
      nearT = 14;
      farT = 90;
    }
    const k = Math.min(1, d * 0.7);
    fogNear.current += (nearT - fogNear.current) * k;
    fogFar.current += (farT - fogFar.current) * k;

    const fog = state.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = fogNear.current;
      fog.far = fogFar.current;
      fog.color.copy(atmosphere.fog);
    }

    // The dome covers every sky pixel, so this only ever shows on the frames
    // before it draws — keep it on the horizon so there is no flash.
    bgColor.copy(atmosphere.horizon);
    state.scene.background = bgColor;
  });

  return (
    <group>
      <ambientLight ref={amb} intensity={0.45} color="#d09060" />
      {/* normalBias: dawn and dusk now rake the terrain at ~9 degrees, where a
          depth-only bias acnes on ground that is near parallel to the light. */}
      <directionalLight
        ref={sun}
        castShadow
        intensity={1.6}
        color="#ffb070"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={5}
        shadow-camera-far={220}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-bias={-0.00025}
        shadow-normalBias={0.035}
        position={[55, 72, -25]}
      />
      <hemisphereLight ref={hemi} args={["#c87840", "#1a2a22", 0.7]} />
      <directionalLight
        ref={fill}
        position={[-40, 20, 60]}
        intensity={0.25}
        color="#4060a0"
      />
    </group>
  );
}
