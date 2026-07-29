import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { NPCS } from "@/game/data";
import { useGameStore } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";

function NpcFigure({
  x,
  z,
  color,
  name,
  talked,
}: {
  x: number;
  z: number;
  color: string;
  name: string;
  talked: boolean;
}) {
  const y = sampleHeight(x, z);
  const bob = useRef(0);
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    bob.current += delta;
    if (group.current) {
      group.current.position.y = y + Math.sin(bob.current * 1.5) * 0.02;
      const p = useGameStore.getState().playerPos;
      group.current.rotation.y = Math.atan2(p.x - x, p.z - z);
    }
  });

  return (
    <group ref={group} position={[x, y, z]}>
      <mesh castShadow position={[0, 0.95, 0]}>
        <capsuleGeometry args={[0.28, 0.7, 4, 8]} />
        <meshStandardMaterial color="#3a4550" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#c4a890" />
      </mesh>
      <mesh position={[0, 1.35, 0.2]}>
        <boxGeometry args={[0.35, 0.25, 0.1]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={talked ? 0.2 : 0.55}
        />
      </mesh>
      <Html
        distanceFactor={22}
        position={[0, 2.3, 0]}
        center
        style={{ pointerEvents: "none" }}
      >
        <div
          className={`whitespace-nowrap rounded-sm border px-2 py-0.5 font-mono text-[10px] ${
            talked
              ? "border-border bg-void/70 text-dim"
              : "border-accent/50 bg-void/85 text-accent"
          }`}
        >
          {talked ? name : `${name} · E`}
        </div>
      </Html>
    </group>
  );
}

export function NPCs() {
  const talked = useGameStore((s) => s.npcsTalked);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const list = NPCS.filter((n) => !n.book2 || spoiler !== "book1");
  return (
    <group>
      {list.map((n) => (
        <NpcFigure
          key={n.id}
          x={n.x}
          z={n.z}
          color={n.color}
          name={n.name}
          talked={talked.includes(n.id)}
        />
      ))}
    </group>
  );
}
