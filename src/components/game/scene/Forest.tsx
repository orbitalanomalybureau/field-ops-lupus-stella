import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { WORLD } from "@/game/data";
import { useGameStore } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** 1 in deep night, 0 in full day, ramped across dawn and dusk. */
function nightFactor(tod: number) {
  const day =
    THREE.MathUtils.smoothstep(tod, 0.16, 0.3) *
    (1 - THREE.MathUtils.smoothstep(tod, 0.7, 0.84));
  return 1 - day;
}

export function Forest() {
  const treeData = useMemo(() => {
    const rand = seeded(42);
    const out: { x: number; z: number; s: number; r: number }[] = [];
    for (let i = 0; i < 42; i++) {
      const x = -75 + i * 3.7 + (rand() - 0.5) * 1.5;
      const z = WORLD.treelineZ + rand() * 10;
      if (Math.abs(x) < 7) continue;
      out.push({ x, z, s: 0.95 + rand() * 0.45, r: rand() * Math.PI * 2 });
    }
    for (let i = 0; i < 160; i++) {
      const a = rand() * Math.PI * 2;
      const dist = 35 + rand() * 130;
      const x = Math.cos(a) * dist * 0.95;
      const z = WORLD.treelineZ + 18 + Math.sin(a) * dist * 0.55 + rand() * 55;
      if (Math.abs(x - 18) < 10 && z > 118 && z < 168) continue;
      if (Math.hypot(x, z - 8) < 56) continue;
      if (Math.abs(x) < 5 && z < 150) continue; // path corridor
      out.push({ x, z, s: 0.75 + rand() * 0.7, r: rand() * Math.PI * 2 });
    }
    return out;
  }, []);

  const fernData = useMemo(() => {
    const rand = seeded(99);
    const f: { x: number; z: number; s: number; r: number }[] = [];
    for (let i = 0; i < 420; i++) {
      const x = (rand() - 0.5) * 170;
      const z = WORLD.treelineZ - 8 + rand() * 120;
      if (Math.hypot(x, z - 8) < 50) continue;
      f.push({ x, z, s: 0.45 + rand() * 1.1, r: rand() * Math.PI * 2 });
    }
    return f;
  }, []);

  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const canopy2Ref = useRef<THREE.InstancedMesh>(null);
  const fernRef = useRef<THREE.InstancedMesh>(null);
  const fernMat = useRef<THREE.MeshStandardMaterial>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!trunkRef.current || !canopyRef.current || !canopy2Ref.current) return;
    treeData.forEach((t, i) => {
      const y = sampleHeight(t.x, t.z);
      dummy.position.set(t.x, y, t.z);
      dummy.rotation.set(0, t.r, 0);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      trunkRef.current!.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, y + 20 * t.s, t.z);
      dummy.scale.set(t.s, t.s, t.s);
      dummy.updateMatrix();
      canopyRef.current!.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, y + 27 * t.s, t.z);
      dummy.scale.set(t.s * 0.85, t.s * 0.85, t.s * 0.85);
      dummy.updateMatrix();
      canopy2Ref.current!.setMatrixAt(i, dummy.matrix);
    });
    trunkRef.current.instanceMatrix.needsUpdate = true;
    canopyRef.current.instanceMatrix.needsUpdate = true;
    canopy2Ref.current.instanceMatrix.needsUpdate = true;
    trunkRef.current.computeBoundingSphere();
    canopyRef.current.computeBoundingSphere();
  }, [treeData, dummy]);

  useLayoutEffect(() => {
    if (!fernRef.current) return;
    fernData.forEach((f, i) => {
      const y = sampleHeight(f.x, f.z);
      dummy.position.set(f.x, y + 0.15, f.z);
      dummy.rotation.set(-Math.PI / 2.25, 0, f.r);
      dummy.scale.setScalar(f.s);
      dummy.updateMatrix();
      fernRef.current!.setMatrixAt(i, dummy.matrix);
    });
    fernRef.current.instanceMatrix.needsUpdate = true;
    fernRef.current.computeBoundingSphere();
  }, [fernData, dummy]);

  useFrame(({ clock }) => {
    if (!fernMat.current) return;
    const t = clock.elapsedTime;
    const pulse =
      0.5 + 0.5 * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / WORLD.fernPulse));
    const night = nightFactor(useGameStore.getState().timeOfDay);
    fernMat.current.emissiveIntensity = pulse * (0.1 + night * 2.3);
  });

  const n = treeData.length;
  const nf = fernData.length;

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, n]} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 2.15, 16, 6]} />
        <meshStandardMaterial color="#181a1e" roughness={0.96} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, n]} castShadow>
        <coneGeometry args={[8.5, 13, 7]} />
        <meshStandardMaterial color="#0a1e14" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopy2Ref} args={[undefined, undefined, n]} castShadow>
        <coneGeometry args={[5.8, 9, 7]} />
        <meshStandardMaterial color="#123024" roughness={0.88} />
      </instancedMesh>

      <instancedMesh ref={fernRef} args={[undefined, undefined, nf]}>
        <circleGeometry args={[1.35, 5]} />
        <meshStandardMaterial
          ref={fernMat}
          color="#145040"
          emissive="#3dffc8"
          emissiveIntensity={1.4}
          side={THREE.DoubleSide}
          transparent
          opacity={0.88}
          roughness={0.5}
        />
      </instancedMesh>

      {/* Path beacons. Emissive only — Bloom sells the glow, and seven always-on
          dynamic lights was the scene's largest mobile-GPU cost for no gain. */}
      {[48, 62, 78, 95, 115, 135, 148].map((z, i) => {
        const x = 1.5 + (i % 2) * 3.5;
        const y = sampleHeight(x, z);
        return (
          <group key={i} position={[x, y, z]}>
            <mesh castShadow position={[0, 0.45, 0]}>
              <cylinderGeometry args={[0.12, 0.18, 0.9, 6]} />
              <meshStandardMaterial
                color="#2a6b61"
                emissive="#3d9e8f"
                emissiveIntensity={2.6}
                toneMapped={false}
              />
            </mesh>
            {/* A dim halo disc so the beacon still reads at distance, where the
                0.9-unit post falls below a pixel. */}
            <mesh position={[0, 1.05, 0]}>
              <sphereGeometry args={[0.22, 8, 6]} />
              <meshBasicMaterial
                color="#7fe8d8"
                transparent
                opacity={0.55}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
