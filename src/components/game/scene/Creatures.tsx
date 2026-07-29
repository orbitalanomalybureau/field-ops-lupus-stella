import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { WORLD } from "@/game/data";
import { useGameStore } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";

type Agent = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  kind: "prismhoof" | "shadowfang";
  phase: number;
  learnedBias: THREE.Vector3;
  health: number;
  packRole: number;
};

function PrismhoofMesh({ bob }: { bob: number }) {
  return (
    <group position={[0, bob, 0]}>
      <mesh castShadow position={[0, 0.75, 0]}>
        <capsuleGeometry args={[0.28, 0.55, 4, 8]} />
        <meshStandardMaterial color="#d0c0a8" roughness={0.65} />
      </mesh>
      <mesh castShadow position={[0, 1.2, -0.4]}>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshStandardMaterial color="#d8cbb8" />
      </mesh>
      {[-0.12, 0.12].map((sx, i) => (
        <mesh key={i} position={[sx, 1.65, -0.42]} rotation={[0.25, 0, sx * 2]}>
          <coneGeometry args={[0.07, 0.75, 5]} />
          <meshStandardMaterial
            color="#b0e8ff"
            emissive="#66ccff"
            emissiveIntensity={0.7}
            transparent
            opacity={0.9}
            metalness={0.6}
            roughness={0.2}
          />
        </mesh>
      ))}
      {[
        [-0.18, 0.35, 0.3],
        [0.18, 0.35, 0.3],
        [-0.18, 0.35, -0.3],
        [0.18, 0.35, -0.3],
      ].map((p, i) => (
        <mesh key={i} castShadow position={p as [number, number, number]}>
          <cylinderGeometry args={[0.05, 0.06, 0.7, 5]} />
          <meshStandardMaterial color="#b8a890" />
        </mesh>
      ))}
    </group>
  );
}

function ShadowfangMesh() {
  return (
    <group>
      <mesh castShadow position={[0, 0.5, 0]} scale={[1, 0.85, 1.15]}>
        <capsuleGeometry args={[0.22, 0.7, 4, 8]} />
        <meshStandardMaterial color="#12141a" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.62, -0.55]}>
        <sphereGeometry args={[0.2, 10, 10]} />
        <meshStandardMaterial color="#0e1016" />
      </mesh>
      {[-0.09, 0.09].map((sx, i) => (
        <mesh key={i} position={[sx, 0.7, -0.7]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial
            color="#ff5500"
            emissive="#ff4400"
            emissiveIntensity={2.5}
          />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.55, 0.65]} rotation={[0.5, 0, 0]}>
        <coneGeometry args={[0.08, 0.45, 5]} />
        <meshStandardMaterial color="#0a0c10" />
      </mesh>
    </group>
  );
}

