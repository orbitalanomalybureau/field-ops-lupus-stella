import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { WORLD } from "@/game/data";
import { QUALITY } from "@/game/quality";
import { useGameStore } from "@/game/store";
import { sampleBiome, sampleHeight } from "@/game/worldHeight";

/** Park–Miller LCG. Golden screenshots depend on this exact stream. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

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

/** The western scatter window: the spine, its flanks, and the approach to it. */
const SCREE = { x0: -212, z0: -72, sx: 188, sz: 250 };
const SCREE_CAP = 800;

type Rock = { x: number; z: number; y: number; s: number; r: number; j: number };

/**
 * Scree follows the ridge mask rather than a hand-drawn arc, so the field
 * thickens toward the spine and thins onto the approach on its own — the old
 * 40-rock formula patch left everything either side of it bare.
 */
function buildScree(scale: number): Rock[] {
  const rand = seeded(7717);
  const out: Rock[] = [];
  const cap = Math.round(SCREE_CAP * scale);
  const candidates = Math.round(9000 * scale);
  const [bx, , bz] = WORLD.ridgeOverlook;

  for (let i = 0; i < candidates && out.length < cap; i++) {
    const x = SCREE.x0 + rand() * SCREE.sx;
    const z = SCREE.z0 + rand() * SCREE.sz;
    // The overlook disc and the cache pedestal have to stay clear to read.
    if (Math.hypot(x - bx, z - bz) < 8) continue;
    if (Math.hypot(x + 95, z - 40) < 5) continue;
    const b = sampleBiome(x, z);
    const clump = 0.5 + 0.5 * Math.sin(x * 0.043 + z * 0.027) * Math.cos(z * 0.035 - x * 0.02);
    const d = b.ridge * 1.6 * (0.28 + 0.95 * clump);
    if (d <= 0 || rand() >= d) continue;
    out.push({
      x,
      z,
      y: sampleHeight(x, z),
      // Boulders on the spine, gravel on the flanks.
      s: (0.35 + rand() * 1.15) * (0.55 + b.ridge * 0.9),
      r: rand() * Math.PI * 2,
      j: rand(),
    });
  }
  return out;
}

/** Survey-B route markers. Positions are load-bearing — do not move. */
const POSTS: [number, number][] = Array.from({ length: 12 }, (_, i) => {
  const t = i / 11;
  return [-35 - t * 75, 30 + t * 30] as [number, number];
});

export function Ridge7() {
  const planted = useGameStore((s) => s.ridgeBeaconPlanted);
  const quality = useGameStore((s) => s.quality);
  const beacon = useRef<THREE.Group>(null);
  const pulse = useRef<THREE.MeshStandardMaterial>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);

  const rocks = useMemo(
    () => buildScree(QUALITY[quality].vegetationScale),
    [quality],
  );

  useLayoutEffect(() => {
    const mesh = rockRef.current;
    if (!mesh) return;
    rocks.forEach((r, i) => {
      dummy.position.set(r.x, r.y + r.s * 0.35, r.z);
      dummy.rotation.set(r.j * 0.4, r.r, 0.05 + r.j * 0.25);
      dummy.scale.set(r.s * (0.85 + r.j * 0.4), r.s * (0.65 + r.j * 0.5), r.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.58 + r.j * 0.04, 0.04 + r.j * 0.07, 0.1 + r.j * 0.12, THREE.SRGBColorSpace);
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [rocks, dummy, tint]);

  useLayoutEffect(() => {
    const mesh = postRef.current;
    if (!mesh) return;
    POSTS.forEach(([x, z], i) => {
      dummy.position.set(x, sampleHeight(x, z) + 0.5, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy]);

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

  return (
    <group>
      <instancedMesh
        ref={rockRef}
        args={[undefined, undefined, rocks.length]}
        castShadow
        receiveShadow
      >
        <dodecahedronGeometry args={[1, 0]} />
        {/* White base colour: the per-instance tint carries the basalt range. */}
        <meshStandardMaterial
          color="#ffffff"
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

      <instancedMesh ref={postRef} args={[undefined, undefined, POSTS.length]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 1, 6]} />
        <meshStandardMaterial color="#2a6b61" emissive="#3d9e8f" emissiveIntensity={1.4} />
      </instancedMesh>

      <RidgeCache />
    </group>
  );
}
