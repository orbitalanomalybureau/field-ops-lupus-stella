import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGameStore } from "@/game/store";
import { WORLD } from "@/game/data";
import { colliders, entitiesOfKind } from "@/game/entities";
import {
  addMouseLook,
  attachKeyboard,
  consumeEdge,
  debugSetKeys,
  snapshot,
} from "@/game/input";
import {
  SLIDE_SLOPE,
  sampleHeight,
  slopeInfoAt,
  slopeSpeedFactor,
} from "@/game/worldHeight";
import { getAudio } from "@/game/audio";
import { AnimatedCharacter } from "./AnimatedCharacter";
import type { Collider } from "@/game/entities";
import type { AnimState } from "@/game/types";

// Terrain.tsx builds one 480-unit plane centred on z=90; anything past its edge
// is skybox void. The walk box is derived from that mesh so the two cannot
// drift apart, and never exceeds the designed WORLD.bounds play area.
const TERRAIN_SIZE = 480;
const TERRAIN_CENTER_Z = 90;
const TERRAIN_EDGE = TERRAIN_SIZE / 2 - 4;
const WALK_MAX_X = Math.min(WORLD.bounds, TERRAIN_EDGE);
const WALK_MIN_Z = Math.max(-40, TERRAIN_CENTER_Z - TERRAIN_EDGE);
const WALK_MAX_Z = Math.min(WORLD.bounds + 40, TERRAIN_CENTER_Z + TERRAIN_EDGE);

/** 26 m/s² against a 7.4 m/s impulse: a ~1 m hop with ~0.6 s of air. */
const GRAVITY = 26;
const JUMP_SPEED = 7.4;
/** Weak air control — a sprint-jump off Ridge-7 should keep its momentum. */
const AIR_CONTROL = 2.6;
const SLIDE_ACCEL = 20;
const SLIDE_STEER = 5;
const SLIDE_MAX_SPEED = 17;
const STAND_UP_SEC = 0.5;
/** Hysteresis, or ground sitting on the threshold stutters in and out. */
const SLIDE_EXIT = SLIDE_SLOPE - 0.07;
const CAM_PAD = 0.45;
const CAM_MIN_DIST = 1.5;

/** Centre of the command dome — the one shell the player can be inside. */
const HATCH_X = WORLD.domeHatch[0];
const HATCH_Z = WORLD.domeHatch[2];

/**
 * Distance from the origin to the first collider along a unit direction, or
 * `max` if the segment is clear.
 *
 * Colliders are tested as vertical cylinders rather than spheres: a light
 * tower is 8 m tall and 0.5 m wide, and a single sphere either misses it
 * entirely or swallows the ground around its base.
 */
function blockedDistance(
  list: readonly Collider[],
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  max: number,
): number {
  const a = dx * dx + dz * dz;
  if (a < 1e-6) return max;
  let nearest = max;
  for (const c of list) {
    const r = c.radius + CAM_PAD;
    const px = ox - c.x;
    const pz = oz - c.z;
    const cc = px * px + pz * pz - r * r;
    // Already inside the footprint: there is nothing in front to duck behind.
    if (cc <= 0) continue;
    const b = 2 * (px * dx + pz * dz);
    const disc = b * b - 4 * a * cc;
    if (disc <= 0) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t <= 0 || t >= nearest) continue;
    if (oy + dy * t < sampleHeight(c.x, c.z) + (c.height ?? 3)) nearest = t;
  }
  return nearest;
}

