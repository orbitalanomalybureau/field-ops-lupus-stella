import { useGameStore } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";
import { Html } from "@react-three/drei";

/** Interior ops floor when player enters the central dome. */
export function CommandDomeInterior() {
  const inside = useGameStore((s) => s.insideDome);
  if (!inside) return null;

  const y = sampleHeight(0, 6);

  return (
    <group position={[0, y, 6]}>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]} receiveShadow>
        <circleGeometry args={[4, 32]} />
        <meshStandardMaterial color="#1a222c" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Consoles */}
      {[
        [-1.6, 0.6],
        [1.6, 0.6],
        [0, -1.4],
      ].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.55, z]}>
          <boxGeometry args={[1.2, 0.9, 0.7]} />
          <meshStandardMaterial
            color="#2a3540"
            emissive="#3d9e8f"
            emissiveIntensity={0.25}
            metalness={0.4}
          />
        </mesh>
      ))}
      {/* Holo table */}
      <mesh position={[0, 0.7, 0.2]}>
        <cylinderGeometry args={[0.9, 1, 0.15, 20]} />
        <meshStandardMaterial
          color="#0a3030"
          emissive="#3d9e8f"
          emissiveIntensity={0.6}
          transparent
          opacity={0.85}
        />
      </mesh>
      <pointLight position={[0, 2.2, 0]} color="#ffc090" intensity={8} distance={10} />
      <Html distanceFactor={14} position={[0, 2.8, 0]} center style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap rounded-sm border border-accent/40 bg-void/90 px-2 py-1 font-mono text-[10px] text-accent">
          OPS FLOOR · E to exit
        </div>
      </Html>
    </group>
  );
}

export function DomeHatchMarker() {
  const inside = useGameStore((s) => s.insideDome);
  const entered = useGameStore((s) => s.domeEntered);
  if (inside) return null;
  const y = sampleHeight(0, 6);
  return (
    <Html
      distanceFactor={22}
      position={[0, y + 3.2, 9]}
      center
      style={{ pointerEvents: "none" }}
    >
      <div
        className={`whitespace-nowrap rounded-sm border bg-void/80 px-2 py-0.5 font-mono text-[10px] ${
          entered
            ? "border-border text-dim"
            : "border-accent/50 text-accent"
        }`}
      >
        COMMAND DOME · E
      </div>
    </Html>
  );
}
