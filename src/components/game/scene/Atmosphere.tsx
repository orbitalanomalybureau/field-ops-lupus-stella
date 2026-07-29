import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export function Atmosphere() {
  const rainRef = useRef<THREE.Points>(null);
  const dustRef = useRef<THREE.Points>(null);
  const count = 2200;
  const dustCount = 400;

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 180;
      positions[i * 3 + 1] = Math.random() * 45;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 220 + 50;
      velocities[i] = 10 + Math.random() * 14;
    }
    return { positions, velocities };
  }, []);

  const dustPos = useMemo(() => {
    const a = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      a[i * 3] = (Math.random() - 0.5) * 100;
      a[i * 3 + 1] = 0.5 + Math.random() * 8;
      a[i * 3 + 2] = 20 + Math.random() * 140;
    }
    return a;
  }, []);

  useFrame((_, delta) => {
    const pts = rainRef.current;
    if (pts) {
      const arr = pts.geometry.attributes.position.array as Float32Array;
      const d = Math.min(delta, 0.05);
      for (let i = 0; i < count; i++) {
        arr[i * 3 + 1]! -= velocities[i]! * d;
        arr[i * 3]! += d * 2.2;
        if (arr[i * 3 + 1]! < 0) {
          arr[i * 3 + 1] = 28 + Math.random() * 20;
          arr[i * 3] = (Math.random() - 0.5) * 180;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 220 + 50;
        }
      }
      pts.geometry.attributes.position.needsUpdate = true;
    }
    if (dustRef.current) {
      dustRef.current.rotation.y += delta * 0.02;
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
          size={0.07}
          transparent
          opacity={0.32}
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
          size={0.35}
          transparent
          opacity={0.15}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
}