export function PlayerController() {
  const group = useRef<THREE.Group>(null);
  const init = useGameStore.getState().playerPos;
  const initYaw = useGameStore.getState().playerYaw;
  const yaw = useRef(initYaw || Math.PI);
  const pitch = useRef(0.06);
  const vel = useRef(new THREE.Vector3());
  const velY = useRef(0);
  const grounded = useRef(true);
  const sliding = useRef(false);
  const standUp = useRef(0);
  const { camera, gl } = useThree();
  const locked = useRef(false);
  const forward = useRef(new THREE.Vector3(0, 0, 1));
  const right = useRef(new THREE.Vector3(1, 0, 0));
  const pathTimer = useRef(0);
  const desired = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const targetVel = useRef(new THREE.Vector3());
  const camPos = useRef(new THREE.Vector3());
  const bob = useRef(0);
  const booted = useRef(false);
  const staminaLocal = useRef(100);
  const audioTick = useRef(0);
  const stepAcc = useRef(0);
  const wasPauseable = useRef(false);
  /** Rolling frame times, so QA can assert a framerate floor. */
  const frameTimes = useRef<number[]>([]);

  const solid = useMemo(() => colliders(), []);
  const generators = useMemo(
    () => entitiesOfKind("generator").map((e) => [e.x, e.z] as const),
    [],
  );

  const character = useGameStore((s) => s.getCharacter());
  const speedMul = character?.speed ?? 1;
  const stamMul = character?.stamina ?? 1;
  const combatMul = character?.combatBonus ?? 1;
  const accent = character?.accent ?? "#3d9e8f";
  const cyberArm = character?.id === "theo";

  useEffect(() => {
    const el = gl.domElement;
    const detachKeyboard = attachKeyboard();
    const onClick = () => {
      const phase = useGameStore.getState().phase;
      if (
        phase === "dialogue" ||
        phase === "paused" ||
        phase === "journal" ||
        phase === "settings" ||
        phase === "photo"
      )
        return;
      if (locked.current) return;
      // Rejects when the embedding page has not granted pointer-lock (the
      // iframe needs allow="pointer-lock"), and in some headless contexts.
      // Newer browsers return a promise, so an unhandled rejection would
      // surface as a page error on every click; the game is still playable
      // without lock via drag-to-look, so this degrades quietly.
      const lock = el.requestPointerLock?.() as unknown;
      if (lock instanceof Promise) lock.catch(() => {});
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === el;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return;
      addMouseLook(e.movementX, e.movementY);
    };

    el.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);

    (window as unknown as { __controlsTest: unknown }).__controlsTest = {
      getYaw: () => yaw.current,
      getSpeed: () => vel.current.length(),
      // Median rather than mean: one 200 ms shader-compile stall should not
      // read as a framerate regression.
      getFps: () => {
        const samples = [...frameTimes.current].sort((a, b) => a - b);
        if (!samples.length) return 0;
        const median = samples[Math.floor(samples.length / 2)];
        return median > 0 ? 1 / median : 0;
      },
      setKeys: debugSetKeys,
      // Headless WebGL runs this scene at a couple of frames a second, and
      // `delta` is clamped for physics stability, so simulated time crawls:
      // walking twelve metres in a test costs minutes of wall clock. Tests
      // place the operative directly instead.
      teleport: (x: number, z: number, newYaw?: number) => {
        const g = group.current;
        if (!g) return;
        g.position.set(x, sampleHeight(x, z), z);
        vel.current.set(0, 0, 0);
        if (newYaw !== undefined) yaw.current = newYaw;
        const s = useGameStore.getState();
        s.setPlayerPos(g.position.x, g.position.y, g.position.z);
        s.setPlayerYaw(yaw.current);
      },
    };

    return () => {
      detachKeyboard();
      el.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    if (frameTimes.current.push(delta) > 120) frameTimes.current.shift();
    const g = group.current;
    if (!g) return;

    // Exactly one snapshot per frame, taken before any early return: look
    // deltas accumulate inside the module and would land as a whip on resume.
    const input = snapshot();
    const phase = useGameStore.getState().phase;
    const pauseable =
      phase === "playing" || phase === "ruins" || phase === "paused";
    // A modal that closes on Escape flips the phase inside the same keypress,
    // so a pause edge only belongs to us if the previous frame was pauseable
    // too — otherwise closing a dialogue would immediately pause the game.
    if (consumeEdge("pause") && pauseable && wasPauseable.current) {
      useGameStore.getState().togglePause();
    }
    wasPauseable.current = pauseable;

    if (
      phase === "paused" ||
      phase === "dialogue" ||
      phase === "journal" ||
      phase === "settings"
    )
      return;

    if (input.combat && (phase === "playing" || phase === "ruins")) {
      const s = useGameStore.getState();
      s.setCombat(!s.combatEnabled);
    }

    yaw.current -= input.lookX;
    pitch.current = THREE.MathUtils.clamp(
      pitch.current - input.lookY,
      -0.95,
      0.55,
    );

    forward.current.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    right.current.set(Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    const mx = input.moveX;
    const mz = input.moveZ;
    const dirX = forward.current.x * mz + right.current.x * mx;
    const dirZ = forward.current.z * mz + right.current.z * mx;

    // Footing goes above SLIDE_SLOPE, and is not regained the instant the
    // ground flattens: the operative skids out the stand-up window first.
    const slope = slopeInfoAt(g.position.x, g.position.z);
    if (grounded.current && slope.slope > SLIDE_SLOPE) {
      sliding.current = true;
      standUp.current = STAND_UP_SEC;
    } else if (
      sliding.current &&
      !(grounded.current && slope.slope > SLIDE_EXIT)
    ) {
      standUp.current -= d;
      if (standUp.current <= 0) sliding.current = false;
    }

    const wantSprint =
      input.sprint && mz > 0 && staminaLocal.current > 2 && !sliding.current;

    if (wantSprint) {
      staminaLocal.current = Math.max(0, staminaLocal.current - (18 * d) / stamMul);
    } else {
      staminaLocal.current = Math.min(100, staminaLocal.current + 12 * d * stamMul);
    }
    useGameStore.getState().setStamina(staminaLocal.current);

    const scanning = input.scan;
    useGameStore.getState().setScanner(scanning);

    const weather = useGameStore.getState().weather;
    const weatherSlow =
      weather === "storm" ? 0.78 : weather === "rain" ? 0.9 : 1;
    const inside = useGameStore.getState().insideDome;

    if (sliding.current && grounded.current) {
      // Scree: the fall line drives, input only steers, friction caps the run.
      vel.current.x +=
        (slope.dx * slope.slope * SLIDE_ACCEL + dirX * SLIDE_STEER) * d;
      vel.current.z +=
        (slope.dz * slope.slope * SLIDE_ACCEL + dirZ * SLIDE_STEER) * d;
      vel.current.multiplyScalar(Math.exp(-1.4 * d));
      if (vel.current.length() > SLIDE_MAX_SPEED) {
        vel.current.setLength(SLIDE_MAX_SPEED);
      }
    } else {
      const base =
        (wantSprint ? 11.5 : scanning ? 3.2 : 6.4) *
        speedMul *
        weatherSlow *
        (inside ? 0.85 : 1) *
        (grounded.current ? slopeSpeedFactor(slope, dirX, dirZ) : 1);
      targetVel.current.set(dirX * base, 0, dirZ * base);
      const accel = !grounded.current ? AIR_CONTROL : wantSprint ? 14 : 11;
      vel.current.lerp(targetVel.current, 1 - Math.exp(-accel * d));
    }

    g.position.x += vel.current.x * d;
    g.position.z += vel.current.z * d;

    g.position.x = THREE.MathUtils.clamp(g.position.x, -WALK_MAX_X, WALK_MAX_X);
    g.position.z = THREE.MathUtils.clamp(g.position.z, WALK_MIN_Z, WALK_MAX_Z);

    // Soft clamp when inside dome
    if (inside) {
      const dx = g.position.x - 0;
      const dz = g.position.z - 6;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.6) {
        g.position.x = (dx / dist) * 3.5;
        g.position.z = 6 + (dz / dist) * 3.5;
      }
    }

    for (const c of solid) {
      // The command dome shell is the one structure the player can be inside;
      // keeping it would shove them straight back out through the hatch.
      if (inside && Math.hypot(c.x - HATCH_X, c.z - HATCH_Z) < 3) continue;
      const dx = g.position.x - c.x;
      const dz = g.position.z - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist < c.radius && dist > 0.001) {
        const push = (c.radius - dist) / c.radius;
        g.position.x += (dx / dist) * push * 0.6;
        g.position.z += (dz / dist) * push * 0.6;
      }
    }

    const groundY = sampleHeight(g.position.x, g.position.z);
    if (input.jump && grounded.current && !sliding.current) {
      velY.current = JUMP_SPEED;
      grounded.current = false;
    }
    if (grounded.current) {
      // The ground-follow lerp is what keeps walking the analytic terrain
      // smooth; only the airborne branch may move y directly.
      g.position.y = THREE.MathUtils.lerp(
        g.position.y,
        groundY,
        1 - Math.exp(-14 * d),
      );
    } else {
      velY.current -= GRAVITY * d;
      g.position.y += velY.current * d;
      if (g.position.y <= groundY) {
        const impact = -velY.current;
        g.position.y = groundY;
        velY.current = 0;
        grounded.current = true;
        if (impact > 4) getAudio().footstep?.(true);
      }
    }

    const spd = vel.current.length();
    if (spd > 0.8 && grounded.current && !sliding.current) {
      bob.current += d * spd * 1.4;
      stepAcc.current += d * spd;
      if (stepAcc.current > (wantSprint ? 1.8 : 2.6)) {
        stepAcc.current = 0;
        getAudio().footstep?.(wantSprint);
      }
    }
    const bobY = Math.sin(bob.current) * Math.min(spd / 10, 1) * 0.06;

    let anim: AnimState = "idle";
    if (sliding.current || !grounded.current) anim = "run";
    else if (scanning) anim = "scan";
    else if (useGameStore.getState().combatEnabled && spd < 1) anim = "combat";
    else if (wantSprint && spd > 2) anim = "run";
    else if (spd > 0.6) anim = "walk";

    g.userData.speed = spd;
    g.userData.anim = anim;
    useGameStore.getState().setPlayerMotion(spd, anim);

    const lookDist = scanning ? 3.8 : 5.4;
    const height = scanning ? 1.85 : 2.25;
    desired.current.set(
      g.position.x - forward.current.x * lookDist,
      g.position.y + height + bobY - pitch.current * 0.8,
      g.position.z - forward.current.z * lookDist,
    );

    // Duck in front of whatever the chase camera would otherwise sit inside.
    // The correction moves the target, not the camera, so the smoothing below
    // still does the actual travel.
    const headY = g.position.y + 1.5;
    const cx = desired.current.x - g.position.x;
    const cy = desired.current.y - headY;
    const cz = desired.current.z - g.position.z;
    const camDist = Math.hypot(cx, cy, cz);
    if (camDist > 0.001) {
      const ux = cx / camDist;
      const uy = cy / camDist;
      const uz = cz / camDist;
      const hit = blockedDistance(
        solid,
        g.position.x,
        headY,
        g.position.z,
        ux,
        uy,
        uz,
        camDist,
      );
      if (hit < camDist) {
        const pull = Math.max(CAM_MIN_DIST, hit - CAM_PAD);
        desired.current.set(
          g.position.x + ux * pull,
          headY + uy * pull,
          g.position.z + uz * pull,
        );
      }
    }

    const camGround = sampleHeight(desired.current.x, desired.current.z) + 0.6;
    if (desired.current.y < camGround) desired.current.y = camGround;

    lookTarget.current.set(
      g.position.x + forward.current.x * 5,
      g.position.y + 1.4 + pitch.current * 3.5 + bobY,
      g.position.z + forward.current.z * 5,
    );

    if (!booted.current) {
      booted.current = true;
      camPos.current.copy(desired.current);
      camera.position.copy(desired.current);
    }
    camPos.current.lerp(desired.current, 1 - Math.exp(-11 * d));
    camera.position.copy(camPos.current);
    camera.lookAt(lookTarget.current);

    const persp = camera as THREE.PerspectiveCamera;
    persp.fov = THREE.MathUtils.lerp(
      persp.fov,
      scanning ? 48 : wantSprint ? 62 : 56,
      1 - Math.exp(-6 * d),
    );
    persp.updateProjectionMatrix();

    if (spd > 0.5) {
      g.rotation.y = Math.atan2(vel.current.x, vel.current.z);
    } else {
      g.rotation.y = Math.atan2(forward.current.x, forward.current.z);
    }

    const store = useGameStore.getState();
    store.setPlayerPos(g.position.x, g.position.y, g.position.z);
    store.setPlayerYaw(yaw.current);
    store.setCompass(((-yaw.current * 180) / Math.PI + 360) % 360);

    pathTimer.current += d;
    if (pathTimer.current > 0.5 && spd > 0.5) {
      pathTimer.current = 0;
      store.samplePath(g.position.x, g.position.z);
    }

    let signal = 0.22;
    for (const [gx, gz] of generators) {
      const dd = Math.hypot(g.position.x - gx, g.position.z - gz);
      if (dd < 22) signal += (1 - dd / 22) * 0.14;
    }
    const ruinD = Math.hypot(
      g.position.x - WORLD.ruinPos[0],
      g.position.z - WORLD.ruinPos[2],
    );
    if (ruinD < 50) signal += (1 - ruinD / 50) * 0.55;
    if (weather === "storm") signal *= 0.55;
    store.setSignal(THREE.MathUtils.clamp(signal, 0, 1));

    audioTick.current += d;
    if (audioTick.current > 0.25) {
      audioTick.current = 0;
      const a = getAudio();
      a.setOutdoor(THREE.MathUtils.clamp((g.position.z - 20) / 80, 0, 1));
      a.setTension(
        store.trackedByFang ? 0.85 : weather === "storm" ? 0.55 : signal * 0.4,
      );
      a.setNearFern(
        g.position.z > WORLD.treelineZ - 10 && g.position.z < WORLD.treelineZ + 40
          ? weather === "storm"
            ? 0.1
            : 0.8
          : 0.1,
      );
    }
  });

  const combat = useGameStore((s) => s.combatEnabled);
  const sy = sampleHeight(init.x, init.z);

  return (
    <group ref={group} position={[init.x, sy, init.z]}>
      <AnimatedCharacter
        accent={accent}
        combat={combat}
        cyberArm={cyberArm}
      />
      <spotLight
        position={[0, 1.7, 0.4]}
        angle={0.45}
        penumbra={0.5}
        intensity={combat ? 22 * combatMul : 10}
        distance={20}
        color="#fff0d8"
        castShadow
      />
    </group>
  );
}