export function Creatures() {
  const groupRef = useRef<THREE.Group>(null);
  const agents = useRef<Agent[]>([]);
  const count = useMemo(() => {
    const list: Agent[] = [];
    for (let i = 0; i < 6; i++) {
      const x = WORLD.herdPos[0] + (i - 2.5) * 5;
      const z = WORLD.herdPos[2] + (i % 3) * 4;
      list.push({
        pos: new THREE.Vector3(x, 0, z),
        vel: new THREE.Vector3(),
        yaw: Math.random() * Math.PI * 2,
        kind: "prismhoof",
        phase: Math.random() * Math.PI * 2,
        learnedBias: new THREE.Vector3(),
        health: 100,
        packRole: i,
      });
    }
    for (let i = 0; i < 5; i++) {
      list.push({
        pos: new THREE.Vector3(20 + i * 12, 0, WORLD.treelineZ + 30 + i * 16),
        vel: new THREE.Vector3(),
        yaw: 0,
        kind: "shadowfang",
        phase: Math.random() * 10,
        learnedBias: new THREE.Vector3(),
        health: 100,
        packRole: i,
      });
    }
    agents.current = list;
    return list.length;
  }, []);

  const lastPathLearn = useRef(0);
  const bobPhase = useRef(0);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    bobPhase.current += d;
    const store = useGameStore.getState();
    if (store.phase === "paused") return;

    const player = store.playerPos;
    const path = store.pathSamples;
    const stealth = store.getCharacter()?.stealth ?? 1;
    const combat = store.combatEnabled;
    const combatMul =
      (window as unknown as { __combatMul?: number }).__combatMul ?? 1;
    const weather = store.weather;
    let anyTrack = false;

    // Night hunters more aggressive
    const nightBoost = store.timeOfDay < 0.25 || store.timeOfDay > 0.78 ? 1.25 : 1;
    const stormBoost = weather === "storm" ? 1.2 : 1;

    if (performance.now() - lastPathLearn.current > 1600 && path.length > 4) {
      lastPathLearn.current = performance.now();
      const avg = new THREE.Vector3();
      for (const p of path) {
        avg.x += p.x;
        avg.z += p.z;
      }
      avg.x /= path.length;
      avg.z /= path.length;
      for (const a of agents.current) {
        if (a.kind === "shadowfang") a.learnedBias.lerp(avg, 0.45);
      }
    }

    // Pack center for flanking
    const packCenter = new THREE.Vector3();
    let packN = 0;
    for (const a of agents.current) {
      if (a.kind === "shadowfang") {
        packCenter.add(a.pos);
        packN++;
      }
    }
    if (packN) packCenter.multiplyScalar(1 / packN);

    agents.current.forEach((a, idx) => {
      const toPlayer = new THREE.Vector3(player.x - a.pos.x, 0, player.z - a.pos.z);
      const dist = toPlayer.length();
      a.phase += d;

      if (a.kind === "prismhoof") {
        if (dist < 14 && (combat || dist < 6)) {
          toPlayer.normalize().multiplyScalar(-3.2);
          a.vel.lerp(toPlayer, 0.1);
        } else {
          const wander = new THREE.Vector3(
            Math.sin(a.phase * 0.35 + idx) * 0.9,
            0,
            Math.cos(a.phase * 0.3 + idx) * 0.9,
          );
          const home = new THREE.Vector3(
            WORLD.herdPos[0] - a.pos.x,
            0,
            WORLD.herdPos[2] - a.pos.z,
          ).multiplyScalar(0.05);
          a.vel.lerp(wander.add(home), 0.06);
        }
        if (dist < 20 && !store.objectives.find((o) => o.id === "prismhoof")?.done) {
          store.completeObjective("prismhoof");
          store.unlockCodex("prismhoof");
        }
      } else {
        const detect = (48 / stealth) * nightBoost * stormBoost;
        const target =
          a.learnedBias.lengthSq() > 1
            ? a.learnedBias.clone()
            : new THREE.Vector3(player.x, 0, player.z);
        if (dist < detect) {
          target.lerp(new THREE.Vector3(player.x, 0, player.z), 0.65);
          anyTrack = dist < 34;
        }
        // Pack flank: offset by role around pack-player axis
        const angle = (a.packRole / 5) * Math.PI * 2;
        const flank = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(8);
        if (dist < detect * 0.75) target.add(flank);

        const dir = target.sub(a.pos);
        dir.y = 0;
        if (dir.length() > 0.4) {
          dir
            .normalize()
            .multiplyScalar((dist < 18 ? 4.4 : 2.2) * nightBoost * stormBoost);
          if (store.scannerActive) dir.multiplyScalar(0.55);
          a.vel.lerp(dir, 0.08);
        }
        if (dist < 24 && !store.objectives.find((o) => o.id === "shadowfang")?.done) {
          store.completeObjective("shadowfang");
          store.unlockCodex("shadowfang");
        }
        if (dist < 2.4) {
          if (combat) {
            a.vel.add(
              new THREE.Vector3(a.pos.x - player.x, 0, a.pos.z - player.z)
                .normalize()
                .multiplyScalar(8 * combatMul),
            );
            a.health -= 40 * d * combatMul;
          } else {
            store.setHealth(store.health - 16 * d);
          }
        }
      }

      a.pos.addScaledVector(a.vel, d);
      a.pos.x = THREE.MathUtils.clamp(a.pos.x, -140, 140);
      a.pos.z = THREE.MathUtils.clamp(a.pos.z, 35, 230);
      a.pos.y = sampleHeight(a.pos.x, a.pos.z);
      if (a.vel.lengthSq() > 0.02) {
        a.yaw = Math.atan2(a.vel.x, a.vel.z);
      }

      const child = groupRef.current?.children[idx] as THREE.Group | undefined;
      if (child) {
        child.position.copy(a.pos);
        child.rotation.y = a.yaw;
      }
    });

    store.setTracked(anyTrack);
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: count }).map((_, i) => {
        const kind = i < 6 ? "prismhoof" : "shadowfang";
        return (
          <group key={i}>
            {kind === "prismhoof" ? (
              <PrismhoofMesh bob={Math.sin(i + bobPhase.current * 3) * 0.03} />
            ) : (
              <ShadowfangMesh />
            )}
          </group>
        );
      })}
    </group>
  );
}
