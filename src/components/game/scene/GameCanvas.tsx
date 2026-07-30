import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import { AdaptiveDpr, AdaptiveEvents } from "@react-three/drei";
import * as THREE from "three";
import { GameScene } from "./GameScene";
import { FRAME_BUDGET_MS, QUALITY } from "@/game/quality";
import { useGameStore } from "@/game/store";

/** Ignored after mount: shader compiles and texture uploads all land here. */
const WARMUP_MS = 4500;
/** The single measurement window — about 3 s at 60 fps, 6 s at 30. */
const WINDOW_FRAMES = 180;
/** A tab restore or a GC stall is not a rendering cost; don't sample it. */
const MAX_SAMPLE_MS = 200;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Shadow map size lives on the light rather than the renderer, and the lights
 * are declared in another module's JSX, so the tier is applied by walking the
 * graph. Returns whether anything actually had to be resized.
 */
function applyShadowMapSize(scene: THREE.Scene, size: number): boolean {
  let changed = false;
  scene.traverse((obj) => {
    if (
      !(obj instanceof THREE.DirectionalLight) &&
      !(obj instanceof THREE.SpotLight) &&
      !(obj instanceof THREE.PointLight)
    ) {
      return;
    }
    const shadow = obj.shadow;
    if (shadow.mapSize.width === size && shadow.mapSize.height === size) return;
    shadow.mapSize.set(size, size);
    // The allocated target is still the old size; freeing it is what makes
    // three build a new one at the next shadow pass.
    shadow.map?.dispose();
    shadow.map = null;
    changed = true;
  });
  return changed;
}

/**
 * Toggling `gl.shadowMap.enabled` changes the shader defines every material
 * was compiled with, and three will not notice on its own. Costs a full
 * program rebuild, so it is only ever run on an actual shadow flip.
 */
function invalidateMaterials(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const material = obj.material;
    if (Array.isArray(material)) {
      for (const m of material) m.needsUpdate = true;
    } else {
      material.needsUpdate = true;
    }
  });
}

/**
 * The half of the tier the Canvas props cannot reach reactively: R3F reads the
 * `camera` prop only when it first builds the camera, and shadow map size is a
 * light property. `dpr` and `shadows` are re-applied by R3F on every render, so
 * they stay on the Canvas itself.
 */
function QualityRig() {
  const quality = useGameStore((s) => s.quality);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const lastShadows = useRef<string | null>(null);

  useEffect(() => {
    const settings = QUALITY[quality];

    if (camera instanceof THREE.PerspectiveCamera && camera.far !== settings.farPlane) {
      camera.far = settings.farPlane;
      camera.updateProjectionMatrix();
    }

    // R3F's own configure() has already applied the `shadows` prop by now, so
    // the flip has to be tracked here rather than read off the renderer. The
    // map *type* is part of the same key: SHADOWMAP_TYPE is a shader define in
    // every lit program, so a pcf<->vsm change needs the same full rebuild an
    // enabled flip does — R3F sets shadowMap.needsUpdate but not the materials.
    const shadowKey = `${settings.shadowsEnabled}:${settings.shadowType}`;
    const flipped = lastShadows.current !== null && lastShadows.current !== shadowKey;
    lastShadows.current = shadowKey;
    if (flipped) invalidateMaterials(scene);

    const resized = applyShadowMapSize(scene, settings.shadowMapSize);
    if (flipped || resized) gl.shadowMap.needsUpdate = true;
  }, [quality, camera, scene, gl]);

  return null;
}

/**
 * Paired with overlays/PhotoMode.tsx, which dispatches this event. The name is
 * duplicated there as a string literal rather than imported from here so the
 * overlay bundle never pulls in this module's three.js graph.
 */
const PHOTO_FOV_EVENT = "fieldops:photo-fov";

/**
 * Photo mode's FOV control. A window event rather than store state keeps the
 * camera write out of React entirely: the slider fires at input rate and
 * nothing else needs to observe it. `fov: null` restores the gameplay FOV,
 * which is captured from the camera on first use rather than hardcoded.
 */
function PhotoFovRig() {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    let baseFov: number | null = null;
    const onFov = (e: Event) => {
      if (!(camera instanceof THREE.PerspectiveCamera)) return;
      const detail = (e as CustomEvent<{ fov: number | null }>).detail;
      if (baseFov === null) baseFov = camera.fov;
      const next = Math.min(120, Math.max(20, detail?.fov ?? baseFov));
      if (camera.fov === next) return;
      camera.fov = next;
      camera.updateProjectionMatrix();
    };
    window.addEventListener(PHOTO_FOV_EVENT, onFov);
    return () => window.removeEventListener(PHOTO_FOV_EVENT, onFov);
  }, [camera]);

  return null;
}

/**
 * AdaptiveDpr trades resolution for frames during motion, but nothing was
 * measuring whether the result actually lands inside a frame budget. This
 * samples one window of real play and, if the median frametime is badly over,
 * drops the tier a single step. It never raises and never fires twice: a
 * quality level that oscillates reads worse than one that is merely low.
 */
function FrameBudgetGovernor() {
  const samples = useRef<number[]>([]);
  const played = useRef(0);
  const settled = useRef(false);

  useFrame((_, delta) => {
    if (settled.current) return;
    const store = useGameStore.getState();
    // A paused or menued frame has a still camera and a halted world clock, so
    // it measures nothing the player will actually feel while walking.
    if (store.phase !== "playing") return;

    const ms = delta * 1000;
    if (ms > MAX_SAMPLE_MS) return;
    played.current += ms;
    if (played.current < WARMUP_MS) return;

    samples.current.push(ms);
    if (samples.current.length < WINDOW_FRAMES) return;

    settled.current = true;
    const over = median(samples.current) > FRAME_BUDGET_MS;
    samples.current = [];
    if (over) store.autoTuneQuality();
  });

  return null;
}

export function GameCanvas() {
  const quality = useGameStore((s) => s.quality);
  const settings = QUALITY[quality];

  return (
    <Canvas
      // Explicit strings, never `true`: R3F maps `true` to PCFSoftShadowMap,
      // which three r185 deprecated — it warns on every boot and falls back to
      // plain PCF anyway. "variance" is the soft-penumbra tier (blur configured
      // on the light in DayNight); "percentage" is the honest name for the PCF
      // fallback a tier gets if it ever ships shadowType "pcf".
      shadows={
        settings.shadowsEnabled
          ? settings.shadowType === "vsm"
            ? "variance"
            : "percentage"
          : false
      }
      dpr={[1, settings.dprCap]}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
        stencil: false,
        // Photo mode reads the canvas back with toBlob on demand. Keeping the
        // buffer costs a copy some drivers would otherwise elide (~0–1 ms a
        // frame) — accepted so capture needs no render-loop hook.
        preserveDrawingBuffer: true,
      }}
      camera={{
        fov: 56,
        near: 0.12,
        far: settings.farPlane,
        position: [0, 3.2, 34],
      }}
      style={{
        width: "100%",
        height: "100%",
        touchAction: "none",
        background: "#2a1812",
      }}
      onCreated={({ gl }) => {
        gl.setClearColor("#2a1812", 1);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
        // shadowMap.enabled/type belong to the `shadows` prop now. Setting them
        // here would silently undo the low tier, because onCreated runs after
        // R3F has already applied that prop.
      }}
    >
      <Suspense fallback={null}>
        <GameScene />
        <QualityRig />
        <PhotoFovRig />
        <FrameBudgetGovernor />
        <AdaptiveDpr pixelated />
        <AdaptiveEvents />
      </Suspense>
    </Canvas>
  );
}
