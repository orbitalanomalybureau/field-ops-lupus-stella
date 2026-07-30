import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { WORLD } from "@/game/data";
import { useGameStore } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";

/** South coast overlook + Kaguyahime memorial (Book II teaser). */
export function KaguyahimeCoast() {
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const logged = useGameStore((s) => s.kaguyahimeLogged);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const cherry = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (glow.current) {
      glow.current.emissiveIntensity =
        0.4 + Math.sin(clock.elapsedTime * 1.2) * 0.25;
    }
    if (cherry.current) {
      cherry.current.rotation.y = Math.sin(clock.elapsedTime * 0.3) * 0.05;
    }
  });

  if (spoiler === "book1") return null;

  const [mx, , mz] = WORLD.coastMemorial;
  const y = sampleHeight(mx, mz);

  return (
    <group>
      {/* Shore slope suggestion */}
      <mesh
        rotation={[-Math.PI / 2.4, 0, 0]}
        position={[20, y - 2, 215]}
        receiveShadow
      >
        <planeGeometry args={[90, 40]} />
        <meshStandardMaterial color="#3a1820" roughness={0.95} />
      </mesh>
      {/* Crimson water plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[25, y - 3.5, 235]}>
        <planeGeometry args={[120, 50]} />
        <meshStandardMaterial
          color="#5a1020"
          metalness={0.35}
          roughness={0.25}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Memorial stone */}
      <mesh castShadow position={[mx, y + 1.1, mz]}>
        <boxGeometry args={[2.2, 2.2, 0.45]} />
        <meshStandardMaterial color="#3a3530" roughness={0.8} />
      </mesh>
      <mesh position={[mx, y + 1.2, mz + 0.28]}>
        <planeGeometry args={[1.6, 1.2]} />
        <meshStandardMaterial
          ref={glow}
          color="#1a1018"
          emissive="#c45c6a"
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Cherry starts */}
      <group ref={cherry} position={[mx - 3, y, mz + 1]}>
        <mesh castShadow position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.08, 0.12, 2.4, 6]} />
          <meshStandardMaterial color="#3a2820" />
        </mesh>
        <mesh position={[0, 2.4, 0]}>
          <sphereGeometry args={[0.9, 10, 10]} />
          <meshStandardMaterial
            color="#c87890"
            emissive="#a05070"
            emissiveIntensity={0.2}
            transparent
            opacity={0.85}
          />
        </mesh>
      </group>
      <group position={[mx + 3.2, y, mz + 0.5]}>
        <mesh castShadow position={[0, 1, 0]}>
          <cylinderGeometry args={[0.07, 0.1, 2, 6]} />
          <meshStandardMaterial color="#3a2820" />
        </mesh>
        <mesh position={[0, 2.1, 0]}>
          <sphereGeometry args={[0.75, 10, 10]} />
          <meshStandardMaterial color="#b86880" transparent opacity={0.85} />
        </mesh>
      </group>

      <pointLight
        position={[mx, y + 3, mz]}
        color="#c45c6a"
        intensity={logged ? 6 : 3}
        distance={16}
      />

      <Html
        distanceFactor={32}
        position={[mx, y + 3.4, mz]}
        center
        // Below the overlay layer (z-20) — world labels never beat panels.
        zIndexRange={[12, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div
          className={`whitespace-nowrap rounded-sm border bg-void/85 px-2 py-0.5 font-mono text-[10px] ${
            logged
              ? "border-accent/40 text-accent"
              : "border-primary/50 text-primary-glow"
          }`}
        >
          {logged ? "KAGUYAHIME VECTOR" : "MEMORIAL · E LOG"}
        </div>
      </Html>

      {/* Coast cache */}
      <CoastCache />
    </group>
  );
}

function CoastCache() {
  const looted = useGameStore((s) => s.cachesLooted.includes("cache-c"));
  const x = 35;
  const z = 195;
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
        emissiveIntensity={0.4}
      />
    </mesh>
  );
}
