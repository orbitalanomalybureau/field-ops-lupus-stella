import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useGameStore } from "@/game/store";
import { getLightningStrike } from "./useWeatherSim";

/** Rain / storm particles and the lightning flash. Presentation only: the
 *  state machine lives in useWeatherSim, which runs even when this does not. */
export function WeatherSystem() {
  const rainRef = useRef<THREE.Points>(null);
  const dustRef = useRef<THREE.Points>(null);
  const flash = useRef<THREE.PointLight>(null);
  const count = 2800;
  const dustCount = 500;
  const lastStrike = useRef(getLightningStrike().id);

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = Math.random() * 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 240 + 40;
      velocities[i] = 12 + Math.random() * 18;
    }
    return { positions, velocities };
  }, []);

  const dustPos = useMemo(() => {
    const a = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      a[i * 3] = (Math.random() - 0.5) * 120;
      a[i * 3 + 1] = 0.4 + Math.random() * 10;
      a[i * 3 + 2] = 15 + Math.random() * 160;
    }
    return a;
  }, []);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    if (useGameStore.getState().phase === "paused") return;

    const kind = useGameStore.getState().weather;

    const pts = rainRef.current;
    if (pts) {
      const arr = pts.geometry.attributes.position.array as Float32Array;
      const speedMul =
        kind === "storm" ? 2.2 : kind === "rain" ? 1.3 : kind === "haze" ? 0.2 : 0.05;
      const mat = pts.material as THREE.PointsMaterial;
      mat.opacity =
        kind === "storm" ? 0.55 : kind === "rain" ? 0.38 : kind === "haze" ? 0.08 : 0.02;
      for (let i = 0; i < count; i++) {
        arr[i * 3 + 1]! -= velocities[i]! * d * speedMul;
        arr[i * 3]! += d * (kind === "storm" ? 6 : 2.5);
        if (arr[i * 3 + 1]! < 0) {
          arr[i * 3 + 1] = 30 + Math.random() * 25;
          arr[i * 3] = (Math.random() - 0.5) * 200;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 240 + 40;
        }
      }
      pts.geometry.attributes.position.needsUpdate = true;
    }

    if (dustRef.current) {
      dustRef.current.rotation.y += d * (kind === "storm" ? 0.08 : 0.02);
      const mat = dustRef.current.material as THREE.PointsMaterial;
      mat.opacity = kind === "clear" ? 0.08 : kind === "haze" ? 0.18 : 0.05;
    }

    if (flash.current) {
      if (kind === "storm") {
        const s = getLightningStrike();
        if (s.id !== lastStrike.current) {
          lastStrike.current = s.id;
          flash.current.intensity = s.power;
          flash.current.position.set(s.x, s.y, s.z);
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
      <points ref={rainRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#b0c8c4"
          size={0.08}
          transparent
          opacity={0.3}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      <points ref={dustRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dustPos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#c47840"
          size={0.4}
          transparent
          opacity={0.14}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
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
