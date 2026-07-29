import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { WORLD } from "@/game/data";
import { getAudio } from "@/game/audio";
import { consumeEdge } from "@/game/input";
import { passesCeiling } from "@/game/selectors";
import { useGameStore } from "@/game/store";
import type { CreatureRecord } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";

/**
 * The ecology: one agents array, one update loop, explicit per-agent states.
 *
 * Prismhoof:  graze → wander → alert → flee (boids keep the herd apart).
 * Predators:  prowl → stalk → flank → lunge → retreat / feed / ambush / dead.
 *
 * The behaviour numbers (48/stealth detect, 1.25 night, 1.2 storm, 0.55 scan
 * slowdown, 8 m flank offsets, 1600 ms / 0.45 learnedBias cadence, 4.4/2.2
 * speeds, 3.2 flee, 16/s contact, 8·combat shove) are the shipped tuning and
 * are preserved verbatim — this is a restructure plus additions, not a re-tune.
 *
 * This component is the sole consumer of the "attack" input edge.
 */

type Kind = "prismhoof" | "shadowfang" | "scavenger";

type AgentState =
  | "graze"
  | "wander"
  | "alert"
  | "flee"
  | "prowl"
  | "stalk"
  | "flank"
  | "ambush"
  | "lunge"
  | "retreat"
  | "feed"
  | "dead";

type Agent = {
  id: string;
  kind: Kind;
  /** Per-agent Park-Miller stream; drives respawn placement. Never Math.random. */
  rand: () => number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  home: THREE.Vector3;
  yaw: number;
  phase: number;
  gait: number;
  learnedBias: THREE.Vector3;
  /** Seconds of route data accumulated; >45 s arms the night ambush. */
  biasTime: number;
  health: number;
  packRole: number;
  packSize: number;
  /** Fixed picket offset so a pack spreads around the intercept point. */
  ambushOx: number;
  ambushOz: number;
  state: AgentState;
  stateT: number;
  /** Lunge telegraph countdown; the commit happens when it reaches 0. */
  windup: number;
  lungeT: number;
  lungeCd: number;
  crouchK: number;
  collapseK: number;
  deadT: number;
  respawnT: number;
  quillTaken: boolean;
  quillHold: number;
  /** Eye flare decay after a player hit lands. */
  flash: number;
  preyIdx: number;
  feedT: number;
  /** Night-only spawns sleep by day unless a storm or the aggro flag wakes them. */
  nocturnal: boolean;
  dormant: boolean;
};

/** Limb/eye handles resolved at mount so the frame loop never traverses. */
type Rig = {
  root: THREE.Group;
  legs: THREE.Group[];
  eyes: THREE.MeshStandardMaterial[];
};

const HERD_COUNT = 8;
const FANG_COUNT = 5;
const SCAV_COUNT = 3;
const COUNT = HERD_COUNT + FANG_COUNT + SCAV_COUNT;
const PRED_START = HERD_COUNT;
const PRED_COUNT = FANG_COUNT + SCAV_COUNT;

/** Agents beyond this range are frozen: rendered, but not simulated. */
const SIM_RADIUS = 120;
/** Swing reach and half-cone (cos ~56°) for the player's attack. */
const ATTACK_RANGE = 3.2;
const ATTACK_CONE = 0.55;
const ATTACK_DAMAGE = 40;
const ATTACK_COOLDOWN = 0.45;
const LUNGE_WINDUP = 0.5;
const SPECIMEN_SEC = 30;
/** The coast pack is Book II terrain; below the ceiling it does not exist. */
const BOOK2 = { book2: true } as const;

/** Park-Miller over a fixed seed — the repo's seeded-scatter pattern. */
function makeRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function herdPoint(r: () => number): [number, number] {
  return [
    WORLD.herdPos[0] + (r() - 0.5) * 26,
    WORLD.herdPos[2] + (r() - 0.5) * 20,
  ];
}

function treelinePoint(r: () => number): [number, number] {
  return [12 + r() * 72, WORLD.treelineZ + 26 + r() * 56];
}

/** Beach shelf: dry land between the shore blend and the seabed drop. */
function coastPoint(r: () => number): [number, number] {
  return [-50 + r() * 100, 176 + r() * 18];
}

function setState(a: Agent, s: AgentState): void {
  a.state = s;
  a.stateT = 0;
}

