import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { WORLD } from "@/game/data";
import { useGameStore } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";

function RidgeCache() {
  const looted = useGameStore((s) => s.cachesLooted.includes("cache-r"));
  const x = -95;
  const z = 40;
  const y = sampleHeight(x, z);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current && !looted) {
      ref.current.position.y = y + 0.5 + Math.sin(clock.elapsedTime * 2) * 0.08;
      ref.current.rotation.y = clock.elapsedTime * 0.5;
    }
  });
  if (looted) return null;
  return (
    <mesh ref={ref} castShadow position={[x, y + 0.5, z]}>
      <boxGeometry args={[0.65, 0.4, 0.45]} />
      <meshStandardMaterial
        color="#c45c2a"
        emissive="#c45c2a"
        emissiveIntensity={1.4}
        metalness={0.4}
      />
    </mesh>
  );
}

export function Ridge7() {
  const planted = useGameStore((s) => s.ridgeBeaconPlanted);
  const beacon = useRef<THREE.Group>(null);
  const pulse = useRef<THREE.MeshStandardMaterial>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const rocks = useMemo(() => {
    const out: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const x = -70 - t * 55 + Math.sin(i * 1.7) * 8;
      const z = 20 + t * 55 + Math.cos(i * 2.1) * 10;
      out.push({ x, z, s: 0.8 + (i % 5) * 0.35 });
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    if (!rockRef.current) return;
    rocks.forEach((r, i) => {
      const y = sampleHeight(r.x, r.z);
      dummy.position.set(r.x, y + r.s * 0.4, r.z);
      dummy.rotation.set(0, r.x * 0.2, 0.05);
      dummy.scale.setScalar(r.s);
      dummy.updateMatrix();
      rockRef.current!.setMatrixAt(i, dummy.matrix);
    });
    rockRef.current.instanceMatrix.needsUpdate = true;
    rockRef.current.computeBoundingSphere();
  }, [rocks, dummy]);

  useFrame(({ clock }) => {
    if (pulse.current) {
      pulse.current.emissiveIntensity =
        1.8 + Math.sin(clock.elapsedTime * 2.5) * 1.1;
    }
    if (beacon.current && planted) {
      beacon.current.rotation.y = clock.elapsedTime * 0.4;
    }
  });

  const bx = WORLD.ridgeOverlook[0];
  const bz = WORLD.ridgeOverlook[2];
  const by = sampleHeight(bx, bz);

  const posts = useMemo(() => {
    const p: [number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      p.push([-35 - t * 75, 30 + t * 30]);
    }
    return p;
  }, []);

  return (
    <group>
      <instancedMesh
        ref={rockRef}
        args={[undefined, undefined, rocks.length]}
        castShadow
        receiveShadow
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#2a2e34"
          roughness={0.92}
          metalness={0.08}
          flatShading
        />
      </instancedMesh>

      <mesh
        castShadow
        receiveShadow
        position={[bx, by + 0.15, bz]}
        rotation={[-Math.PI / 2, 0, 0.1]}
      >
        <circleGeometry args={[6, 20]} />
        <meshStandardMaterial color="#3a4048" roughness={0.85} metalness={0.2} />
      </mesh>

      <group ref={beacon} position={[bx, by, bz]}>
        <mesh castShadow position={[0, 2.5, 0]}>
          <cylinderGeometry args={[0.12, 0.18, 5, 8]} />
          <meshStandardMaterial color="#3a4550" metalness={0.5} />
        </mesh>
        {/* Emissive only — Bloom carries the glow without a dynamic light. */}
        <mesh position={[0, 5.2, 0]}>
          <boxGeometry args={[0.8, 0.4, 0.8]} />
          <meshStandardMaterial
            ref={pulse}
            color={planted ? "#3d9e8f" : "#c45c2a"}
            emissive={planted ? "#3d9e8f" : "#c45c2a"}
            emissiveIntensity={1.8}
          />
        </mesh>
        <Html
          distanceFactor={30}
          position={[0, 6.5, 0]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div
            className={`whitespace-nowrap rounded-sm border bg-void/85 px-2 py-0.5 font-mono text-[10px] ${
              planted
                ? "border-accent/40 text-accent"
                : "border-primary/50 text-primary-glow"
            }`}
          >
            {planted ? "RIDGE-7 ONLINE" : "PLANT BEACON · E"}
          </div>
        </Html>
      </group>

      <mesh position={[-160, 18, 80]}>
        <planeGeometry args={[80, 24]} />
        <meshBasicMaterial
          color="#4a2030"
          transparent
          opacity={0.25}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {posts.map(([x, z], i) => {
        const y = sampleHeight(x, z);
        return (
          <mesh key={i} castShadow position={[x, y + 0.5, z]}>
            <cylinderGeometry args={[0.1, 0.14, 1, 6]} />
            <meshStandardMaterial
              color="#2a6b61"
              emissive="#3d9e8f"
              emissiveIntensity={1.4}
            />
          </mesh>
        );
      })}

      <RidgeCache />
    </group>
  );
}
