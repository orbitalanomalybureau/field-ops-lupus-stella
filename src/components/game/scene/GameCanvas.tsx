import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { AdaptiveDpr, AdaptiveEvents } from "@react-three/drei";
import * as THREE from "three";
import { GameScene } from "./GameScene";

export function GameCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
        stencil: false,
      }}
      camera={{ fov: 56, near: 0.12, far: 420, position: [0, 3.2, 34] }}
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
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <Suspense fallback={null}>
        <GameScene />
        <AdaptiveDpr pixelated />
        <AdaptiveEvents />
      </Suspense>
    </Canvas>
  );
}