// Scratch vectors — the loop must not allocate.
const V_A = new THREE.Vector3();
const V_B = new THREE.Vector3();
const V_C = new THREE.Vector3();

// Local +z is forward: agent yaw is atan2(vel.x, vel.z), same as the player.
// Index order is front-left, front-right, rear-left, rear-right; the gait
// swings the diagonal pairs (0,3) and (1,2) against each other.
const PRISMHOOF_LEGS: [number, number][] = [
  [-0.18, 0.3],
  [0.18, 0.3],
  [-0.18, -0.3],
  [0.18, -0.3],
];

const SHADOWFANG_LEGS: [number, number][] = [
  [-0.14, 0.26],
  [0.14, 0.26],
  [-0.14, -0.26],
  [0.14, -0.26],
];

function PrismhoofMesh() {
  return (
    <group>
      <mesh castShadow position={[0, 0.75, 0]}>
        <capsuleGeometry args={[0.28, 0.55, 4, 8]} />
        <meshStandardMaterial color="#d0c0a8" roughness={0.65} />
      </mesh>
      <mesh castShadow position={[0, 1.2, 0.4]}>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshStandardMaterial color="#d8cbb8" />
      </mesh>
      {[-0.12, 0.12].map((sx, i) => (
        <mesh key={i} position={[sx, 1.65, 0.42]} rotation={[-0.25, 0, sx * 2]}>
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
      {PRISMHOOF_LEGS.map(([lx, lz], i) => (
        <group key={i} name="leg" position={[lx, 0.7, lz]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 0.7, 5]} />
            <meshStandardMaterial color="#b8a890" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Shared predator mesh. The scavenger tint stays above ~0.2 albedo lightness —
 * anything multiplying a white base material IS the albedo under this star.
 */
function ShadowfangMesh({ scavenger = false }: { scavenger?: boolean }) {
  const body = scavenger ? "#5f584a" : "#12141a";
  const head = scavenger ? "#575040" : "#0e1016";
  const limb = scavenger ? "#4f4a3e" : "#0e1016";
  const tail = scavenger ? "#453f33" : "#0a0c10";
  const eye = scavenger ? "#42e0cc" : "#ff5500";
  const eyeEmissive = scavenger ? "#2fd4c0" : "#ff4400";
  return (
    <group>
      <mesh castShadow position={[0, 0.5, 0]} scale={[1, 0.85, 1.15]}>
        <capsuleGeometry args={[0.22, 0.7, 4, 8]} />
        <meshStandardMaterial color={body} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.62, 0.55]}>
        <sphereGeometry args={[0.2, 10, 10]} />
        <meshStandardMaterial color={head} />
      </mesh>
      {[-0.09, 0.09].map((sx, i) => (
        <mesh key={i} name="eye" position={[sx, 0.7, 0.7]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial
            color={eye}
            emissive={eyeEmissive}
            emissiveIntensity={2.5}
          />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.55, -0.65]} rotation={[-0.5, 0, 0]}>
        <coneGeometry args={[0.08, 0.45, 5]} />
        <meshStandardMaterial color={tail} />
      </mesh>
      {SHADOWFANG_LEGS.map(([lx, lz], i) => (
        <group key={i} name="leg" position={[lx, 0.5, lz]}>
          <mesh castShadow position={[0, -0.25, 0]}>
            <cylinderGeometry args={[0.045, 0.055, 0.5, 5]} />
            <meshStandardMaterial color={limb} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Creatures() {
  const groupRef = useRef<THREE.Group>(null);
  const ghostRef = useRef<THREE.Group>(null);
  const agents = useRef<Agent[]>([]);
  const rigs = useRef<Rig[]>([]);
  const lastPathLearn = useRef(0);
  const saveTimer = useRef(0);
  const attackCd = useRef(0);
  const memoryApplied = useRef(false);
  const routeCodexShown = useRef(false);

  const count = useMemo(() => {
    const master = makeRand(90210);
    const make = (
      kind: Kind,
      id: string,
      role: number,
      size: number,
      nocturnal: boolean,
    ): Agent => {
      const rand = makeRand(1 + Math.floor(master() * 2147480000));
      const [x, z] =
        kind === "prismhoof"
          ? herdPoint(rand)
          : kind === "shadowfang"
            ? treelinePoint(rand)
            : coastPoint(rand);
      const angle = (role / size) * Math.PI * 2;
      return {
        id,
        kind,
        rand,
        // Grounded at birth: agents beyond the sim radius are frozen, and a
        // frozen agent renders exactly where it stands.
        pos: new THREE.Vector3(x, sampleHeight(x, z), z),
        vel: new THREE.Vector3(),
        home: new THREE.Vector3(x, 0, z),
        yaw: rand() * Math.PI * 2,
        phase: rand() * Math.PI * 2,
        gait: rand() * Math.PI * 2,
        learnedBias: new THREE.Vector3(),
        biasTime: 0,
        health: 100,
        packRole: role,
        packSize: size,
        ambushOx: Math.cos(angle) * 6,
        ambushOz: Math.sin(angle) * 6,
        state: kind === "prismhoof" ? "graze" : "prowl",
        stateT: 0,
        windup: 0,
        lungeT: 0,
        lungeCd: 0,
        crouchK: 0,
        collapseK: 0,
        deadT: 0,
        respawnT: 0,
        quillTaken: false,
        quillHold: 0,
        flash: 0,
        preyIdx: -1,
        feedT: 0,
        nocturnal,
        dormant: nocturnal,
      };
    };
    const list: Agent[] = [];
    for (let i = 0; i < HERD_COUNT; i++) {
      list.push(make("prismhoof", `hoof-${i}`, i, HERD_COUNT, false));
    }
    // Zone budget: 3 daylight fangs, 2 more that only walk at night or in storm.
    for (let i = 0; i < FANG_COUNT; i++) {
      list.push(make("shadowfang", `fang-${i}`, i, FANG_COUNT, i >= 3));
    }
    for (let i = 0; i < SCAV_COUNT; i++) {
      list.push(make("scavenger", `scav-${i}`, i, SCAV_COUNT, false));
    }
    agents.current = list;
    return list.length;
  }, []);

  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    rigs.current = g.children.map((c) => {
      const root = c.children[0] as THREE.Group;
      const eyes: THREE.MeshStandardMaterial[] = [];
      root.traverse((o) => {
        if (o.name === "eye" && o instanceof THREE.Mesh) {
          eyes.push(o.material as THREE.MeshStandardMaterial);
        }
      });
      return {
        root,
        legs: root.children.filter((o) => o.name === "leg") as THREE.Group[],
        eyes,
      };
    });
  }, [count]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const store = useGameStore.getState();
    // Sole consumer of the attack edge (see input.ts). Drained even while
    // paused so a press inside a menu cannot fire on resume.
    const attackEdge = consumeEdge("attack");
    if (store.phase === "paused") return;

    const player = store.playerPos;
    const path = store.pathSamples;
    const stealth = store.getCharacter()?.stealth ?? 1;
    const combat = store.combatEnabled;
    const combatMul = store.getCharacter()?.combatBonus ?? 1;
    const weather = store.weather;
    const aggro = store.packsAggroed;
    const inMission = store.phase === "playing" || store.phase === "ruins";
    const scavAllowed = passesCeiling(BOOK2, store.spoilerCeiling);
    let anyTrack = false;

    // Night hunters more aggressive
    const night = store.timeOfDay < 0.25 || store.timeOfDay > 0.78;
    const nightBoost = night ? 1.25 : 1;
    const stormBoost = weather === "storm" ? 1.2 : 1;
    const boost = nightBoost * stormBoost;

    // "The planet remembers you": restore pack knowledge once, after hydrate.
    if (!memoryApplied.current) {
      memoryApplied.current = true;
      for (const rec of store.creatureMemory) {
        const a = agents.current.find((x) => x.id === rec.id);
        if (!a) continue;
        a.learnedBias.set(rec.bx, 0, rec.bz);
        a.biasTime = rec.tracked;
        // A fang saved mid-death comes back lean, not dead.
        a.health = Math.max(15, Math.min(100, rec.health));
      }
    }

    // Route learning — the shipped cadence and averaging weight.
    if (performance.now() - lastPathLearn.current > 1600 && path.length > 4) {
      lastPathLearn.current = performance.now();
      let ax = 0;
      let az = 0;
      for (const p of path) {
        ax += p.x;
        az += p.z;
      }
      ax /= path.length;
      az /= path.length;
      for (const a of agents.current) {
        if (a.kind !== "prismhoof") {
          a.learnedBias.lerp(V_A.set(ax, 0, az), 0.45);
          a.biasTime += 1.6;
        }
      }
    }

    const killPredator = (a: Agent) => {
      setState(a, "dead");
      a.deadT = 0;
      a.collapseK = 0;
      a.respawnT = 42;
      a.quillTaken = false;
      a.quillHold = 0;
      a.vel.set(0, 0, 0);
      store.recordFangKill();
    };

    const unlockRoute = () => {
      if (routeCodexShown.current) return;
      routeCodexShown.current = true;
      // No-ops gracefully if the codex entry is absent from data.ts.
      store.unlockCodex("route-learning");
    };

    // ---- Player attack: one swing per edge, nearest fang in the cone. ----
    attackCd.current = Math.max(0, attackCd.current - d);
    if (attackEdge && combat && inMission && attackCd.current <= 0) {
      attackCd.current = ATTACK_COOLDOWN;
      const fx = -Math.sin(store.playerYaw);
      const fz = -Math.cos(store.playerYaw);
      let best: Agent | null = null;
      let bestD = ATTACK_RANGE;
      for (let i = PRED_START; i < COUNT; i++) {
        const a = agents.current[i];
        if (a.state === "dead" || a.dormant) continue;
        if (a.kind === "scavenger" && !scavAllowed) continue;
        const tx = a.pos.x - player.x;
        const tz = a.pos.z - player.z;
        const td = Math.hypot(tx, tz);
        if (td > bestD || td < 1e-4) continue;
        if ((tx / td) * fx + (tz / td) * fz < ATTACK_CONE) continue;
        best = a;
        bestD = td;
      }
      if (best) {
        best.health -= ATTACK_DAMAGE * combatMul;
        V_A.set(best.pos.x - player.x, 0, best.pos.z - player.z)
          .normalize()
          .multiplyScalar(8 * combatMul);
        best.vel.add(V_A);
        best.flash = 0.35;
        getAudio().pulseInteract();
        if (best.health <= 0) killPredator(best);
      }
    }

    // Live herd centroid for cohesion.
    let cx = 0;
    let cz = 0;
    let cn = 0;
    for (let i = 0; i < HERD_COUNT; i++) {
      const h = agents.current[i];
      if (h.state !== "dead") {
        cx += h.pos.x;
        cz += h.pos.z;
        cn++;
      }
    }
    if (cn) {
      cx /= cn;
      cz /= cn;
    }

    agents.current.forEach((a, idx) => {
      const child = groupRef.current?.children[idx] as THREE.Group | undefined;
      const dx = player.x - a.pos.x;
      const dz = player.z - a.pos.z;
      const dist = Math.hypot(dx, dz);

      if (a.kind === "scavenger" && !scavAllowed) {
        if (child) child.visible = false;
        return;
      }

      if (a.nocturnal) {
        const wake = night || weather === "storm" || aggro;
        if (a.dormant && wake) {
          a.dormant = false;
          a.pos.copy(a.home);
          a.pos.y = sampleHeight(a.pos.x, a.pos.z);
          a.vel.set(0, 0, 0);
          setState(a, "prowl");
        } else if (!a.dormant && !wake && a.state === "prowl" && dist > 60) {
          // Never despawn in front of the player or mid-fight.
          a.dormant = true;
        }
      }
      if (a.dormant) {
        if (child) child.visible = false;
        return;
      }

      const active = dist < SIM_RADIUS;
      a.flash = Math.max(0, a.flash - d);

      if (a.state === "dead") {
        // Timers keep running while frozen so far-away carcasses still cycle.
        a.deadT += d;
        a.respawnT -= d;
        a.collapseK = Math.min(1, a.collapseK + d * 1.6);
        a.vel.multiplyScalar(Math.exp(-6 * d));
        if (
          a.kind !== "prismhoof" &&
          !a.quillTaken &&
          a.deadT < SPECIMEN_SEC &&
          store.scannerActive &&
          dist < 6
        ) {
          a.quillHold += d;
          if (a.quillHold >= 1.2) {
            a.quillTaken = true;
            store.recordFangQuill();
            getAudio().pulseInteract();
          }
        } else {
          a.quillHold = 0;
        }
        if (a.respawnT <= 0) {
          const [nx, nz] =
            a.kind === "prismhoof"
              ? herdPoint(a.rand)
              : a.kind === "shadowfang"
                ? treelinePoint(a.rand)
                : coastPoint(a.rand);
          a.pos.set(nx, sampleHeight(nx, nz), nz);
          a.home.set(nx, 0, nz);
          a.vel.set(0, 0, 0);
          a.health = 100;
          a.collapseK = 0;
          a.deadT = 0;
          setState(a, a.kind === "prismhoof" ? "graze" : "prowl");
          if (a.kind !== "prismhoof" && dist < 80) {
            store.pushMessage("RECON — new fang signature on the mesh");
          }
        }
      } else if (active) {
        a.phase += d;
        a.stateT += d;
        a.crouchK = Math.max(0, a.crouchK - 2.5 * d);

        if (a.kind === "prismhoof") {
          // ---------------- Prismhoof ----------------
          let predD = Infinity;
          let px = 0;
          let pz = 0;
          for (let pi = PRED_START; pi < COUNT; pi++) {
            const p = agents.current[pi];
            if (p.dormant || p.state === "dead") continue;
            if (p.kind === "scavenger" && !scavAllowed) continue;
            const pd = Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
            if (pd < predD) {
              predD = pd;
              px = p.pos.x;
              pz = p.pos.z;
            }
          }
          // The shipped stampede trigger, verbatim.
          const playerThreat = dist < 14 && (combat || dist < 6);
          const startled = playerThreat || predD < 16;

          switch (a.state) {
            case "graze":
              a.vel.multiplyScalar(Math.exp(-2.5 * d));
              if (startled) setState(a, "flee");
              else if (dist < 20 || predD < 24) setState(a, "alert");
              else if (a.stateT > 5 + (a.phase % 5)) setState(a, "wander");
              break;
            case "wander":
              V_A.set(
                Math.sin(a.phase * 0.35 + idx) * 0.9,
                0,
                Math.cos(a.phase * 0.3 + idx) * 0.9,
              );
              V_B.set(a.home.x - a.pos.x, 0, a.home.z - a.pos.z).multiplyScalar(
                0.05,
              );
              a.vel.lerp(V_A.add(V_B), 0.06);
              if (startled) setState(a, "flee");
              else if (dist < 18 || predD < 22) setState(a, "alert");
              else if (a.stateT > 8 + (a.phase % 6)) setState(a, "graze");
              break;
            case "alert": {
              a.vel.multiplyScalar(Math.exp(-6 * d));
              const tx = dist < predD ? player.x : px;
              const tz = dist < predD ? player.z : pz;
              a.yaw = Math.atan2(tx - a.pos.x, tz - a.pos.z);
              if (startled) setState(a, "flee");
              else if (a.stateT > 1.2 && dist > 26 && predD > 30) {
                setState(a, "wander");
              }
              break;
            }
            case "flee": {
              const tx = dist < predD ? player.x : px;
              const tz = dist < predD ? player.z : pz;
              V_A.set(tx - a.pos.x, 0, tz - a.pos.z);
              if (V_A.lengthSq() > 1e-6) {
                V_A.normalize().multiplyScalar(-3.2);
                a.vel.lerp(V_A, 0.1);
              }
              if (Math.min(dist, predD) > 30) setState(a, "wander");
              break;
            }
            default:
              break;
          }

          // Boids: separation always, gentle cohesion while calm.
          V_C.set(0, 0, 0);
          for (let hi = 0; hi < HERD_COUNT; hi++) {
            if (hi === idx) continue;
            const b = agents.current[hi];
            if (b.state === "dead") continue;
            const sx = a.pos.x - b.pos.x;
            const sz = a.pos.z - b.pos.z;
            const sd = Math.hypot(sx, sz);
            if (sd > 1e-3 && sd < 2.6) {
              const k = (2.6 - sd) / 2.6;
              V_C.x += (sx / sd) * k;
              V_C.z += (sz / sd) * k;
            }
          }
          a.vel.x += V_C.x * 3 * d;
          a.vel.z += V_C.z * 3 * d;
          if (cn && (a.state === "graze" || a.state === "wander")) {
            a.vel.x += (cx - a.pos.x) * 0.04 * d;
            a.vel.z += (cz - a.pos.z) * 0.04 * d;
          }

          if (
            dist < 20 &&
            !store.objectives.find((o) => o.id === "prismhoof")?.done
          ) {
            store.completeObjective("prismhoof");
            store.unlockCodex("prismhoof");
          }
        } else {
          // ---------------- Predators ----------------
          const detect = (48 / stealth) * nightBoost * stormBoost;
          const detected = aggro || dist < detect;
          const biasSet = a.learnedBias.lengthSq() > 1;
          a.lungeCd = Math.max(0, a.lungeCd - d);

          if (a.health < 30 && a.state !== "retreat") setState(a, "retreat");

          const steer = (tx: number, tz: number, speed: number) => {
            V_A.set(tx - a.pos.x, 0, tz - a.pos.z);
            if (V_A.length() > 0.4) {
              V_A.normalize().multiplyScalar(speed);
              if (store.scannerActive) V_A.multiplyScalar(0.55);
              a.vel.lerp(V_A, 0.08);
            }
          };
          const speedFor = (targetD: number) =>
            (targetD < 18 ? 4.4 : 2.2) * boost;

          switch (a.state) {
            case "prowl": {
              if (dist > 40) a.health = Math.min(100, a.health + 3 * d);
              // Undetected fangs drift toward the learned route rather than
              // home — the old always-on bias-seek, kept as prowl's anchor.
              const hx = biasSet ? a.learnedBias.x : a.home.x;
              const hz = biasSet ? a.learnedBias.z : a.home.z;
              V_A.set(
                Math.sin(a.phase * 0.35 + idx) * 0.9,
                0,
                Math.cos(a.phase * 0.3 + idx) * 0.9,
              );
              V_B.set(hx - a.pos.x, 0, hz - a.pos.z).multiplyScalar(0.05);
              a.vel.lerp(V_A.add(V_B), 0.06);
              if (detected) {
                a.preyIdx = -1;
                setState(a, "stalk");
              } else if (
                night &&
                a.biasTime > 45 &&
                biasSet &&
                a.packRole % 2 === 0
              ) {
                // Only an established solution earns a picket, and only some
                // of the pack sits it — the rest keep the ground moving.
                setState(a, "ambush");
              } else if (a.stateT > 2) {
                let bi = -1;
                let bd = 90;
                for (let hi = 0; hi < HERD_COUNT; hi++) {
                  const h = agents.current[hi];
                  if (h.state === "dead") continue;
                  const hd = Math.hypot(
                    h.pos.x - a.pos.x,
                    h.pos.z - a.pos.z,
                  );
                  if (hd < bd) {
                    bd = hd;
                    bi = hi;
                  }
                }
                if (bi >= 0) {
                  a.preyIdx = bi;
                  setState(a, "stalk");
                }
              }
              break;
            }
            case "stalk": {
              // The operative always outranks prey.
              if (a.preyIdx >= 0 && detected) a.preyIdx = -1;
              if (a.preyIdx >= 0) {
                const prey = agents.current[a.preyIdx];
                const pd = Math.hypot(
                  prey.pos.x - a.pos.x,
                  prey.pos.z - a.pos.z,
                );
                if (prey.state === "dead" || pd > 110) {
                  a.preyIdx = -1;
                  setState(a, "prowl");
                } else if (pd < 1.8) {
                  setState(prey, "dead");
                  prey.deadT = 0;
                  prey.collapseK = 0;
                  prey.respawnT = 45;
                  prey.vel.set(0, 0, 0);
                  a.preyIdx = -1;
                  a.feedT = 20;
                  setState(a, "feed");
                } else {
                  steer(prey.pos.x, prey.pos.z, speedFor(pd));
                }
              } else {
                // The shipped stalk math: bias-or-player target, 0.65 blend.
                V_B.set(player.x, 0, player.z);
                if (biasSet) {
                  V_C.copy(a.learnedBias);
                  if (detected) V_C.lerp(V_B, 0.65);
                } else {
                  V_C.copy(V_B);
                }
                steer(V_C.x, V_C.z, speedFor(dist));
                if (detected && dist < 34) anyTrack = true;
                if (detected && dist < detect * 0.75) setState(a, "flank");
                else if (!detected && dist > detect * 1.3) {
                  setState(a, "prowl");
                }
              }
              break;
            }
            case "flank": {
              const angle = (a.packRole / a.packSize) * Math.PI * 2;
              steer(
                player.x + Math.cos(angle) * 8,
                player.z + Math.sin(angle) * 8,
                speedFor(dist),
              );
              if (dist < 34) anyTrack = true;
              if (dist < 5 && a.lungeCd <= 0) {
                a.windup = LUNGE_WINDUP;
                getAudio().pulseAlert();
                setState(a, "lunge");
              } else if (!detected && dist > detect) {
                setState(a, "stalk");
              }
              break;
            }
            case "lunge": {
              if (a.windup > 0) {
                // Telegraph: coil low, face the target, eyes ramp (render
                // section) — the player gets half a second to read it.
                a.windup -= d;
                a.vel.multiplyScalar(Math.exp(-5 * d));
                a.crouchK = Math.min(1, a.crouchK + 3 * d);
                a.yaw = Math.atan2(dx, dz);
                if (a.windup <= 0) {
                  V_A.set(dx, 0, dz);
                  if (V_A.lengthSq() > 1e-6) V_A.normalize();
                  a.vel.copy(V_A.multiplyScalar(9 * boost));
                  a.lungeT = 0.55;
                }
              } else {
                a.lungeT -= d;
                if (dist < 34) anyTrack = true;
                if (a.lungeT <= 0) {
                  a.lungeCd = 2.2;
                  setState(a, detected ? "flank" : "prowl");
                }
              }
              break;
            }
            case "ambush": {
              const bx = a.learnedBias.x + a.ambushOx;
              const bz = a.learnedBias.z + a.ambushOz;
              const bd = Math.hypot(bx - a.pos.x, bz - a.pos.z);
              if (bd > 1.5) {
                steer(bx, bz, 2.2 * boost);
              } else {
                a.vel.multiplyScalar(Math.exp(-5 * d));
                a.crouchK = Math.min(1, a.crouchK + 2 * d);
                a.yaw = Math.atan2(dx, dz);
              }
              // Waiting fangs do not trip TRACKED — the ambush must land cold.
              if (dist < 12) {
                unlockRoute();
                a.windup = LUNGE_WINDUP;
                getAudio().pulseAlert();
                setState(a, "lunge");
              } else if (!night || aggro) {
                setState(a, aggro ? "stalk" : "prowl");
              }
              break;
            }
            case "retreat": {
              V_A.set(a.home.x - a.pos.x, 0, a.home.z - a.pos.z);
              if (V_A.length() > 0.4) {
                V_A.normalize().multiplyScalar(4.4 * boost);
                a.vel.lerp(V_A, 0.08);
              } else {
                a.vel.multiplyScalar(Math.exp(-3 * d));
              }
              a.health = Math.min(100, a.health + 6 * d);
              if (a.health >= 60) setState(a, "prowl");
              break;
            }
            case "feed": {
              a.vel.multiplyScalar(Math.exp(-4 * d));
              a.crouchK = Math.min(1, a.crouchK + 1.5 * d);
              a.feedT -= d;
              if (detected && dist < 12) setState(a, "stalk");
              else if (a.feedT <= 0) setState(a, "prowl");
              break;
            }
            default:
              break;
          }

          // Contact — shipped numbers: an armed stance shoves the fang off,
          // an unarmed operative bleeds 16/s.
          if (dist < 2.4) {
            if (combat) {
              V_A.set(-dx, 0, -dz);
              if (V_A.lengthSq() > 1e-6) {
                a.vel.add(V_A.normalize().multiplyScalar(8 * combatMul));
              }
            } else {
              store.setHealth(store.health - 16 * d);
            }
          }

          if (
            dist < 24 &&
            !store.objectives.find((o) => o.id === "shadowfang")?.done
          ) {
            store.completeObjective("shadowfang");
            store.unlockCodex("shadowfang");
          }
        }

        a.pos.addScaledVector(a.vel, d);
        a.pos.x = THREE.MathUtils.clamp(a.pos.x, -140, 140);
        a.pos.z = THREE.MathUtils.clamp(a.pos.z, 35, 230);
        a.pos.y = sampleHeight(a.pos.x, a.pos.z);
        if (a.vel.lengthSq() > 0.02) {
          a.yaw = Math.atan2(a.vel.x, a.vel.z);
        }
      }

      // ---- Render: transform, gait, collapse/crouch pose, eye emissive. ----
      if (child) {
        // Fang specimens despawn once the quill window closes; a downed herd
        // member stays until respawn so the feeding fang has a carcass.
        child.visible = !(
          a.state === "dead" &&
          a.kind !== "prismhoof" &&
          a.deadT > SPECIMEN_SEC
        );
        child.position.copy(a.pos);
        child.rotation.y = a.yaw;
      }
      const rig = rigs.current[idx];
      if (rig) {
        const spd = Math.hypot(a.vel.x, a.vel.z);
        // Gait advances on the agent's own ground speed, so a grazing herd
        // ambles and a closing pack sprints — without any re-render.
        if (active && a.state !== "dead") a.gait += d * (1.6 + spd * 2.2);
        const swing =
          a.state === "dead"
            ? 0
            : Math.sin(a.gait) * Math.min(0.1 + spd * 0.16, 0.7);
        rig.legs.forEach((leg, li) => {
          leg.rotation.x = li === 0 || li === 3 ? swing : -swing;
        });
        rig.root.position.y =
          Math.abs(Math.sin(a.gait)) * Math.min(spd / 5, 1) * 0.06 -
          a.collapseK * 0.32 -
          a.crouchK * 0.18;
        rig.root.rotation.z = a.collapseK * 1.25;
        rig.root.scale.y = 1 - a.crouchK * 0.3;
        if (rig.eyes.length) {
          // Windup telegraph and hit flare are emissive-only: no lights.
          const windupK =
            a.state === "lunge" && a.windup > 0
              ? 1 - a.windup / LUNGE_WINDUP
              : 0;
          const intensity = 2.5 + windupK * 5 + a.flash * 10;
          for (const m of rig.eyes) m.emissiveIntensity = intensity;
        }
      }
    });

    // ---- Predicted-intercept ghosts: the routes they know, made visible. ----
    const ghosts = ghostRef.current;
    if (ghosts) {
      for (let i = 0; i < PRED_COUNT; i++) {
        const a = agents.current[PRED_START + i];
        const m = ghosts.children[i] as THREE.Mesh | undefined;
        if (!m) continue;
        const show =
          store.scannerActive &&
          a.learnedBias.lengthSq() > 1 &&
          !a.dormant &&
          a.state !== "dead" &&
          !(a.kind === "scavenger" && !scavAllowed);
        m.visible = show;
        if (show) {
          const gx = a.learnedBias.x + a.ambushOx;
          const gz = a.learnedBias.z + a.ambushOz;
          m.position.set(gx, sampleHeight(gx, gz) + 0.9, gz);
          m.rotation.y += d * 1.4;
          const mat = m.material as THREE.MeshStandardMaterial;
          mat.opacity = 0.22 + 0.1 * (0.5 + 0.5 * Math.sin(a.phase * 3));
          unlockRoute();
        }
      }
    }

    // Pack knowledge into the store at low cadence; autosave flushes it.
    saveTimer.current += d;
    if (saveTimer.current > 2.5) {
      saveTimer.current = 0;
      const records: CreatureRecord[] = [];
      for (let i = PRED_START; i < COUNT; i++) {
        const a = agents.current[i];
        records.push({
          id: a.id,
          bx: a.learnedBias.x,
          bz: a.learnedBias.z,
          tracked: a.biasTime,
          health: Math.round(a.health),
        });
      }
      store.saveCreatureMemory(records);
    }

    store.setTracked(anyTrack);
  });

  return (
    <group>
      <group ref={groupRef}>
        {Array.from({ length: count }).map((_, i) => (
          <group key={i}>
            {i < HERD_COUNT ? (
              <PrismhoofMesh />
            ) : (
              <ShadowfangMesh scavenger={i >= HERD_COUNT + FANG_COUNT} />
            )}
          </group>
        ))}
      </group>
      {/* Intercept ghosts: emissive only — never a light, never a shadow. */}
      <group ref={ghostRef}>
        {Array.from({ length: PRED_COUNT }).map((_, i) => (
          <mesh key={i} visible={false} scale={[0.3, 0.52, 0.3]}>
            <octahedronGeometry args={[1, 0]} />
            <meshStandardMaterial
              color="#ff8a4d"
              emissive="#ff6a2a"
              emissiveIntensity={1.6}
              transparent
              opacity={0.3}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
