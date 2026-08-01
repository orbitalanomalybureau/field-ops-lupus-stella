import { useFrame } from "@react-three/fiber";
import { useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useGameStore } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";
import { WORLD } from "@/game/data";
import type { ObjectiveId, WorldMarker } from "@/game/types";

type GameState = ReturnType<typeof useGameStore.getState>;

type ObjectivePip = {
  id: ObjectiveId;
  pos: readonly [number, number, number];
  label: string;
};

/**
 * Objectives that resolve to one site. Ids absent here (scan, caches, npcs,
 * journal3, storm, shadowfang) are colony-wide or multi-site and carry no pip.
 */
const OBJECTIVE_PIPS: ObjectivePip[] = [
  { id: "perimeter", pos: WORLD.southGate, label: "SOUTH PERIMETER" },
  { id: "dome", pos: WORLD.domeHatch, label: "DOME HATCH" },
  { id: "ferns", pos: [0, 0, WORLD.treelineZ + 4], label: "FERN LOG" },
  { id: "prismhoof", pos: WORLD.herdPos, label: "HERD FIELD" },
  { id: "ridge7", pos: WORLD.ridgeOverlook, label: "RIDGE-7 BEACON" },
  { id: "kaguyahime", pos: WORLD.coastMemorial, label: "COAST MEMORIAL" },
  { id: "ruins", pos: WORLD.ruinPos, label: "RUIN" },
  { id: "remember", pos: WORLD.ruinPos, label: "CHAMBER" },
];

/** A hint pip and an objective pip can name the same site; the objective wins. */
const PIP_MERGE_RADIUS = 14;

/** Same throttle and hysteresis as the NPC nameplates, so every world label
 *  mounts and drops on one rhythm. */
const LABEL_PERIOD = 0.25;
const LABEL_HYSTERESIS = 1.5;
/** A pip names a destination still being walked toward, so its text carries
 *  further than an interact echo — but not the 250 m the map is wide. */
const PIP_LABEL_RADIUS = 40;
/** World-space Html stays under the overlay layer (ClickToPlay/HUD/dialogs
 *  start at z-20) — drei's default zIndexRange outdraws every modal. */
const LABEL_Z_RANGE: [number, number] = [12, 0];

/**
 * The scene's one world-label mount: the Html exists only inside `radius` of
 * `anchor`, because a mounted label costs DOM, layout and screen-reader text
 * whether or not it is legible from where the player stands.
 *
 * `anchor` is the ground point the range is measured from; a label parented to
 * an offset or rotating group does not sit above it. The range check rides the
 * frame loop and flips one boolean — subscribing to playerPos instead would
 * re-render the scene graph on every step.
 *
 * NPC and ghost plates keep their own gates: their anchors walk.
 */
export function ProximityLabel({
  anchor,
  radius,
  distanceFactor,
  // Local to the parent group, so the default sits the label on its origin.
  position = [0, 0, 0],
  children,
}: {
  anchor: readonly [number, number];
  radius: number;
  distanceFactor: number;
  position?: [number, number, number];
  children: ReactNode;
}) {
  const acc = useRef(LABEL_PERIOD);
  const shown = useRef(false);
  const [near, setNear] = useState(false);

  useFrame((_, delta) => {
    acc.current += Math.min(delta, 0.05);
    if (acc.current < LABEL_PERIOD) return;
    acc.current = 0;
    const p = useGameStore.getState().playerPos;
    const d = Math.hypot(p.x - anchor[0], p.z - anchor[1]);
    const next = d < (shown.current ? radius + LABEL_HYSTERESIS : radius);
    if (next !== shown.current) {
      shown.current = next;
      setNear(next);
    }
  });

  if (!near) return null;
  return (
    <Html
      distanceFactor={distanceFactor}
      position={position}
      center
      zIndexRange={LABEL_Z_RANGE}
      style={{ pointerEvents: "none" }}
    >
      {children}
    </Html>
  );
}

function pipActive(s: GameState, id: ObjectiveId) {
  const o = s.objectives.find((x) => x.id === id);
  if (!o || o.done) return false;
  if (o.book2 && s.spoilerCeiling === "book1") return false;
  return s.isObjectiveAvailable(id);
}

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
  // Photographs are diegetic artifacts; navigation chrome must not be in them.
  const photo = useGameStore((s) => s.photoMode);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = y + 3.2 + Math.sin(clock.elapsedTime * 2.2) * 0.25;
    }
  });
  if (!active || photo) return null;
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
      {/* The pip mesh keeps carrying navigation from across the valley; only
          its text waits for the approach. */}
      <ProximityLabel anchor={[x, z]} radius={PIP_LABEL_RADIUS} distanceFactor={28}>
        <div className="whitespace-nowrap rounded-sm border border-accent/40 bg-void/80 px-2 py-0.5 font-mono text-[10px] text-accent">
          {label}
        </div>
      </ProximityLabel>
    </group>
  );
}

function ObjectiveMarker({ pip }: { pip: ObjectivePip }) {
  const active = useGameStore((s) => pipActive(s, pip.id));
  return <QuestMarker x={pip.pos[0]} z={pip.pos[2]} label={pip.label} active={active} />;
}

function HintMarker({ marker }: { marker: WorldMarker }) {
  const active = useGameStore(
    (s) =>
      !OBJECTIVE_PIPS.some(
        (p) =>
          Math.hypot(p.pos[0] - marker.x, p.pos[2] - marker.z) < PIP_MERGE_RADIUS &&
          pipActive(s, p.id),
      ),
  );
  return (
    <QuestMarker
      x={marker.x}
      z={marker.z}
      label={marker.label.toUpperCase()}
      active={active}
    />
  );
}

export function WorldPOIs() {
  const dynamicMarkers = useGameStore((s) => s.dynamicMarkers);

  return (
    <group>
      <Cache id="cache-a" x={-22} z={88} />
      <Cache id="cache-b" x={28} z={118} />
      <SensorMast />
      {OBJECTIVE_PIPS.map((pip) => (
        <ObjectiveMarker key={pip.id} pip={pip} />
      ))}
      {dynamicMarkers.map((m) => (
        <HintMarker key={m.id} marker={m} />
      ))}
    </group>
  );
}
