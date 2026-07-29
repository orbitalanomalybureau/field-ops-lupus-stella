import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useGameStore } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";
import { WORLD } from "@/game/data";

function Cache({ id, x, z }: { id: string; x: number; z: number }) {
  const looted = useGameStore((s) => s.cachesLooted.includes(id));
  const y = sampleHeight(x, z);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current && !looted) {
      ref.current.position.y = y + 0.55 + Math.sin(clock.elapsedTime * 2) * 0.08;
      ref.current.rotation.y = clock.elapsedTime * 0.6;
    }
  });
  if (looted) return null;
  return (
    <mesh ref={ref} castShadow position={[x, y + 0.55, z]}>
      <boxGeometry args={[0.7, 0.45, 0.5]} />
      <meshStandardMaterial
        color="#c45c2a"
        emissive="#c45c2a"
        emissiveIntensity={1.4}
        metalness={0.4}
        roughness={0.45}
      />
    </mesh>
  );
}

function SensorMast() {
  const x = 12;
  const z = 58;
  const y = sampleHeight(x, z);
  const dish = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (dish.current) dish.current.rotation.y = clock.elapsedTime * 0.35;
  });
  return (
    <group position={[x, y, z]}>
      <mesh castShadow position={[0, 3, 0]}>
        <cylinderGeometry args={[0.15, 0.22, 6, 8]} />
        <meshStandardMaterial color="#3a4550" metalness={0.5} />
      </mesh>
      <mesh ref={dish} position={[0, 6.2, 0]} rotation={[0.4, 0, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 0.12, 16]} />
        <meshStandardMaterial
          color="#4a9e8f"
          emissive="#3d9e8f"
          emissiveIntensity={1.6}
          metalness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function QuestMarker({ x, z, label, active }: { x: number; z: number; label: string; active: boolean }) {
  const y = sampleHeight(x, z);
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = y + 3.2 + Math.sin(clock.elapsedTime * 2.2) * 0.25;
    }
  });
  if (!active) return null;
  return (
    <group ref={ref} position={[x, y + 3.2, z]}>
      <mesh>
        <octahedronGeometry args={[0.35, 0]} />
        <meshStandardMaterial
          color="#3d9e8f"
          emissive="#3d9e8f"
          emissiveIntensity={1.2}
          transparent
          opacity={0.9}
        />
      </mesh>
      <Html distanceFactor={28} center style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap rounded-sm border border-accent/40 bg-void/80 px-2 py-0.5 font-mono text-[10px] text-accent">
          {label}
        </div>
      </Html>
    </group>
  );
}

export function WorldPOIs() {
  const objectives = useGameStore((s) => s.objectives);
  const ruinDone = objectives.find((o) => o.id === "ruins")?.done;
  const fernDone = objectives.find((o) => o.id === "ferns")?.done;

  return (
    <group>
      <Cache id="cache-a" x={-22} z={88} />
      <Cache id="cache-b" x={28} z={118} />
      <SensorMast />
      <QuestMarker
        x={0}
        z={WORLD.treelineZ + 4}
        label="FERN LOG"
        active={!fernDone}
      />
      <QuestMarker
        x={WORLD.ruinPos[0]}
        z={WORLD.ruinPos[2]}
        label="RUIN"
        active={!ruinDone}
      />
    </group>
  );
}
