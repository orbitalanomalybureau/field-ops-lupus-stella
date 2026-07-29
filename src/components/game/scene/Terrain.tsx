import { useMemo } from "react";
import * as THREE from "three";
import { sampleHeight } from "@/game/worldHeight";

function makeHeightGeometry(size: number, segments: number, offsetZ: number) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + offsetZ;
    pos.setY(i, sampleHeight(x, z));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function groundTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, "#4a3a2a");
  g.addColorStop(0.5, "#3a3228");
  g.addColorStop(1, "#2a2820");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 12000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const s = Math.random() * 3;
    const v = 30 + Math.random() * 50;
    ctx.fillStyle = `rgba(${v * 1.1},${v * 0.9},${v * 0.55},${0.15 + Math.random() * 0.5})`;
    ctx.fillRect(x, y, s, s);
  }
  // moss flecks
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = `rgba(30,${80 + Math.random() * 40},50,${0.1 + Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 28);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function Terrain() {
  const geo = useMemo(() => makeHeightGeometry(480, 100, 90), []);
  const tex = useMemo(() => groundTexture(), []);
  const padGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(52, 64);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  return (
    <group>
      <mesh geometry={geo} receiveShadow castShadow position={[0, 0, 90]}>
        <meshStandardMaterial
          map={tex}
          roughness={0.94}
          metalness={0.04}
          color="#9a8068"
          flatShading={false}
        />
      </mesh>

      <mesh geometry={padGeo} receiveShadow position={[0, 0.06, 12]}>
        <meshStandardMaterial
          color="#2c343c"
          roughness={0.78}
          metalness={0.22}
        />
      </mesh>

      {/* South approach road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 55]} receiveShadow>
        <planeGeometry args={[7, 90]} />
        <meshStandardMaterial color="#3a4048" roughness={0.9} metalness={0.1} />
      </mesh>
    </group>
  );
}
