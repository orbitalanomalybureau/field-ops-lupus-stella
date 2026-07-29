import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useGameStore } from "@/game/store";
import { WORLD } from "@/game/data";
import { sampleHeight } from "@/game/worldHeight";
import { getAudio } from "@/game/audio";
import { AnimatedCharacter } from "./AnimatedCharacter";
import type { AnimState } from "@/game/types";

type Keys = Set<string>;

// Terrain.tsx builds one 480-unit plane centred on z=90; anything past its edge
// is skybox void. The walk box is derived from that mesh so the two cannot
// drift apart, and never exceeds the designed WORLD.bounds play area.
const TERRAIN_SIZE = 480;
const TERRAIN_CENTER_Z = 90;
const TERRAIN_EDGE = TERRAIN_SIZE / 2 - 4;
const WALK_MAX_X = Math.min(WORLD.bounds, TERRAIN_EDGE);
const WALK_MIN_Z = Math.max(-40, TERRAIN_CENTER_Z - TERRAIN_EDGE);
const WALK_MAX_Z = Math.min(WORLD.bounds + 40, TERRAIN_CENTER_Z + TERRAIN_EDGE);

function getTouch() {
  return (
    window as unknown as {
      __touchInput?: {
        mx: number;
        my: number;
        lx: number;
        ly: number;
        sprint: boolean;
        interact: boolean;
        scan?: boolean;
      };
    }
  ).__touchInput;
}

export function PlayerController() {
  const group = useRef<THREE.Group>(null);
  const keys = useRef<Keys>(new Set());
  const init = useGameStore.getState().playerPos;
  const initYaw = useGameStore.getState().playerYaw;
  const yaw = useRef(initYaw || Math.PI);
  const pitch = useRef(0.06);
  const vel = useRef(new THREE.Vector3());
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
  /** Rolling frame times, so QA can assert a framerate floor. */
  const frameTimes = useRef<number[]>([]);

  const character = useGameStore((s) => s.getCharacter());
  const speedMul = character?.speed ?? 1;
  const stamMul = character?.stamina ?? 1;
  const combatMul = character?.combatBonus ?? 1;
  const accent = character?.accent ?? "#3d9e8f";
  const cyberArm = character?.id === "theo";

  useEffect(() => {
    const el = gl.domElement;
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      if (e.code === "Space" || e.code === "Tab") e.preventDefault();
      if (e.code === "Escape") useGameStore.getState().togglePause();
      if (e.code === "KeyF") {
        const s = useGameStore.getState();
        if (s.phase === "playing" || s.phase === "ruins") {
          s.setCombat(!s.combatEnabled);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const clear = () => keys.current.clear();
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
      if (!locked.current) el.requestPointerLock?.();
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === el;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return;
      yaw.current -= e.movementX * 0.002;
      pitch.current -= e.movementY * 0.0017;
      pitch.current = THREE.MathUtils.clamp(pitch.current, -0.95, 0.55);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
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
      setKeys: (codes: string[]) => {
        keys.current.clear();
        for (const c of codes) keys.current.add(c);
      },
    };

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
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
    const phase = useGameStore.getState().phase;
    if (
      phase === "paused" ||
      phase === "dialogue" ||
      phase === "journal" ||
      phase === "settings"
    )
      return;

    const touch = getTouch();
    if (touch && (Math.abs(touch.lx) > 0.05 || Math.abs(touch.ly) > 0.05)) {
      yaw.current -= touch.lx * 1.9 * d;
      pitch.current -= touch.ly * 1.25 * d;
      pitch.current = THREE.MathUtils.clamp(pitch.current, -0.95, 0.55);
    }

    forward.current.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    right.current.set(Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    let mx = 0;
    let mz = 0;
    if (keys.current.has("KeyW") || keys.current.has("ArrowUp")) mz += 1;
    if (keys.current.has("KeyS") || keys.current.has("ArrowDown")) mz -= 1;
    if (keys.current.has("KeyD") || keys.current.has("ArrowRight")) mx += 1;
    if (keys.current.has("KeyA") || keys.current.has("ArrowLeft")) mx -= 1;
    if (touch) {
      mx += touch.mx;
      mz -= touch.my;
    }
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }

    const wantSprint =
      (keys.current.has("ShiftLeft") ||
        keys.current.has("ShiftRight") ||
        !!touch?.sprint) &&
      mz > 0 &&
      staminaLocal.current > 2;

    if (wantSprint) {
      staminaLocal.current = Math.max(0, staminaLocal.current - (18 * d) / stamMul);
    } else {
      staminaLocal.current = Math.min(100, staminaLocal.current + 12 * d * stamMul);
    }
    useGameStore.getState().setStamina(staminaLocal.current);

    const scanning =
      keys.current.has("KeyQ") || keys.current.has("KeyV") || !!touch?.scan;
    useGameStore.getState().setScanner(scanning);

    const weather = useGameStore.getState().weather;
    const weatherSlow =
      weather === "storm" ? 0.78 : weather === "rain" ? 0.9 : 1;
    const inside = useGameStore.getState().insideDome;

    const base =
      (wantSprint ? 11.5 : scanning ? 3.2 : 6.4) *
      speedMul *
      weatherSlow *
      (inside ? 0.85 : 1);
    targetVel.current.set(
      (forward.current.x * mz + right.current.x * mx) * base,
      0,
      (forward.current.z * mz + right.current.z * mx) * base,
    );
    vel.current.lerp(targetVel.current, 1 - Math.exp(-(wantSprint ? 14 : 11) * d));

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

    const groundY = sampleHeight(g.position.x, g.position.z);
    g.position.y = THREE.MathUtils.lerp(
      g.position.y,
      groundY,
      1 - Math.exp(-14 * d),
    );

    for (const [ox, oz, r] of [
      [0, 6, inside ? 0.5 : 4.5],
      [-14, 2, 4.5],
      [14, 4, 4.5],
      [-8, 18, 4.5],
      [10, 16, 4.5],
    ] as const) {
      if (inside && ox === 0) continue;
      const dx = g.position.x - ox;
      const dz = g.position.z - oz;
      const dist = Math.hypot(dx, dz);
      if (dist < r && dist > 0.001) {
        const push = (r - dist) / r;
        g.position.x += (dx / dist) * push * 0.6;
        g.position.z += (dz / dist) * push * 0.6;
      }
    }

    const spd = vel.current.length();
    if (spd > 0.8) {
      bob.current += d * spd * 1.4;
      stepAcc.current += d * spd;
      if (stepAcc.current > (wantSprint ? 1.8 : 2.6)) {
        stepAcc.current = 0;
        getAudio().footstep?.(wantSprint);
      }
    }
    const bobY = Math.sin(bob.current) * Math.min(spd / 10, 1) * 0.06;

    let anim: AnimState = "idle";
    if (scanning) anim = "scan";
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

    // expose combat mul for creatures via window
    (window as unknown as { __combatMul: number }).__combatMul = combatMul;

    pathTimer.current += d;
    if (pathTimer.current > 0.5 && spd > 0.5) {
      pathTimer.current = 0;
      store.samplePath(g.position.x, g.position.z);
    }

    let signal = 0.22;
    for (const [gx, gz] of [
      [-22, 12],
      [22, 10],
      [-12, -8],
      [16, -6],
    ] as const) {
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
