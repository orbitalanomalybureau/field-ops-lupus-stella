import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { WORLD } from "@/game/data";
import { getAudio } from "@/game/audio";
import {
  aimActive,
  consumeEdge,
  lastDevice,
  setAimFriction,
} from "@/game/input";
import type { Device } from "@/game/input";
import {
  emitAim,
  flashAttackPose,
  kick,
  reportHitFrom,
  throughHitStop,
} from "@/game/feedback";
import { noiseLevel, reportNoise } from "@/game/noise";
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
 * are preserved verbatim — this is a restructure plus additions, not a
 * re-tune. The one deliberate widening: the detect radius now scales with
 * noiseLevel(), per the noise.ts contract — how loud you have recently been
 * is part of how visible you are.
 *
 * This component is the sole consumer of the "attack" input edge, branched on
 * posture: aimed (aimActive) fires the pulse rifle — hitscan bolt, energy
 * cells held as module transients, one reportNoise(0.6) broadcast per
 * discharge — while the un-aimed edge keeps the shipped melee verbatim. It
 * also owns aim telemetry (emitAim, ~10 Hz) and the aim-friction call.
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
  /** Seconds of forced detection left — a heard gunshot pins `detected`. */
  alertT: number;
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

/* ------------------------------- pulse rifle ------------------------------ */

const MAX_CELLS = 5;
/** Seconds per recharged cell — but only after CELL_REST_SEC without firing. */
const CELL_RECHARGE_SEC = 1.4;
const CELL_REST_SEC = 0.9;
const SHOT_RANGE = 60;
const SHOT_DAMAGE = 26;
/** Past this range the bolt bleeds down toward SHOT_MIN_DAMAGE at 60 m. */
const SHOT_FALLOFF_M = 35;
const SHOT_MIN_DAMAGE = 15;
/** Post-hit shove — a bolt staggers; it does not launch like a swing. */
const SHOT_KNOCKBACK = 4;
/** cos(accept half-angle) per device — aim assist is honesty about thumbs. */
const SHOT_CONE_COS: Record<Device, number> = {
  keyboard: Math.cos((4 * Math.PI) / 180),
  gamepad: Math.cos((8 * Math.PI) / 180),
  touch: Math.cos((12 * Math.PI) / 180),
};
/** Every discharge is a broadcast: base earshot; night carries it further,
 * a storm cell swallows it — the same masking the signal meter respects. */
const SHOT_EARSHOT = 70;
const SHOT_EARSHOT_STORM = 45;
/** Seconds a heard shot pins a predator's detection on. */
const SHOT_ALERT_SEC = 20;
/** Prismhoofs inside this radius stampede on any discharge. */
const STAMPEDE_RADIUS = 50;
/** Aim telemetry cadence — the HUD reticle's only feed (feedback.ts). */
const AIM_EMIT_SEC = 0.1;
const MUZZLE_SEC = 0.06;
const TRACER_SEC = 0.08;
const SPARK_SEC = 0.16;
/** The bolt flies level at eye height — camera pitch never reaches the store. */
const MUZZLE_HEIGHT = 1.45;

/**
 * Cell/ammo and scoreboard state: module transients by contract — never
 * store state, never saved. The HUD reads them through AIM_EVENT only, so a
 * shot cannot re-render a single React leaf.
 */
let cells = MAX_CELLS;
let cellRechargeT = 0;
let sinceShot = Infinity;
let shotCount = 0;
let shotHits = 0;
let shotKills = 0;
/** Once-per-session fiction latches (the store flag survives reloads). */
let rifleLineShown = false;
let picketLineShown = false;

const Y_AXIS = new THREE.Vector3(0, 1, 0);

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

/**
 * `soft` = medium/high tier: higher segment counts and the two-cone antler
 * gradient. Low keeps the shipped geometry byte-for-byte — 16 agents must
 * never cost the rescue tier a frame.
 */
