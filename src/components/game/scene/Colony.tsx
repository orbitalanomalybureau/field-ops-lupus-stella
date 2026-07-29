import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ENTITIES, entitiesOfKind } from "@/game/entities";
import { sampleHeight } from "@/game/worldHeight";

/**
 * Only the southern pair rakes shadows across the dome cluster; three shadow
 * maps for the same set piece is not worth the fill cost.
 */
const SHADOW_TOWERS = new Set(["tower-south-west", "tower-south-east"]);

const CARVER = ENTITIES.find((e) => e.id === "carver-marker");

function Dome({ x, z }: { x: number; z: number }) {
  const y = sampleHeight(x, z);
  return (
    <group position={[x, y, z]}>
      {/* Interior warm glow is emissive, not a dynamic light */}
      <mesh castShadow receiveShadow position={[0, 2.3, 0]}>
        <sphereGeometry args={[4.3, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#3a4656"
          emissive="#ffc090"
          emissiveIntensity={0.25}
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
    </group>
  );
}

function Generator({ x, z }: { x: number; z: number }) {
  const y = sampleHeight(x, z);
  return (
    <group position={[x, y, z]}>
      <mesh castShadow position={[0, 1.5, 0]}>
        <cylinderGeometry args={[1.15, 1.35, 3, 14]} />
        <meshStandardMaterial color="#2c333c" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2.55, 0]}>
        <torusGeometry args={[1.4, 0.14, 10, 28]} />
        <meshStandardMaterial
          color="#3d9e8f"
          emissive="#3d9e8f"
          emissiveIntensity={1.8}
          metalness={0.65}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[1.6, 1.7, 0.25, 14]} />
        <meshStandardMaterial color="#1e242c" metalness={0.5} />
      </mesh>
    </group>
  );
}

function LightTower({
  x,
  z,
  shadow = false,
}: {
  x: number;
  z: number;
  shadow?: boolean;
}) {
  const y = sampleHeight(x, z);
  return (
    <group position={[x, y, z]}>
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
        castShadow={shadow}
      />
    </group>
  );
}

export function Colony() {
  const fenceRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

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

  useLayoutEffect(() => {
    if (!fenceRef.current) return;
    fencePosts.forEach((p, i) => {
      dummy.position.set(p[0], p[1] + 1.1, p[2]);
      dummy.updateMatrix();
      fenceRef.current!.setMatrixAt(i, dummy.matrix);
    });
    fenceRef.current.instanceMatrix.needsUpdate = true;
    fenceRef.current.computeBoundingSphere();
  }, [fencePosts, dummy]);

  return (
    <group>
      {entitiesOfKind("dome").map((e) => (
        <Dome key={e.id} x={e.x} z={e.z} />
      ))}

      {entitiesOfKind("generator").map((e) => (
        <Generator key={e.id} x={e.x} z={e.z} />
      ))}

      {entitiesOfKind("tower").map((e) => (
        <LightTower key={e.id} x={e.x} z={e.z} shadow={SHADOW_TOWERS.has(e.id)} />
      ))}

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
      {CARVER && (
        <group position={[CARVER.x, sampleHeight(CARVER.x, CARVER.z), CARVER.z]}>
          <mesh castShadow position={[0, 0.75, 0]}>
            <boxGeometry args={[0.38, 1.5, 0.12]} />
            <meshStandardMaterial color="#5a5048" />
          </mesh>
          <mesh position={[0, 1.65, 0.08]}>
            <planeGeometry args={[1, 0.4]} />
            <meshBasicMaterial color="#9a9080" side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}

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

      <instancedMesh
        ref={fenceRef}
        args={[undefined, undefined, fencePosts.length]}
        castShadow
      >
        <cylinderGeometry args={[0.07, 0.09, 2.2, 6]} />
        <meshStandardMaterial color="#3a424a" metalness={0.35} />
      </instancedMesh>

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
