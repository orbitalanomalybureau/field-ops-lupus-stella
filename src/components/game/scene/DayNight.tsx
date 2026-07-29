import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { WORLD } from "@/game/data";
import { useGameStore } from "@/game/store";

/** Full day cycle driving lights, fog, sky (28h-feel). */
export function DayNight() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const sky = useRef<THREE.Mesh>(null);
  const haze = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.Points>(null);
  const moon = useRef<THREE.Mesh>(null);
  const sunMesh = useRef<THREE.Mesh>(null);
  const clockAcc = useRef(0);
  const bgColor = useMemo(() => new THREE.Color("#2a1812"), []);
  const tmpA = useMemo(() => new THREE.Color(), []);
  const tmpB = useMemo(() => new THREE.Color(), []);
  const sunDir = useMemo(() => new THREE.Vector3(), []);
  const todPublish = useRef(0);

  const starPos = useMemo(() => {
    const n = 1000;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.48;
      const r = 240;
      a[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      a[i * 3 + 1] = Math.cos(ph) * r * 0.55 + 30;
      a[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    }
    return a;
  }, []);

  useFrame((state, delta) => {
    if (useGameStore.getState().phase === "paused") return;
    const d = Math.min(delta, 0.05);
    clockAcc.current += d;
    const tod = (0.28 + clockAcc.current / WORLD.dayLengthSec) % 1;
    todPublish.current += d;
    if (todPublish.current > 0.5) {
      todPublish.current = 0;
      useGameStore.getState().setTimeOfDay(tod);
    }

    const scanner = useGameStore.getState().scannerActive;
    const weather = useGameStore.getState().weather;
    const wi = useGameStore.getState().weatherIntensity;

    const elev = Math.sin(tod * Math.PI * 2 - Math.PI * 0.5);
    const dayFactor = THREE.MathUtils.clamp(elev * 0.5 + 0.5, 0, 1);
    const nightFactor = 1 - dayFactor;
    const isDawn = tod > 0.2 && tod < 0.35;
    const isDusk = tod > 0.65 && tod < 0.8;

    const sunX = Math.cos(tod * Math.PI * 2) * 90;
    const sunY = 8 + dayFactor * 70;
    const sunZ = Math.sin(tod * Math.PI * 2) * 40 - 20;

    if (sun.current) {
      // The shadow box is only ±60, so it rides the player instead of the
      // origin; the default light target is outside the scene graph, hence
      // the manual matrix update.
      const p = useGameStore.getState().playerPos;
      sunDir.set(sunX, sunY, sunZ).normalize();
      sun.current.position.set(
        p.x + sunDir.x * 90,
        p.y + sunDir.y * 90,
        p.z + sunDir.z * 90,
      );
      sun.current.target.position.set(p.x, p.y, p.z);
      sun.current.target.updateMatrixWorld();
      let intensity = 0.15 + dayFactor * 1.75;
      if (weather === "storm") intensity *= 0.35;
      else if (weather === "rain") intensity *= 0.55;
      else if (weather === "haze") intensity *= 0.85;
      if (scanner) intensity *= 0.7;
      sun.current.intensity = intensity;
      sun.current.color.set(
        isDawn || isDusk ? "#ff8a50" : dayFactor > 0.5 ? "#ffc090" : "#6a80b0",
      );
    }

    if (amb.current) {
      amb.current.intensity =
        (scanner ? 0.3 : 0.2 + dayFactor * 0.35) *
        (weather === "storm" ? 0.6 : 1);
      amb.current.color.set(
        scanner ? "#60a090" : dayFactor > 0.4 ? "#d09060" : "#304060",
      );
    }
    if (hemi.current) {
      hemi.current.intensity = 0.35 + dayFactor * 0.4;
      hemi.current.color.set(dayFactor > 0.5 ? "#c87840" : "#203050");
      hemi.current.groundColor.set("#1a2a22");
    }
    if (fill.current) {
      fill.current.intensity = 0.15 + nightFactor * 0.25;
    }

    let midHex = "#3a2014";
    if (dayFactor > 0.55) midHex = "#8a4020";
    else if (isDawn || isDusk) midHex = "#c05028";
    else midHex = "#101828";
    if (weather === "storm") {
      tmpA.set(midHex);
      tmpB.set("#1a1e28");
      midHex = `#${tmpA.lerp(tmpB, 0.65).getHexString()}`;
    }

    if (sky.current) {
      (sky.current.material as THREE.MeshBasicMaterial).color.set(midHex);
    }
    if (haze.current) {
      const mat = haze.current.material as THREE.MeshBasicMaterial;
      mat.color.set(isDawn || isDusk ? "#ff6020" : midHex);
      mat.opacity = (0.15 + dayFactor * 0.12) * (weather === "clear" ? 0.8 : 1.1);
    }
    if (sunMesh.current) {
      sunMesh.current.position.set(sunX * 0.9, sunY * 0.85, sunZ * 0.9);
      sunMesh.current.visible = dayFactor > 0.12;
      (sunMesh.current.material as THREE.MeshBasicMaterial).color.set(
        isDawn || isDusk ? "#ff8040" : "#ffb070",
      );
    }
    if (moon.current) {
      moon.current.position.set(-sunX * 0.7, 25 + nightFactor * 30, -sunZ * 0.5);
      moon.current.visible = nightFactor > 0.35;
    }
    if (stars.current) {
      const mat = stars.current.material as THREE.PointsMaterial;
      mat.opacity = nightFactor * 0.75 * (weather === "storm" ? 0.2 : 1);
    }

    const fog = state.scene.fog as THREE.Fog | null;
    if (fog) {
      let near = scanner ? 14 : 20 + dayFactor * 8;
      let far = scanner ? 85 : 120 + dayFactor * 50;
      if (weather === "storm") {
        near = 8;
        far = 55 + (1 - wi) * 30;
      } else if (weather === "rain") {
        near = 14;
        far = 90;
      }
      fog.near = near;
      fog.far = far;
      fog.color.set(
        scanner
          ? "#1a2a28"
          : weather === "storm"
            ? "#12161c"
            : dayFactor > 0.5
              ? "#3a2218"
              : "#101420",
      );
    }

    bgColor.set(weather === "storm" ? "#0e1014" : midHex);
    state.scene.background = bgColor;
  });

  return (
    <group>
      <ambientLight ref={amb} intensity={0.45} color="#d09060" />
      <directionalLight
        ref={sun}
        castShadow
        intensity={1.6}
        color="#ffb070"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={5}
        shadow-camera-far={220}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-bias={-0.00025}
        position={[55, 72, -25]}
      />
      <hemisphereLight ref={hemi} args={["#c87840", "#1a2a22", 0.7]} />
      <directionalLight
        ref={fill}
        position={[-40, 20, 60]}
        intensity={0.25}
        color="#4060a0"
      />

      <mesh ref={sky}>
        <sphereGeometry args={[300, 40, 28]} />
        <meshBasicMaterial side={THREE.BackSide} color="#3a2014" />
      </mesh>
      <mesh ref={haze} position={[0, 35, -70]}>
        <sphereGeometry args={[100, 20, 14]} />
        <meshBasicMaterial
          color="#8a4020"
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={sunMesh} position={[40, 35, -50]}>
        <sphereGeometry args={[7, 16, 16]} />
        <meshBasicMaterial color="#ffb070" />
      </mesh>
      <mesh ref={moon} position={[-50, 40, 30]}>
        <sphereGeometry args={[3.5, 12, 12]} />
        <meshBasicMaterial color="#c8d0e0" />
      </mesh>
      <points ref={stars}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffe8d0"
          size={0.5}
          sizeAttenuation
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
