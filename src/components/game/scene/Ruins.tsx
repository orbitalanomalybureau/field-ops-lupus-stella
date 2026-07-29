import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useGameStore } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";

export function Ruins({
  position,
}: {
  position: readonly [number, number, number];
}) {
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const glyphs = useRef<THREE.Group>(null);
  const y = sampleHeight(position[0], position[2]);
  const opened = useGameStore((s) => s.ruinOpened);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (glow.current) {
      glow.current.emissiveIntensity = 0.55 + Math.sin(t * 1.3) * 0.35;
    }
    if (ring.current) ring.current.rotation.y = t * 0.2;
    if (glyphs.current) {
      glyphs.current.children.forEach((c, i) => {
        (c as THREE.Mesh).position.y = 2.2 + Math.sin(t * 1.5 + i) * 0.08;
      });
    }
  });

  return (
    <group position={[position[0], y, position[2]]}>
      {/* Pedestal */}
      <mesh castShadow receiveShadow position={[0, 0.5, 0]} rotation={[0.04, 0.35, 0]}>
        <boxGeometry args={[7, 1, 4.5]} />
        <meshStandardMaterial
          ref={glow}
          color="#12161c"
          metalness={0.9}
          roughness={0.18}
          emissive="#2a5070"
          emissiveIntensity={0.6}
        />
      </mesh>

      {/* Broken columns */}
      {[
        [-4, -2.5, 4.5],
        [4, -2.5, 4.2],
        [-3.5, 2.5, 3.2],
        [3.8, 2.2, 2.8],
      ].map(([x, z, h], i) => (
        <mesh key={i} castShadow position={[x, h / 2, z]}>
          <cylinderGeometry args={[0.45, 0.55, h, 8]} />
          <meshStandardMaterial color="#141820" metalness={0.75} roughness={0.3} />
        </mesh>
      ))}

      {/* Arch */}
      <mesh castShadow position={[-3.8, 3.2, -2.2]}>
        <boxGeometry args={[0.65, 6.4, 0.65]} />
        <meshStandardMaterial color="#151820" metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[3.8, 3.2, -2.2]}>
        <boxGeometry args={[0.65, 6.4, 0.65]} />
        <meshStandardMaterial color="#151820" metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[0, 6.5, -2.2]} rotation={[0, 0, 0.02]}>
        <boxGeometry args={[8.4, 0.7, 0.7]} />
        <meshStandardMaterial color="#151820" metalness={0.75} roughness={0.3} />
      </mesh>

      <group ref={glyphs}>
        {[-2.2, 0, 2.2].map((x, i) => (
          <mesh key={i} position={[x, 2.2, -1.8]}>
            <planeGeometry args={[1.5, 2.4]} />
            <meshStandardMaterial
              color="#0a1018"
              emissive={opened ? "#3d9e8f" : "#305070"}
              emissiveIntensity={opened ? 1.1 : 0.45}
              metalness={0.55}
              roughness={0.35}
            />
          </mesh>
        ))}
      </group>

      <mesh ref={ring} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.5, 6.1, 64]} />
        <meshBasicMaterial
          color="#3d9e8f"
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Inner chamber light shaft */}
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[1.2, 2.5, 8, 16, 1, true]} />
        <meshBasicMaterial
          color="#4a90c0"
          transparent
          opacity={opened ? 0.18 : 0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <pointLight
        position={[0, 3.5, 0]}
        color="#5a9acc"
        intensity={opened ? 14 : 5}
        distance={28}
      />
      <pointLight position={[0, 1, 2]} color="#3d9e8f" intensity={3} distance={12} />
    </group>
  );
}
