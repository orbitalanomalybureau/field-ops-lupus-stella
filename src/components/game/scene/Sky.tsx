import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useGameStore } from "@/game/store";

export function Sky() {
  const sun = useRef<THREE.Mesh>(null);
  const starsRef = useRef<THREE.Points>(null);

  const starPos = useMemo(() => {
    const n = 900;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.45;
      const r = 220;
      a[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      a[i * 3 + 1] = Math.cos(ph) * r * 0.55 + 40;
      a[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    }
    return a;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.008;
    const tod = 0.55 + Math.sin(t) * 0.08;
    useGameStore.getState().setTimeOfDay(tod);
    if (sun.current) {
      sun.current.position.set(
        Math.cos(t) * 90,
        28 + Math.sin(t) * 12,
        -40 + Math.sin(t) * 20,
      );
    }
    if (starsRef.current) {
      const mat = starsRef.current.material as THREE.PointsMaterial;
      mat.opacity = 0.25 + (1 - tod) * 0.55;
    }
  });

  return (
    <group>
      {/* Gradient sky dome via large hemisphere */}
      <mesh>
        <sphereGeometry args={[300, 48, 32]} />
        <meshBasicMaterial side={THREE.BackSide} color="#3a2014" />
      </mesh>
      <mesh position={[0, 40, -80]}>
        <sphereGeometry args={[90, 24, 16]} />
        <meshBasicMaterial color="#8a4020" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <mesh ref={sun} position={[40, 35, -50]}>
        <sphereGeometry args={[6, 16, 16]} />
        <meshBasicMaterial color="#ffb070" />
      </mesh>
      <points ref={starsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffe8d0"
          size={0.55}
          sizeAttenuation
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
