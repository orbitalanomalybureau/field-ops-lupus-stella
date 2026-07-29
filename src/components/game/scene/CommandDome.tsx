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
      {/* Shelter fittings: the ops floor doubles as the storm muster and night
          station, so it needs somewhere to sit and lie down. Interior props
          never cast shadows — the sun's 2048 map does not reach in here and
          casters are a budget. */}
      {/* Kept inside r 2.9 so a rotated corner (half-diagonal ~1.04) cannot
          poke past the 4 m floor disc. */}
      {[
        { x: -2, z: -2.05, rot: 0.6 },
        { x: 2, z: -2.05, rot: -0.6 },
      ].map((b, i) => (
        <group key={`bunk-${i}`} position={[b.x, 0.12, b.z]} rotation={[0, b.rot, 0]}>
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[1.9, 0.3, 0.85]} />
            <meshStandardMaterial color="#2e3a46" metalness={0.3} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.42, 0]}>
            <boxGeometry args={[1.7, 0.12, 0.65]} />
            <meshStandardMaterial color="#6a5546" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {[
        [-1.6, 1.5],
        [1.6, 1.5],
      ].map(([x, z], i) => (
        <mesh key={`seat-${i}`} position={[x, 0.34, z]}>
          <cylinderGeometry args={[0.26, 0.3, 0.44, 10]} />
          <meshStandardMaterial color="#33404c" metalness={0.35} roughness={0.55} />
        </mesh>
      ))}
      {/* Ration stack, same crate stock as the yard outside */}
      <group position={[-3, 0.12, 1.4]}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.7, 0.7, 0.7]} />
          <meshStandardMaterial color="#4a3f32" roughness={0.82} />
        </mesh>
        <mesh position={[0.12, 0.98, 0.08]} rotation={[0, 0.5, 0]}>
          <boxGeometry args={[0.55, 0.55, 0.55]} />
          <meshStandardMaterial color="#4a3f32" roughness={0.82} />
        </mesh>
      </group>
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
