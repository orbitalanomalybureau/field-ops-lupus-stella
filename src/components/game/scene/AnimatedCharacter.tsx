import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { sampleHeight } from "@/game/worldHeight";
import { AIM_EVENT, attackPoseActive } from "@/game/feedback";
import type { AimTelemetry } from "@/game/feedback";
import { useGameStore } from "@/game/store";
import type { AnimState } from "@/game/types";

type Props = {
  accent?: string;
  combat?: boolean;
  cyberArm?: boolean;
  variant?: "operative" | "colonist";
};

// Suit palette warmed a step from the shipped blue-slate so the kit sits in
// the amber key light instead of fighting it; still comfortably >= 0.2 albedo.
const SUIT = "#454b4e";
const DARK = "#2a2e33";
const BOOT = "#2e2f34";
const PACK = "#343a3f";
const SKIN = "#c19a7b";
const HAIR = "#4a4038";

/** Park-Miller LCG — the repo's seeded-random pattern (see Forest.tsx). */
function lcg(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** FNV-1a. Desyncs gait phase / idle glances across NPC instances while
 * staying deterministic per (accent, variant) for golden screenshots. */
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

function approach(
  current: number,
  target: number,
  rate: number,
  dt: number,
): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function SuitMaterial({
  cyber,
  accent,
  roughness = 0.55,
}: {
  cyber: boolean;
  accent: string;
  /** Per-panel roughness variance (0.45-0.7 band) — cloth is never one value. */
  roughness?: number;
}) {
  return cyber ? (
    <meshStandardMaterial
      color={accent}
      emissive={accent}
      emissiveIntensity={0.45}
      metalness={0.75}
      roughness={0.25}
    />
  ) : (
    <meshStandardMaterial color={SUIT} metalness={0.3} roughness={roughness} />
  );
}

const wp = new THREE.Vector3();

/**
 * Procedural humanoid — EVA survey suit, ~1.8 m, all primitives.
 *
 * COORDINATE CANON: the rig faces +z (chest plate at z=+0.13, pack at
 * z=-0.2) with +y up, so the character's anatomical LEFT is +x and RIGHT is
 * -x. Theo's cybernetic arm is the LEFT (novel canon): the cyber / scan /
 * instrument arm lives at +x, the weapon arm at -x. Every side-dependent
 * sign below (abduction z, aim/scan head yaw and cant, spine blading)
 * follows from that convention — do not "fix" one without the others.
 *
 * Joint chain: pelvis (bob/sway/counter-yaw/crouch) -> hips -> knees ->
 * ankles, and pelvis -> spine (pitch/shoulder counter-yaw) -> chest ->
 * shoulders -> elbows, chest -> neck -> head. Ribcage is a separate group so
 * breathing scale does not stretch the arms.
 *
 * All pose targets blend through eased weights (exp approach), so anim-state
 * changes never snap. Motion is read from parent.userData exactly as before
 * (PlayerController and the NPC system both drive it that way). Airborne is
 * inferred from clearance over the analytic terrain since userData carries no
 * vertical state.
 *
 * "aim" shoulders the rifle (both arms on the weapon, head over the right
 * shoulder, stance squared); "attack" is the ~0.2 s melee sweep, driven by the
 * anim state or by feedback's attack-pose window, whichever arrives first.
 */
export function AnimatedCharacter({
  accent = "#3d9e8f",
  combat = false,
  cyberArm = true,
  variant = "operative",
}: Props) {
  // Low tier renders the shipped geometry byte-for-byte; the softer segment
  // counts and the visor clearcoat below are a medium/high spend (~+40% rig
  // vertices, <= ~8 rig instances in the scene).
  const soft = useGameStore((s) => s.quality) !== "low";

  const root = useRef<THREE.Group>(null);
  const pelvis = useRef<THREE.Group>(null);
  const spine = useRef<THREE.Group>(null);
  const ribcage = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const hipL = useRef<THREE.Group>(null);
  const hipR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const ankleL = useRef<THREE.Group>(null);
  const ankleR = useRef<THREE.Group>(null);
  const shL = useRef<THREE.Group>(null);
  const shR = useRef<THREE.Group>(null);
  const elL = useRef<THREE.Group>(null);
  const elR = useRef<THREE.Group>(null);
  const weapon = useRef<THREE.Mesh>(null);

  const phase = useRef((hashString(accent + variant) % 628) / 100);
  const idleT = useRef(0);
  const rng = useRef(lcg(hashString(variant + accent)));
  const look = useRef({ yaw: 0, pitch: 0, curYaw: 0, curPitch: 0, timer: 0 });
  const weights = useRef({
    move: 0,
    run: 0,
    scan: 0,
    cbt: 0,
    crouch: 0,
    air: 0,
    aim: 0,
    atk: 0,
  });
  /** Shot-recoil impulse, 1 -> 0. Fed by aim telemetry, spent in useFrame. */
  const rec = useRef(0);
  const prevCells = useRef<number | null>(null);

  // A discharge is a cells decrement in the aim telemetry (~10 Hz, cheap).
  // Every character instance shares the window event, but the impulse is
  // scaled by the aim weight at application time, so NPCs — whose anim never
  // reads "aim" — cannot twitch when the operative fires.
  useEffect(() => {
    const onAim = (e: Event) => {
      const t = (e as CustomEvent<AimTelemetry>).detail;
      const prev = prevCells.current;
      prevCells.current = t.cells;
      if (prev !== null && t.cells < prev) rec.current = 1;
    };
    window.addEventListener(AIM_EVENT, onAim);
    return () => window.removeEventListener(AIM_EVENT, onAim);
  }, []);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const ud = root.current?.parent?.userData as
      | { speed?: number; anim?: AnimState }
      | undefined;
    const speed = ud?.speed ?? 0;
    const anim = ud?.anim ?? "idle";

    const w = weights.current;
    // speed > 0.7 keeps the legs cycling while scan/combat anims move.
    const moving = anim === "walk" || anim === "run" || speed > 0.7;
    w.move = approach(w.move, moving ? 1 : 0, 8, d);
    w.run = approach(w.run, anim === "run" ? 1 : 0, 6, d);
    w.scan = approach(w.scan, anim === "scan" ? 1 : 0, 7, d);
    w.cbt = approach(w.cbt, combat ? 1 : 0, 7, d);
    w.crouch = approach(w.crouch, anim === "combat" ? 1 : 0, 7, d);
    w.aim = approach(w.aim, anim === "aim" ? 1 : 0, 10, d);
    // The melee sweep: Creatures flashes the pose window on a swing and the
    // controller reports anim "attack" for the same beat — honor either, so
    // the arm reads even if one writer lags a frame. Fast in, slower out is
    // what makes a single eased weight look like a strike.
    const striking = anim === "attack" || attackPoseActive();
    w.atk = approach(w.atk, striking ? 1 : 0, striking ? 26 : 11, d);
    rec.current = Math.max(0, rec.current - d * 7);

    // PlayerController maps airborne to anim "run"; clearance filters out
    // grounded sprint. NPCs never leave the ground so this stays 0 for them.
    let airTarget = 0;
    if (root.current && anim === "run") {
      root.current.getWorldPosition(wp);
      if (wp.y - sampleHeight(wp.x, wp.z) > 0.35) airTarget = 1;
    }
    w.air = approach(w.air, airTarget, 10, d);

    const speedNorm = Math.min(speed / 7, 1);
    if (w.move > 0.01) {
      phase.current += d * (6.5 + 5.5 * w.run) * (0.45 + 0.75 * speedNorm);
    }
    idleT.current += d;

    const t = idleT.current;
    const p = phase.current;
    // Rig faces +z: anatomical left = +x (see component doc). The L phase is
    // negated so each limb keeps the same timing relative to its own side
    // after the canon arm swap — the gait is the exact mirror of the old rig.
    const sL = -Math.sin(p);
    const cL = -Math.cos(p);
    const sR = -sL;
    const cR = -cL;

    const gait = w.move * (1 - w.air);
    // Aiming stills the idle sway/glances the same way scan and combat do.
    const idleW = (1 - w.move) * (1 - w.scan) * (1 - w.cbt) * (1 - w.aim);
    const crouchLeg = w.crouch * (1 - gait);
    // The strike briefly owns the weapon arm; aim resumes as it decays.
    const atkW = w.atk;
    const aimW = w.aim * (1 - atkW);
    const recoil = rec.current * aimW;

    // Seeded idle glance retargeting — never Math.random (golden screenshots).
    const lk = look.current;
    lk.timer -= d;
    if (lk.timer <= 0) {
      const r = rng.current;
      lk.yaw = (r() * 2 - 1) * 0.55;
      lk.pitch = (r() * 2 - 1) * 0.12;
      lk.timer = 3.5 + r() * 3.5;
    }
    lk.curYaw = approach(lk.curYaw, lk.yaw, 2, d);
    lk.curPitch = approach(lk.curPitch, lk.pitch, 2, d);

    const hipAmp = 0.45 + 0.35 * w.run;
    const kneeAmp = 0.75 + 0.45 * w.run;
    const armAmp = 0.35 + 0.4 * w.run;
    const footAmp = 0.3 + 0.15 * w.run;

    // Legs. Knee flexes on max(0, cos) — forward swing only, extended through
    // stance. Ankle -sin gives heel-strike toes-up, toe-off push at the back.
    if (hipL.current) {
      hipL.current.rotation.x =
        -hipAmp * sL * gait + 0.3 * w.air - 0.3 * crouchLeg;
      // The left leg hangs at +x, so NEGATIVE z narrows it inward — the aim
      // stance squares up slightly.
      hipL.current.rotation.z = -0.07 * w.scan + 0.1 * crouchLeg - 0.05 * aimW;
    }
    if (kneeL.current) {
      kneeL.current.rotation.x =
        (kneeAmp * Math.max(0, cL) + 0.05) * gait +
        0.55 * crouchLeg +
        0.6 * w.air;
    }
    if (ankleL.current) {
      ankleL.current.rotation.x =
        -footAmp * sL * gait - 0.25 * crouchLeg + 0.25 * w.air;
    }
    if (hipR.current) {
      hipR.current.rotation.x =
        -hipAmp * sR * gait + 0.3 * w.air - 0.3 * crouchLeg;
      hipR.current.rotation.z = 0.07 * w.scan - 0.1 * crouchLeg + 0.05 * aimW;
    }
    if (kneeR.current) {
      kneeR.current.rotation.x =
        (kneeAmp * Math.max(0, cR) + 0.05) * gait +
        0.55 * crouchLeg +
        0.6 * w.air;
    }
    if (ankleR.current) {
      ankleR.current.rotation.x =
        -footAmp * sR * gait - 0.25 * crouchLeg + 0.25 * w.air;
    }

    // Pelvis: cos(2p) bobs once per STEP (twice per cycle) — the single-
    // frequency bob was the old pogo-stick. Yaw counter-rotates vs shoulders.
    if (pelvis.current) {
      pelvis.current.position.y =
        0.95 -
        0.09 * crouchLeg -
        0.03 * w.air +
        Math.cos(2 * p) * (0.018 + 0.03 * w.run) * gait;
      pelvis.current.position.x =
        0.012 * sL * gait + 0.015 * Math.sin(t * 0.45) * idleW;
      pelvis.current.rotation.y = 0.09 * sL * gait;
      pelvis.current.rotation.z =
        0.03 * sL * gait + 0.02 * Math.sin(t * 0.45) * idleW;
    }
    if (spine.current) {
      spine.current.rotation.x =
        0.04 +
        0.12 * w.run * gait +
        0.1 * w.cbt +
        0.06 * w.scan -
        0.05 * w.air +
        0.06 * aimW;
      // -y blades the right (-x, weapon) shoulder back into the stock; the
      // strike swings the torso the other way, through the sweep.
      spine.current.rotation.y = -0.16 * sL * gait - 0.12 * aimW + 0.25 * atkW;
    }
    if (ribcage.current) {
      const br = Math.sin(t * 2.3) * (0.4 + 0.6 * idleW);
      ribcage.current.scale.set(1 + 0.008 * br, 1 + 0.014 * br, 1 + 0.02 * br);
    }

    // Arms counter-swing the same-side leg; scan owns the LEFT (+x,
    // instrument) arm, combat owns the right (and the left when not
    // scanning). Aim owns both — the RIGHT (-x, weapon) extends the rifle,
    // the left crosses to support the fore-end — so the guard poses fade out
    // under it rather than stacking.
    const cbtL = w.cbt * (1 - w.scan) * (1 - aimW);
    const cbtR = w.cbt * (1 - 0.5 * w.scan) * (1 - Math.max(aimW, atkW));
    const poseL = Math.max(cbtL, w.scan, aimW);
    const poseR = Math.max(cbtR, aimW, atkW);
    if (shL.current) {
      shL.current.rotation.x =
        armAmp * sL * gait * (1 - poseL) -
        1.3 * w.scan -
        0.85 * cbtL -
        1.2 * aimW +
        0.15 * w.air;
      // Left arm hangs at +x: POSITIVE z abducts outward (air flare, cyber
      // bulk); scan, guard and aim-support pull it inward across the chest.
      shL.current.rotation.z =
        0.1 +
        (cyberArm ? 0.06 : 0) +
        0.3 * w.air -
        0.15 * w.scan -
        0.45 * cbtL -
        0.55 * aimW;
    }
    if (elL.current) {
      elL.current.rotation.x =
        -0.12 -
        (0.18 + (0.35 + 0.5 * w.run) * Math.max(0, -sL)) * gait * (1 - poseL) -
        1.05 * w.scan -
        0.95 * cbtL -
        1.0 * aimW;
    }
    if (shR.current) {
      // `recoil` shoves the extended arm back toward the shoulder on a
      // discharge; the spring in rec.current settles it in a few frames.
      shR.current.rotation.x =
        armAmp * sR * gait * (1 - poseR) -
        1.0 * cbtR -
        1.5 * aimW -
        1.35 * atkW +
        0.15 * w.air +
        0.25 * recoil;
      // Right arm hangs at -x: NEGATIVE z abducts outward; guard, aim and
      // the strike sweep pull it inward toward the centreline.
      shR.current.rotation.z =
        -0.1 - 0.3 * w.air + 0.35 * cbtR + 0.3 * aimW + 0.6 * atkW;
    }
    if (elR.current) {
      elR.current.rotation.x =
        -0.12 -
        (0.18 + (0.35 + 0.5 * w.run) * Math.max(0, -sR)) * gait * (1 - poseR) -
        0.55 * cbtR -
        0.2 * aimW -
        0.45 * atkW;
    }
    // The rifle is a permanent child of the wrist, toggled per frame: aim
    // must show it even outside combat stance, and React reconciliation does
    // not run at posture speed.
    if (weapon.current) {
      weapon.current.visible = combat || w.aim > 0.05;
    }

    // Head: idle glances, slight counter-yaw to the gait, tilts down toward
    // the LEFT (+x) wrist instrument while scanning, up a touch when
    // airborne. Aim brings the head over the true RIGHT (-x, weapon)
    // shoulder and cants the cheek to the stock.
    if (head.current) {
      head.current.rotation.y =
        lk.curYaw * idleW + 0.1 * sL * gait + 0.15 * w.scan - 0.08 * aimW;
      head.current.rotation.x =
        lk.curPitch * idleW +
        0.42 * w.scan +
        0.06 * w.run * gait -
        0.1 * w.air +
        0.04 * aimW;
      head.current.rotation.z = 0.1 * aimW;
    }
  });

  const op = variant === "operative";

  return (
    <group ref={root}>
      <group ref={pelvis} position={[0, 0.95, 0]}>
        <mesh castShadow position={[0, 0.02, 0]}>
          {/* Kept a box: it sits under the belt trim and never reads. */}
          <boxGeometry args={[0.3, 0.16, 0.21]} />
          <meshStandardMaterial color={SUIT} metalness={0.3} roughness={0.57} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.32, 0.05, 0.22]} />
          <meshStandardMaterial
            color={DARK}
            emissive={accent}
            emissiveIntensity={0.15}
            metalness={0.4}
            roughness={0.45}
          />
        </mesh>

        {/* Left leg (+x — rig faces +z, so anatomical left = +x) */}
        <group ref={hipL} position={[0.105, -0.05, 0]}>
          <mesh castShadow position={[0, -0.2, 0]}>
            <capsuleGeometry
              args={soft ? [0.085, 0.26, 4, 10] : [0.085, 0.26, 4, 8]}
            />
            <meshStandardMaterial color={SUIT} roughness={0.62} />
          </mesh>
          <group ref={kneeL} position={[0, -0.41, 0]}>
            <mesh position={[0, 0, 0.055]}>
              <sphereGeometry args={[0.055, 8, 8]} />
              <meshStandardMaterial color={DARK} roughness={0.5} />
            </mesh>
            <mesh position={[0, -0.18, 0]}>
              <capsuleGeometry
                args={soft ? [0.068, 0.24, 4, 10] : [0.068, 0.24, 4, 8]}
              />
              <meshStandardMaterial color={SUIT} roughness={0.58} />
            </mesh>
            <group ref={ankleL} position={[0, -0.38, 0]}>
              <mesh
                position={[0, -0.045, 0.05]}
                rotation={soft ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
                scale={soft ? [1.15, 1, 0.8] : [1, 1, 1]}
              >
                {soft ? (
                  <capsuleGeometry args={[0.062, 0.17, 2, 8]} />
                ) : (
                  <boxGeometry args={[0.14, 0.1, 0.29]} />
                )}
                <meshStandardMaterial color={BOOT} roughness={0.66} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Right leg (-x) */}
        <group ref={hipR} position={[-0.105, -0.05, 0]}>
          <mesh castShadow position={[0, -0.2, 0]}>
            <capsuleGeometry
              args={soft ? [0.085, 0.26, 4, 10] : [0.085, 0.26, 4, 8]}
            />
            <meshStandardMaterial color={SUIT} roughness={0.62} />
          </mesh>
          <group ref={kneeR} position={[0, -0.41, 0]}>
            <mesh position={[0, 0, 0.055]}>
              <sphereGeometry args={[0.055, 8, 8]} />
              <meshStandardMaterial color={DARK} roughness={0.5} />
            </mesh>
            <mesh position={[0, -0.18, 0]}>
              <capsuleGeometry
                args={soft ? [0.068, 0.24, 4, 10] : [0.068, 0.24, 4, 8]}
              />
              <meshStandardMaterial color={SUIT} roughness={0.58} />
            </mesh>
            <group ref={ankleR} position={[0, -0.38, 0]}>
              <mesh
                position={[0, -0.045, 0.05]}
                rotation={soft ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
                scale={soft ? [1.15, 1, 0.8] : [1, 1, 1]}
              >
                {soft ? (
                  <capsuleGeometry args={[0.062, 0.17, 2, 8]} />
                ) : (
                  <boxGeometry args={[0.14, 0.1, 0.29]} />
                )}
                <meshStandardMaterial color={BOOT} roughness={0.66} />
              </mesh>
            </group>
          </group>
        </group>

        <group ref={spine} position={[0, 0.14, 0]}>
          {/* Waist */}
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.115, 0.13, 0.16, soft ? 14 : 10]} />
            <meshStandardMaterial color={DARK} roughness={0.52} />
          </mesh>

          <group position={[0, 0.2, 0]}>
            <group ref={ribcage}>
              <mesh castShadow position={[0, 0.05, 0]}>
                <boxGeometry args={[0.38, 0.34, 0.24]} />
                <meshStandardMaterial
                  color={SUIT}
                  metalness={0.35}
                  roughness={0.5}
                />
              </mesh>
              {/* Shoulder yoke — wider than the hips */}
              <mesh position={[0, 0.17, 0]}>
                <boxGeometry args={[0.46, 0.1, 0.22]} />
                <meshStandardMaterial
                  color={DARK}
                  metalness={0.4}
                  roughness={0.45}
                />
              </mesh>
              <mesh position={[0, 0.04, 0.13]}>
                <boxGeometry args={[0.3, 0.22, 0.05]} />
                <meshStandardMaterial
                  color={DARK}
                  metalness={0.5}
                  roughness={0.45}
                />
              </mesh>
              {/* Chest lamp: emissive + bloom replaces the old per-character
                  point light (up to 7 instances would mean 7 dynamic lights) */}
              <mesh position={[0.1, 0.13, 0.13]}>
                <boxGeometry args={[0.08, 0.05, 0.03]} />
                <meshStandardMaterial
                  color="#101418"
                  emissive="#ffe8c4"
                  emissiveIntensity={1.4}
                />
              </mesh>
              {op && (
                <>
                  {/* Pack shell: rounded on medium/high (same single shadow
                      caster as the shipped box — a swap, not an addition). */}
                  <mesh
                    castShadow
                    position={[0, 0.02, -0.2]}
                    scale={soft ? [1.05, 1, 0.5] : [1, 1, 1]}
                  >
                    {soft ? (
                      <capsuleGeometry args={[0.16, 0.12, 4, 10]} />
                    ) : (
                      <boxGeometry args={[0.34, 0.4, 0.16]} />
                    )}
                    <meshStandardMaterial
                      color={PACK}
                      metalness={0.4}
                      roughness={0.52}
                    />
                  </mesh>
                  <mesh position={[0, 0.16, -0.205]}>
                    <boxGeometry args={[0.35, 0.05, 0.165]} />
                    <meshStandardMaterial
                      color={DARK}
                      emissive={accent}
                      emissiveIntensity={0.3}
                    />
                  </mesh>
                </>
              )}
            </group>

            {/* LEFT arm (cyber / scan / instrument arm) — rig faces +z, so
                anatomical left = +x. Novel canon: Theo's cybernetic arm is
                the LEFT; this subtree must stay on +x. */}
            <group ref={shL} position={[0.27, 0.16, 0]}>
              <mesh position={[0.02, 0.03, 0]} scale={[1.15, 0.75, 1.05]}>
                <sphereGeometry args={[0.095, 10, 10]} />
                <meshStandardMaterial
                  color={DARK}
                  metalness={0.4}
                  roughness={0.48}
                />
              </mesh>
              <mesh position={[0, -0.14, 0]}>
                <capsuleGeometry
                  args={soft ? [0.065, 0.18, 6, 12] : [0.065, 0.18, 4, 8]}
                />
                <SuitMaterial
                  cyber={cyberArm}
                  accent={accent}
                  roughness={0.58}
                />
              </mesh>
              <group ref={elL} position={[0, -0.3, 0]}>
                <mesh position={[0, -0.13, 0]}>
                  <capsuleGeometry
                    args={soft ? [0.058, 0.16, 6, 12] : [0.058, 0.16, 4, 8]}
                  />
                  <SuitMaterial
                    cyber={cyberArm}
                    accent={accent}
                    roughness={0.62}
                  />
                </mesh>
                {/* Wrist survey instrument — screen faces +z, toward the
                    visor when the scan pose raises this forearm. */}
                <mesh position={[0, -0.2, 0.06]}>
                  <boxGeometry args={[0.085, 0.06, 0.11]} />
                  <meshStandardMaterial
                    color="#101418"
                    emissive={accent}
                    emissiveIntensity={0.6}
                    metalness={0.5}
                    roughness={0.35}
                  />
                </mesh>
                <mesh position={[0, -0.31, 0.01]} scale={[0.85, 1.1, 1]}>
                  <sphereGeometry args={[0.07, 10, 10]} />
                  <SuitMaterial
                    cyber={cyberArm}
                    accent={accent}
                    roughness={0.55}
                  />
                </mesh>
              </group>
            </group>

            {/* RIGHT arm (weapon arm) — anatomical right = -x. */}
            <group ref={shR} position={[-0.27, 0.16, 0]}>
              <mesh position={[-0.02, 0.03, 0]} scale={[1.15, 0.75, 1.05]}>
                <sphereGeometry args={[0.095, 10, 10]} />
                <meshStandardMaterial
                  color={DARK}
                  metalness={0.4}
                  roughness={0.48}
                />
              </mesh>
              <mesh position={[0, -0.14, 0]}>
                <capsuleGeometry
                  args={soft ? [0.065, 0.18, 6, 12] : [0.065, 0.18, 4, 8]}
                />
                <meshStandardMaterial
                  color={SUIT}
                  metalness={0.3}
                  roughness={0.52}
                />
              </mesh>
              <group ref={elR} position={[0, -0.3, 0]}>
                <mesh position={[0, -0.13, 0]}>
                  <capsuleGeometry
                    args={soft ? [0.058, 0.16, 6, 12] : [0.058, 0.16, 4, 8]}
                  />
                  <meshStandardMaterial
                    color={SUIT}
                    metalness={0.3}
                    roughness={0.6}
                  />
                </mesh>
                <mesh position={[0, -0.31, 0.01]} scale={[0.85, 1.1, 1]}>
                  <sphereGeometry args={[0.07, 10, 10]} />
                  <meshStandardMaterial
                    color={SUIT}
                    metalness={0.3}
                    roughness={0.5}
                  />
                </mesh>
                {/* Pulse rifle. Always mounted; useFrame drives visibility
                    (combat stance, or any aim weight) so raising the weapon
                    never waits on a React render. */}
                <mesh
                  ref={weapon}
                  visible={combat}
                  position={[0, -0.32, 0.08]}
                  rotation={[1.35, 0, 0]}
                >
                  <boxGeometry args={[0.07, 0.07, 0.55]} />
                  <meshStandardMaterial
                    color="#12161c"
                    metalness={0.75}
                    roughness={0.3}
                  />
                </mesh>
              </group>
            </group>

            {/* Neck + head */}
            <group position={[0, 0.26, 0]}>
              <mesh>
                <cylinderGeometry args={[0.055, 0.065, 0.09, 8]} />
                <meshStandardMaterial
                  color={op ? DARK : SKIN}
                  roughness={0.6}
                />
              </mesh>
              <group ref={head} position={[0, 0.08, 0]}>
                {op ? (
                  <>
                    <mesh castShadow position={[0, 0.03, 0]} scale={[1, 1.06, 1.02]}>
                      <sphereGeometry
                        args={soft ? [0.135, 20, 14] : [0.135, 14, 12]}
                      />
                      <meshStandardMaterial
                        color={DARK}
                        metalness={0.45}
                        roughness={0.4}
                      />
                    </mesh>
                    <mesh position={[0, 0.03, 0.085]} scale={[1.15, 0.72, 0.62]}>
                      <sphereGeometry
                        args={soft ? [0.1, 18, 12] : [0.1, 12, 10]}
                      />
                      {soft ? (
                        /* The rig's ONE physical material: clearcoat gives
                           the visor a glass sheen a standard material cannot
                           fake. <= ~8 rig instances, so the extra shader
                           cost is negligible; low keeps the shipped
                           standard material. */
                        <meshPhysicalMaterial
                          color="#0c1a1a"
                          emissive={accent}
                          emissiveIntensity={0.75}
                          metalness={0.7}
                          roughness={0.22}
                          clearcoat={0.8}
                          clearcoatRoughness={0.25}
                        />
                      ) : (
                        <meshStandardMaterial
                          color="#0c1a1a"
                          emissive={accent}
                          emissiveIntensity={0.75}
                          metalness={0.7}
                          roughness={0.25}
                        />
                      )}
                    </mesh>
                  </>
                ) : (
                  <>
                    <mesh castShadow position={[0, 0.03, 0]}>
                      <sphereGeometry
                        args={soft ? [0.11, 18, 14] : [0.11, 12, 12]}
                      />
                      <meshStandardMaterial color={SKIN} roughness={0.7} />
                    </mesh>
                    <mesh position={[0, 0.065, -0.015]} scale={[1.02, 0.8, 1.02]}>
                      <sphereGeometry
                        args={soft ? [0.112, 16, 12] : [0.112, 12, 10]}
                      />
                      <meshStandardMaterial color={HAIR} roughness={0.85} />
                    </mesh>
                  </>
                )}
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