function PrismhoofMesh({ soft }: { soft: boolean }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.75, 0]}>
        <capsuleGeometry
          args={soft ? [0.28, 0.55, 6, 12] : [0.28, 0.55, 4, 8]}
        />
        <meshStandardMaterial color="#d0c0a8" roughness={0.65} />
      </mesh>
      <mesh castShadow position={[0, 1.2, 0.4]}>
        <sphereGeometry args={soft ? [0.22, 16, 12] : [0.22, 10, 10]} />
        <meshStandardMaterial color="#d8cbb8" />
      </mesh>
      {[-0.12, 0.12].map((sx, i) => (
        <group
          key={i}
          position={[sx, 1.65, 0.42]}
          rotation={[-0.25, 0, sx * 2]}
        >
          {soft ? (
            /* Two stacked cones fake an emissive gradient: dim shaft, hot
               tip. Emissive only — never a light, never a shadow caster. */
            <>
              <mesh position={[0, -0.135, 0]}>
                <coneGeometry args={[0.07, 0.48, 10]} />
                <meshStandardMaterial
                  color="#b0e8ff"
                  emissive="#66ccff"
                  emissiveIntensity={0.55}
                  transparent
                  opacity={0.9}
                  metalness={0.6}
                  roughness={0.2}
                />
              </mesh>
              <mesh position={[0, 0.24, 0]}>
                <coneGeometry args={[0.042, 0.34, 10]} />
                <meshStandardMaterial
                  color="#c8f0ff"
                  emissive="#7fd6ff"
                  emissiveIntensity={1.15}
                  transparent
                  opacity={0.9}
                  metalness={0.6}
                  roughness={0.2}
                />
              </mesh>
            </>
          ) : (
            <mesh>
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
          )}
        </group>
      ))}
      {PRISMHOOF_LEGS.map(([lx, lz], i) => (
        <group key={i} name="leg" position={[lx, 0.7, lz]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 0.7, soft ? 10 : 5]} />
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
 * `soft` = medium/high tier segment counts; low keeps the shipped geometry.
 */
function ShadowfangMesh({
  scavenger = false,
  soft,
}: {
  scavenger?: boolean;
  soft: boolean;
}) {
  const body = scavenger ? "#5f584a" : "#12141a";
  const head = scavenger ? "#575040" : "#0e1016";
  const limb = scavenger ? "#4f4a3e" : "#0e1016";
  const tail = scavenger ? "#453f33" : "#0a0c10";
  const eye = scavenger ? "#42e0cc" : "#ff5500";
  const eyeEmissive = scavenger ? "#2fd4c0" : "#ff4400";
  return (
    <group>
      <mesh castShadow position={[0, 0.5, 0]} scale={[1, 0.85, 1.15]}>
        <capsuleGeometry args={soft ? [0.22, 0.7, 6, 12] : [0.22, 0.7, 4, 8]} />
        <meshStandardMaterial color={body} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.62, 0.55]}>
        <sphereGeometry args={soft ? [0.2, 16, 12] : [0.2, 10, 10]} />
        <meshStandardMaterial color={head} />
      </mesh>
      {[-0.09, 0.09].map((sx, i) => (
        <mesh key={i} name="eye" position={[sx, 0.7, 0.7]}>
          {/* Eyes stay 8x8: bloom over the emissive does the softening. */}
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial
            color={eye}
            emissive={eyeEmissive}
            emissiveIntensity={2.5}
          />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.55, -0.65]} rotation={[-0.5, 0, 0]}>
        <coneGeometry args={[0.08, 0.45, soft ? 10 : 5]} />
        <meshStandardMaterial color={tail} />
      </mesh>
      {SHADOWFANG_LEGS.map(([lx, lz], i) => (
        <group key={i} name="leg" position={[lx, 0.5, lz]}>
          <mesh castShadow position={[0, -0.25, 0]}>
            <cylinderGeometry args={[0.045, 0.055, 0.5, soft ? 10 : 5]} />
            <meshStandardMaterial color={limb} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Creatures() {
  // Mesh-detail gate only — the sim below never reads it. Low tier renders
  // the shipped fauna geometry unchanged; a mid-run auto-tune re-renders the
  // mesh JSX, but the named "leg"/"eye" nodes persist so the mounted Rig
  // handles stay valid.
  const soft = useGameStore((s) => s.quality) !== "low";

  const groupRef = useRef<THREE.Group>(null);
  const ghostRef = useRef<THREE.Group>(null);
  const agents = useRef<Agent[]>([]);
  const rigs = useRef<Rig[]>([]);
  const lastPathLearn = useRef(0);
  const saveTimer = useRef(0);
  const attackCd = useRef(0);
  const memoryApplied = useRef(false);
  const routeCodexShown = useRef(false);
  const muzzleRef = useRef<THREE.Mesh>(null);
  const tracerRef = useRef<THREE.Mesh>(null);
  const sparkRef = useRef<THREE.Mesh>(null);
  /** Remaining life of each pooled discharge visual, seconds. */
  const fxT = useRef({ muzzle: 0, tracer: 0, spark: 0 });
  const aimEmitT = useRef(0);
  /** Last evacUntil acted on, so a collar evac routs predators exactly once. */
  const evacSeen = useRef(0);
  /** Damage-taken feedback throttle (hurt grunt, kick, HUD arc), ms. */
  const hurtAt = useRef(0);

  // Aim friction must not outlive the scene — a stuck 0.55x look sensitivity
  // would follow the player into menus.
  useEffect(() => () => setAimFriction(false), []);

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
        alertT: 0,
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

  useFrame((frameState, delta) => {
    // Hit-stop freezes the creature sim (the kill-confirm beat) but not the
    // camera — PlayerController deliberately does not consume it. Clamped
    // after, so the frame following a stop cannot arrive as a spike.
    const d = Math.min(throughHitStop(delta), 0.05);
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
    // How loud the operative has recently been widens every predator's world
    // (noise.ts contract) — the shot itself decays out of this over ~6 s.
    const noiseBoost = 1 + noiseLevel() * 0.5;

    // ---- Collar auto-evac: the death state empties the field. ----
    const nowMs = performance.now();
    const evacActive = store.evacUntil > nowMs;
    if (store.evacUntil !== evacSeen.current) {
      evacSeen.current = store.evacUntil;
      if (evacActive) {
        // Every predator breaks off when the collar fires — the planet
        // watched the evac too. Forced detection ends with the hunt.
        for (let i = PRED_START; i < COUNT; i++) {
          const a = agents.current[i];
          a.alertT = 0;
          if (a.state !== "dead" && !a.dormant) {
            a.preyIdx = -1;
            setState(a, "retreat");
          }
        }
      }
    }

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

    // ---- Energy cells: recharge only after a beat of not firing. ----
    sinceShot += d;
    if (cells < MAX_CELLS && sinceShot >= CELL_REST_SEC) {
      cellRechargeT += d;
      if (cellRechargeT >= CELL_RECHARGE_SEC) {
        cellRechargeT -= CELL_RECHARGE_SEC;
        cells += 1;
        getAudio().cellTick();
      }
    }

    // ---- Player attack: sole consumer of the edge, branched on posture.
    // Aimed (aimActive) fires the pulse rifle — the raised rifle IS the
    // armed state, so it needs no combat stance; the un-aimed edge keeps the
    // shipped melee verbatim, combat-gated as always. Shared cooldown.
    attackCd.current = Math.max(0, attackCd.current - d);
    const meleeSwing = !aimActive();
    if (
      attackEdge &&
      inMission &&
      attackCd.current <= 0 &&
      !evacActive &&
      (combat || !meleeSwing)
    ) {
      attackCd.current = ATTACK_COOLDOWN;
      const fwdX = -Math.sin(store.playerYaw);
      const fwdZ = -Math.cos(store.playerYaw);
      if (meleeSwing) {
        // Melee: one swing per edge, nearest fang in the cone (shipped).
        flashAttackPose();
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
          if ((tx / td) * fwdX + (tz / td) * fwdZ < ATTACK_CONE) continue;
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
      } else if (cells <= 0) {
        getAudio().dryFire();
      } else {
        // -------- FIRE: hold-to-aim hitscan bolt. --------
        cells -= 1;
        sinceShot = 0;
        cellRechargeT = 0;
        shotCount += 1;
        flashAttackPose(160);
        reportNoise(0.6);
        getAudio().shot();

        // First discharge of a run: the quiet-protocol theme, mechanized.
        // The store flag survives reload so the line never replays.
        if (!rifleLineShown) {
          rifleLineShown = true;
          if (!store.flags["rifle-discharged"]) {
            store.raiseFlag("rifle-discharged");
            store.pushMessage(
              "NET — every discharge is a broadcast, Operative.",
            );
            // Graceful no-op until the codex entry ships in data.ts.
            store.unlockCodex("pulse-rifle");
          }
        }

        // The camera pitch never reaches the store, so the bolt flies level
        // at eye height along the player yaw — the same cone math as the
        // melee swing with a marksman's accept angle. A short terrain march
        // caps the ray, so a hill soaks the bolt and the tracer always ends
        // somewhere real.
        const ox = player.x;
        const oy = player.y + MUZZLE_HEIGHT;
        const oz = player.z;
        let impactT = SHOT_RANGE;
        for (let t = 4; t <= SHOT_RANGE; t += 2) {
          if (sampleHeight(ox + fwdX * t, oz + fwdZ * t) >= oy) {
            impactT = t;
            break;
          }
        }

        // Nearest live body in the accept cone wins; terrain occludes.
        const coneCos = SHOT_CONE_COS[lastDevice()];
        let target: Agent | null = null;
        let targetD = impactT;
        for (let i = 0; i < COUNT; i++) {
          const a = agents.current[i];
          if (a.state === "dead" || a.dormant) continue;
          if (a.kind === "scavenger" && !scavAllowed) continue;
          const tx = a.pos.x - player.x;
          const tz = a.pos.z - player.z;
          const td = Math.hypot(tx, tz);
          if (td > targetD || td < 1e-4) continue;
          if ((tx / td) * fwdX + (tz / td) * fwdZ < coneCos) continue;
          target = a;
          targetD = td;
        }

        // Tracer endpoint: the body hit, or the ground the march found.
        let ex: number;
        let ey: number;
        let ez: number;
        if (target) {
          ex = target.pos.x;
          ey = target.pos.y + 0.6;
          ez = target.pos.z;
        } else {
          ex = ox + fwdX * impactT;
          ez = oz + fwdZ * impactT;
          ey = impactT < SHOT_RANGE ? sampleHeight(ex, ez) + 0.08 : oy;
        }

        if (target && target.kind === "prismhoof") {
          // A shot prismhoof stampedes the herd and drops nothing — the
          // planet gives the trigger-happy no economy at all.
          target.flash = 0.35;
          for (let hi = 0; hi < HERD_COUNT; hi++) {
            const h = agents.current[hi];
            if (h.state !== "dead") setState(h, "flee");
          }
        } else if (target) {
          const wasAmbush = target.state === "ambush";
          const wasWindup = target.state === "lunge" && target.windup > 0;
          // 26 base; combat mods count at half weight — glass is not a
          // discipline — bleeding toward 15 past 35 m.
          const falloff =
            targetD <= SHOT_FALLOFF_M
              ? SHOT_DAMAGE
              : THREE.MathUtils.lerp(
                  SHOT_DAMAGE,
                  SHOT_MIN_DAMAGE,
                  (targetD - SHOT_FALLOFF_M) / (SHOT_RANGE - SHOT_FALLOFF_M),
                );
          target.health -= falloff * (1 + (combatMul - 1) * 0.5);
          // The shipped hit pipeline: shove, eye flare, then the same
          // retreat/collapse/specimen/respawn path as the melee swing.
          V_A.set(target.pos.x - player.x, 0, target.pos.z - player.z)
            .normalize()
            .multiplyScalar(SHOT_KNOCKBACK);
          target.vel.add(V_A);
          target.flash = 0.35;
          shotHits += 1;
          kick(0.35);
          getAudio().hitConfirm();
          if (wasWindup) {
            // Lunge cancel: a bolt in the telegraph window reads the animal
            // and un-writes the pounce — aiming as a skill of reading.
            target.windup = 0;
            target.lungeT = 0;
            target.lungeCd = 2.2;
            setState(target, "flank");
          }
          if (target.health <= 0) {
            killPredator(target);
            shotKills += 1;
            getAudio().killThunk();
            if (wasAmbush) {
              // Picket re-learn: kill a waiting fang from range and the
              // survivors move the ambush — they learn that you learned.
              for (let pi = PRED_START; pi < COUNT; pi++) {
                const p = agents.current[pi];
                if (p === target || p.kind !== target.kind) continue;
                if (p.state === "dead") continue;
                const ang = p.rand() * Math.PI * 2;
                const r = 10 + p.rand() * 6;
                V_B.set(
                  p.learnedBias.x + Math.cos(ang) * r,
                  0,
                  p.learnedBias.z + Math.sin(ang) * r,
                );
                p.learnedBias.lerp(V_B, 0.5);
              }
              if (!picketLineShown) {
                picketLineShown = true;
                store.pushMessage("NET — pack dispersal pattern shifted");
              }
            }
          }
        }

        // Every discharge is a broadcast: forced detection inside earshot,
        // never touching packsAggroed — one loud hunt is not the Broadcast.
        const earshot =
          weather === "storm"
            ? SHOT_EARSHOT_STORM
            : SHOT_EARSHOT * nightBoost;
        for (let pi = PRED_START; pi < COUNT; pi++) {
          const p = agents.current[pi];
          if (p.state === "dead" || p.dormant) continue;
          if (p.kind === "scavenger" && !scavAllowed) continue;
          if (Math.hypot(p.pos.x - player.x, p.pos.z - player.z) > earshot) {
            continue;
          }
          p.alertT = Math.max(p.alertT, SHOT_ALERT_SEC);
          if (
            p.state === "prowl" ||
            p.state === "ambush" ||
            p.state === "feed"
          ) {
            p.preyIdx = -1;
            setState(p, "stalk");
          }
        }
        for (let hi = 0; hi < HERD_COUNT; hi++) {
          const h = agents.current[hi];
          if (h.state === "dead" || h.state === "flee") continue;
          if (
            Math.hypot(h.pos.x - player.x, h.pos.z - player.z) <
            STAMPEDE_RADIUS
          ) {
            setState(h, "flee");
          }
        }

        // Arm the pooled discharge visuals; the render section below fades
        // them. Deterministic — no Math.random anywhere in this path.
        const muzzle = muzzleRef.current;
        if (muzzle) {
          muzzle.position.set(ox + fwdX * 0.9, oy - 0.05, oz + fwdZ * 0.9);
          fxT.current.muzzle = MUZZLE_SEC;
        }
        const tracer = tracerRef.current;
        if (tracer) {
          V_A.set(ex - ox, ey - oy, ez - oz);
          const len = Math.max(V_A.length(), 0.1);
          tracer.position.set((ox + ex) / 2, (oy + ey) / 2, (oz + ez) / 2);
          tracer.quaternion.setFromUnitVectors(Y_AXIS, V_A.normalize());
          tracer.scale.set(1, len, 1);
          fxT.current.tracer = TRACER_SEC;
        }
        const spark = sparkRef.current;
        if (spark) {
          spark.position.set(ex, ey, ez);
          fxT.current.spark = SPARK_SEC;
        }
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
          a.alertT = 0;
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
          // Shipped radius, widened by recent loudness; a heard gunshot
          // (alertT) forces detection outright for its window.
          const detect = (48 / stealth) * nightBoost * stormBoost * noiseBoost;
          const detected = aggro || a.alertT > 0 || dist < detect;
          const biasSet = a.learnedBias.lengthSq() > 1;
          a.lungeCd = Math.max(0, a.lungeCd - d);
          a.alertT = Math.max(0, a.alertT - d);

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
          // an unarmed operative bleeds 16/s. The evac window is a grace
          // period: a routed pack cannot chew on the fade-out.
          if (dist < 2.4 && !evacActive) {
            if (combat) {
              V_A.set(-dx, 0, -dz);
              if (V_A.lengthSq() > 1e-6) {
                a.vel.add(V_A.normalize().multiplyScalar(8 * combatMul));
              }
            } else {
              store.setHealth(store.health - 16 * d);
              // Diegetic damage grammar: a directional camera shove, the
              // HUD arc's bearing, one throttled grunt — no numbers.
              if (nowMs - hurtAt.current > 700) {
                hurtAt.current = nowMs;
                const bearing = Math.atan2(
                  a.pos.x - player.x,
                  a.pos.z - player.z,
                );
                reportHitFrom(bearing);
                kick(0.5, bearing);
                getAudio().hurt();
              }
              if (useGameStore.getState().health <= 0) {
                useGameStore.getState().flatline();
              }
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

    // ---- Aim telemetry (~10 Hz): the HUD reticle's only feed. ----
    aimEmitT.current += d;
    if (aimEmitT.current >= AIM_EMIT_SEC) {
      aimEmitT.current = 0;
      const aiming = aimActive();
      const coneCos = SHOT_CONE_COS[lastDevice()];
      const fwdX = -Math.sin(store.playerYaw);
      const fwdZ = -Math.cos(store.playerYaw);
      let hot = false;
      for (let i = PRED_START; i < COUNT; i++) {
        const a = agents.current[i];
        if (a.state === "dead" || a.dormant) continue;
        if (a.kind === "scavenger" && !scavAllowed) continue;
        const tx = a.pos.x - player.x;
        const tz = a.pos.z - player.z;
        const td = Math.hypot(tx, tz);
        if (td < 1e-4 || td > SHOT_RANGE) continue;
        if ((tx / td) * fwdX + (tz / td) * fwdZ >= coneCos) {
          hot = true;
          break;
        }
      }
      // Reticle on a live predator slows the look — assist, not autoaim.
      setAimFriction(hot && aiming);
      emitAim({
        aiming,
        cells,
        maxCells: MAX_CELLS,
        hot,
        hits: shotHits,
        kills: shotKills,
      });
    }

    // ---- Discharge FX pool: fixed meshes, timers, opacity — no churn. ----
    const fx = fxT.current;
    const muzzle = muzzleRef.current;
    if (muzzle) {
      fx.muzzle = Math.max(0, fx.muzzle - d);
      muzzle.visible = fx.muzzle > 0;
      if (muzzle.visible) {
        // Billboard with a deterministic per-shot roll — never Math.random.
        muzzle.quaternion.copy(frameState.camera.quaternion);
        muzzle.rotateZ(shotCount * 2.4);
        (muzzle.material as THREE.MeshStandardMaterial).opacity =
          0.9 * (fx.muzzle / MUZZLE_SEC);
      }
    }
    const tracer = tracerRef.current;
    if (tracer) {
      fx.tracer = Math.max(0, fx.tracer - d);
      tracer.visible = fx.tracer > 0;
      if (tracer.visible) {
        (tracer.material as THREE.MeshStandardMaterial).opacity =
          0.85 * (fx.tracer / TRACER_SEC);
      }
    }
    const spark = sparkRef.current;
    if (spark) {
      fx.spark = Math.max(0, fx.spark - d);
      spark.visible = fx.spark > 0;
      if (spark.visible) {
        // Scale-pop out, opacity down — a spend, not an explosion.
        const k = 1 - fx.spark / SPARK_SEC;
        spark.scale.setScalar(0.1 + k * 0.38);
        (spark.material as THREE.MeshStandardMaterial).opacity =
          0.9 * (fx.spark / SPARK_SEC);
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
              <PrismhoofMesh soft={soft} />
            ) : (
              <ShadowfangMesh
                scavenger={i >= HERD_COUNT + FANG_COUNT}
                soft={soft}
              />
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
      {/* Pulse-rifle discharge pool: muzzle quad, tracer bolt, impact spark.
          Emissive only — never a light, never a shadow; the frame loop owns
          the timers and opacity does the fading. */}
      <mesh ref={muzzleRef} visible={false}>
        <planeGeometry args={[0.55, 0.55]} />
        <meshStandardMaterial
          color="#dceeff"
          emissive="#9fd4ff"
          emissiveIntensity={4}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={tracerRef} visible={false}>
        <cylinderGeometry args={[0.022, 0.022, 1, 6]} />
        <meshStandardMaterial
          color="#cfe6ff"
          emissive="#7fc0ff"
          emissiveIntensity={3.4}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={sparkRef} visible={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#ffe0b0"
          emissive="#ffb45e"
          emissiveIntensity={3}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
