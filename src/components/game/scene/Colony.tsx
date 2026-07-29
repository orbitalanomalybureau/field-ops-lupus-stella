import { useMemo } from "react";
import * as THREE from "three";
import { sampleHeight } from "@/game/worldHeight";

function Dome({ position }: { position: [number, number, number] }) {
  const y = sampleHeight(position[0], position[2]);
  return (
    <group position={[position[0], y, position[2]]}>
      <mesh castShadow receiveShadow position={[0, 2.3, 0]}>
        <sphereGeometry args={[4.3, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#3a4656"
          roughness={0.35}
          metalness={0.45}
          transparent
          opacity={0.92}
          clearcoat={0.35}
          clearcoatRoughness={0.4}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[4.4, 4.6, 0.28, 28]} />
        <meshStandardMaterial color="#2a3038" metalness={0.45} roughness={0.55} />
      </mesh>
      {/* Interior warm glow */}
      <pointLight position={[0, 2, 0]} color="#ffc090" intensity={4} distance={10} />
    </group>
  );
}

function Generator({ position }: { position: [number, number, number] }) {
  const y = sampleHeight(position[0], position[2]);
  return (
    <group position={[position[0], y, position[2]]}>
      <mesh castShadow position={[0, 1.5, 0]}>
        <cylinderGeometry args={[1.15, 1.35, 3, 14]} />
        <meshStandardMaterial color="#2c333c" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2.55, 0]}>
        <torusGeometry args={[1.4, 0.14, 10, 28]} />
        <meshStandardMaterial
          color="#3d9e8f"
          emissive="#3d9e8f"
          emissiveIntensity={0.85}
          metalness={0.65}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[1.6, 1.7, 0.25, 14]} />
        <meshStandardMaterial color="#1e242c" metalness={0.5} />
      </mesh>
      <pointLight position={[0, 3.2, 0]} color="#3d9e8f" intensity={4} distance={14} />
    </group>
  );
}

function LightTower({ position }: { position: [number, number, number] }) {
  const y = sampleHeight(position[0], position[2]);
  return (
    <group position={[position[0], y, position[2]]}>
      <mesh castShadow position={[0, 4.2, 0]}>
        <cylinderGeometry args={[0.16, 0.24, 8.4, 8]} />
        <meshStandardMaterial color="#3a4048" metalness={0.55} roughness={0.45} />
      </mesh>
      <mesh position={[0, 8.5, 0]}>
        <boxGeometry args={[0.9, 0.55, 0.9]} />
        <meshStandardMaterial
          color="#fff4e0"
          emissive="#ffcc88"
          emissiveIntensity={1.6}
        />
      </mesh>
      <spotLight
        position={[0, 8.3, 0]}
        angle={0.5}
        penumbra={0.55}
        intensity={55}
        distance={55}
        color="#ffe0b0"
        castShadow
      />
    </group>
  );
}

export function Colony() {
  const fencePosts = useMemo(() => {
    const posts: [number, number, number][] = [];
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2;
      const r = 48;
      const x = Math.cos(a) * r;
      const z = 8 + Math.sin(a) * r * 0.85;
      posts.push([x, sampleHeight(x, z), z]);
    }
    return posts;
  }, []);

  return (
    <group>
      <Dome position={[0, 0, 6]} />
      <Dome position={[-14, 0, 2]} />
      <Dome position={[14, 0, 4]} />
      <Dome position={[-8, 0, 18]} />
      <Dome position={[10, 0, 16]} />

      <Generator position={[-22, 0, 12]} />
      <Generator position={[22, 0, 10]} />
      <Generator position={[-12, 0, -8]} />
      <Generator position={[16, 0, -6]} />

      <LightTower position={[-35, 0, 35]} />
      <LightTower position={[35, 0, 35]} />
      <LightTower position={[0, 0, 42]} />
      <LightTower position={[-28, 0, -5]} />
      <LightTower position={[28, 0, -5]} />

      <mesh
        castShadow
        receiveShadow
        position={[4, sampleHeight(4, 22) + 1.25, 22]}
      >
        <boxGeometry args={[9, 2.5, 5.5]} />
        <meshStandardMaterial color="#3d4650" metalness={0.25} roughness={0.65} />
      </mesh>

      {/* Command antenna */}
      <mesh position={[4, sampleHeight(4, 22) + 4, 22]}>
        <cylinderGeometry args={[0.08, 0.1, 3, 6]} />
        <meshStandardMaterial color="#5a6570" metalness={0.6} />
      </mesh>

      {/* Carver marker */}
      <group position={[6, sampleHeight(6, 38), 38]}>
        <mesh castShadow position={[0, 0.75, 0]}>
          <boxGeometry args={[0.38, 1.5, 0.12]} />
          <meshStandardMaterial color="#5a5048" />
        </mesh>
        <mesh position={[0, 1.65, 0.08]}>
          <planeGeometry args={[1, 0.4]} />
          <meshBasicMaterial color="#9a9080" side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* South gate */}
      {[-3.8, 3.8].map((x) => (
        <mesh
          key={x}
          castShadow
          position={[x, sampleHeight(x, 42) + 1.9, 42]}
        >
          <boxGeometry args={[0.45, 3.8, 0.45]} />
          <meshStandardMaterial color="#4a5560" metalness={0.45} />
        </mesh>
      ))}
      <mesh position={[0, sampleHeight(0, 42) + 3.7, 42]}>
        <boxGeometry args={[8, 0.25, 0.3]} />
        <meshStandardMaterial
          color="#3d9e8f"
          emissive="#3d9e8f"
          emissiveIntensity={0.4}
        />
      </mesh>

      {fencePosts.map((p, i) => (
        <mesh key={i} castShadow position={[p[0], p[1] + 1.1, p[2]]}>
          <cylinderGeometry args={[0.07, 0.09, 2.2, 6]} />
          <meshStandardMaterial color="#3a424a" metalness={0.35} />
        </mesh>
      ))}

      {[
        [-6, 12],
        [-4.2, 13.5],
        [8, 11],
        [9.5, 12.2],
      ].map(([x, z], i) => (
        <mesh
          key={i}
          castShadow
          receiveShadow
          position={[x, sampleHeight(x, z) + 0.5, z]}
        >
          <boxGeometry args={[1.15, 1, 1.15]} />
          <meshStandardMaterial color="#4a3f32" roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}
