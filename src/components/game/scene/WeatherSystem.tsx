import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGameStore } from "@/game/store";
import { QUALITY } from "@/game/quality";
import { atmosphere } from "@/game/atmosphere";
import { getLightningStrike } from "./useWeatherSim";

/** Park–Miller LCG. Golden screenshots depend on this exact stream. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const RAIN_BASE = 2800;
const DUST_BASE = 500;
/** Half-extent of the player-following rain volume, metres. */
const RAIN_HALF = 95;
const RAIN_TOP = 45;

/** Rain / storm particles and the lightning flash. Presentation only: the
 *  state machine lives in useWeatherSim, which runs even when this does not.
 *  The rain volume is parented to the player, so it rains on the ridge and
 *  the coast — not just inside the old fixed box around the colony. */
export function WeatherSystem() {
  const quality = useGameStore((s) => s.quality);
  const settings = QUALITY[quality];
  const count = Math.max(1, Math.round(RAIN_BASE * settings.particleScale));
  const dustCount = Math.max(1, Math.round(DUST_BASE * settings.particleScale));

  const rainRef = useRef<THREE.Points>(null);
  const dustRef = useRef<THREE.Points>(null);
  const volume = useRef<THREE.Group>(null);
  const flash = useRef<THREE.PointLight>(null);
  const lastStrike = useRef(getLightningStrike().id);
  /** Respawn jitter continues its own stream; never Math.random. */
  const respawn = useRef<(() => number) | null>(null);
  const speedMul = useRef(0.2);
  const rainOpacity = useRef(0.05);
  const dustOpacity = useRef(0.14);

  const { rainGeometry, velocities } = useMemo(() => {
    const rand = seeded(60301);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * RAIN_HALF * 2;
      positions[i * 3 + 1] = rand() * (RAIN_TOP + 6) - 6;
      positions[i * 3 + 2] = (rand() - 0.5) * RAIN_HALF * 2;
      velocities[i] = 12 + rand() * 18;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { rainGeometry: geometry, velocities };
  }, [count]);

  // Dust stays world-anchored over the colony plain: it is the settlement's
  // haze, not a personal cloud, and moving it would repaint golden shots.
  const dustGeometry = useMemo(() => {
    const rand = seeded(9973);
    const a = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      a[i * 3] = (rand() - 0.5) * 120;
      a[i * 3 + 1] = 0.4 + rand() * 10;
      a[i * 3 + 2] = 15 + rand() * 160;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(a, 3));
    return geometry;
  }, [dustCount]);

  useEffect(() => {
    return () => rainGeometry.dispose();
  }, [rainGeometry]);
  useEffect(() => {
    return () => dustGeometry.dispose();
  }, [dustGeometry]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const s = useGameStore.getState();
    if (s.phase === "paused") return;

    const kind = s.weather;
    const wi = s.weatherIntensity;
    if (!respawn.current) respawn.current = seeded(77143);
    const rand = respawn.current;

    if (volume.current) {
      const p = s.playerPos;
      volume.current.position.set(p.x, p.y, p.z);
    }

    const pts = rainRef.current;
    if (pts) {
      const arr = pts.geometry.attributes.position.array as Float32Array;
      const smooth = 1 - Math.exp(-2.5 * d);
      const speedTarget =
        kind === "storm"
          ? 2.2
          : kind === "rain"
            ? 1.3
            : kind === "haze"
              ? 0.2
              : 0.05;
      speedMul.current += (speedTarget - speedMul.current) * smooth;
      // Opacity rides the cross-lerped intensity so state changes glide.
      const opacityTarget =
        (kind === "storm"
          ? 0.55
          : kind === "rain"
            ? 0.42
            : kind === "haze"
              ? 0.08
              : 0.02) * THREE.MathUtils.clamp(0.5 + wi * 0.6, 0, 1);
      rainOpacity.current += (opacityTarget - rainOpacity.current) * smooth;
      const mat = pts.material as THREE.PointsMaterial;
      mat.opacity = rainOpacity.current;

      const wind = atmosphere.wind;
      const driftMul = 2.5 + atmosphere.storminess * 6;
      for (let i = 0; i < count; i++) {
        arr[i * 3 + 1]! -= velocities[i]! * d * speedMul.current;
        arr[i * 3]! += wind.x * driftMul * d;
        arr[i * 3 + 2]! += wind.y * driftMul * d;
        // Local coords: -6 keeps drops alive a little below the player's feet
        // so downhill slopes beside the ridge still read as rained-on.
        if (arr[i * 3 + 1]! < -6) {
          arr[i * 3 + 1] = RAIN_TOP * 0.65 + rand() * RAIN_TOP * 0.35;
          arr[i * 3] = (rand() - 0.5) * RAIN_HALF * 2;
          arr[i * 3 + 2] = (rand() - 0.5) * RAIN_HALF * 2;
        } else {
          if (arr[i * 3]! > RAIN_HALF) arr[i * 3] = -RAIN_HALF;
          else if (arr[i * 3]! < -RAIN_HALF) arr[i * 3] = RAIN_HALF;
          if (arr[i * 3 + 2]! > RAIN_HALF) arr[i * 3 + 2] = -RAIN_HALF;
          else if (arr[i * 3 + 2]! < -RAIN_HALF) arr[i * 3 + 2] = RAIN_HALF;
        }
      }
      pts.geometry.attributes.position.needsUpdate = true;
    }

    if (dustRef.current) {
      dustRef.current.rotation.y += d * (kind === "storm" ? 0.08 : 0.02);
      const dustTarget =
        kind === "clear" ? 0.08 : kind === "haze" ? 0.18 : 0.05;
      dustOpacity.current +=
        (dustTarget - dustOpacity.current) * (1 - Math.exp(-2.5 * d));
      const mat = dustRef.current.material as THREE.PointsMaterial;
      mat.opacity = dustOpacity.current;
    }

    if (flash.current) {
      if (kind === "storm") {
        const strike = getLightningStrike();
        if (strike.id !== lastStrike.current) {
          lastStrike.current = strike.id;
          flash.current.intensity = strike.power;
          flash.current.position.set(strike.x, strike.y, strike.z);
        } else {
          flash.current.intensity = THREE.MathUtils.lerp(
            flash.current.intensity,
            0,
            1 - Math.exp(-8 * d),
          );
        }
      } else {
        flash.current.intensity = 0;
      }
    }
  });

  return (
    <group>
      <group ref={volume}>
        <points ref={rainRef} geometry={rainGeometry}>
          <pointsMaterial
            color="#b0c8c4"
            size={0.08}
            transparent
            opacity={0.3}
            depthWrite={false}
            sizeAttenuation
          />
        </points>
      </group>
      <points ref={dustRef} geometry={dustGeometry}>
        <pointsMaterial
          color="#c47840"
          size={0.4}
          transparent
          opacity={0.14}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      {/* Existing dynamic light, not a new one: the strike flash. */}
      <pointLight
        ref={flash}
        color="#a0c0ff"
        intensity={0}
        distance={120}
        decay={1.5}
      />
    </group>
  );
}
