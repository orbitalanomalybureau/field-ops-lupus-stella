import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { AnimState } from "@/game/types";

type Props = {
  accent?: string;
  combat?: boolean;
  cyberArm?: boolean;
};

/**
 * Procedural "rigged" character — limb swing driven by store motion.
 * Stands in for glTF skeletal animation until art packs ship.
 */
export function AnimatedCharacter({
  accent = "#3d9e8f",
  combat = false,
  cyberArm = true,
}: Props) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const phase = useRef(0);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    // Read motion from parent userData (set by PlayerController)
    const ud = root.current?.parent?.userData as
      | { speed?: number; anim?: AnimState }
      | undefined;
    const speed = ud?.speed ?? 0;
    const anim = ud?.anim ?? "idle";

    const stride =
      anim === "run" ? 14 : anim === "walk" ? 9 : anim === "scan" ? 4 : 2.2;
    phase.current += d * stride * (0.35 + Math.min(speed / 8, 1));

    const swing =
      anim === "idle"
        ? Math.sin(phase.current) * 0.04
        : Math.sin(phase.current) * (anim === "run" ? 0.75 : 0.5);
    const bob =
      anim === "idle"
        ? Math.sin(phase.current * 0.5) * 0.015
        : Math.abs(Math.sin(phase.current)) * (anim === "run" ? 0.08 : 0.04);

    if (torso.current) {
      torso.current.position.y = bob;
      torso.current.rotation.x =
        anim === "scan" ? 0.18 : anim === "run" ? 0.12 : 0.04;
      torso.current.rotation.z = swing * 0.08;
    }
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) {
      armL.current.rotation.x =
        anim === "scan" ? -0.9 : combat ? -0.35 : -swing * 0.85;
      armL.current.rotation.z = cyberArm ? 0.2 : 0.08;
    }
    if (armR.current) {
      armR.current.rotation.x = combat ? -0.55 : swing * 0.85;
      armR.current.rotation.z = combat ? -0.25 : -0.08;
    }
  });

  const suit = "#3a4550";
  const dark = "#1e242c";

  return (
    <group ref={root}>
      {/* Legs */}
      <group ref={legL} position={[-0.14, 0.85, 0]}>
        <mesh castShadow position={[0, -0.35, 0]}>
          <capsuleGeometry args={[0.1, 0.55, 4, 8]} />
          <meshStandardMaterial color={suit} roughness={0.6} />
        </mesh>
        <mesh castShadow position={[0, -0.72, 0.04]}>
          <boxGeometry args={[0.16, 0.12, 0.28]} />
          <meshStandardMaterial color={dark} />
        </mesh>
      </group>
      <group ref={legR} position={[0.14, 0.85, 0]}>
        <mesh castShadow position={[0, -0.35, 0]}>
          <capsuleGeometry args={[0.1, 0.55, 4, 8]} />
          <meshStandardMaterial color={suit} roughness={0.6} />
        </mesh>
        <mesh castShadow position={[0, -0.72, 0.04]}>
          <boxGeometry args={[0.16, 0.12, 0.28]} />
          <meshStandardMaterial color={dark} />
        </mesh>
      </group>

      <group ref={torso}>
        {/* Hip / torso */}
        <mesh castShadow position={[0, 1.15, 0]}>
          <capsuleGeometry args={[0.28, 0.5, 6, 10]} />
          <meshStandardMaterial color={suit} metalness={0.35} roughness={0.5} />
        </mesh>
        {/* Chest plate */}
        <mesh castShadow position={[0, 1.25, 0.16]}>
          <boxGeometry args={[0.42, 0.38, 0.12]} />
          <meshStandardMaterial color={dark} metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Pack */}
        <mesh castShadow position={[0, 1.2, -0.28]}>
          <boxGeometry args={[0.4, 0.45, 0.18]} />
          <meshStandardMaterial color="#2c353f" metalness={0.4} />
        </mesh>
        {/* Head / helmet */}
        <mesh castShadow position={[0, 1.78, 0]}>
          <sphereGeometry args={[0.22, 14, 14]} />
          <meshStandardMaterial color={dark} metalness={0.45} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.78, 0.16]}>
          <boxGeometry args={[0.26, 0.1, 0.06]} />
          <meshStandardMaterial
            color="#0a2020"
            emissive={accent}
            emissiveIntensity={0.55}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>

        {/* Arms */}
        <group ref={armL} position={[-0.36, 1.4, 0]}>
          <mesh castShadow position={[0, -0.28, 0]}>
            <capsuleGeometry args={[0.075, 0.42, 4, 8]} />
            <meshStandardMaterial
              color={cyberArm ? accent : suit}
              emissive={cyberArm ? accent : "#000"}
              emissiveIntensity={cyberArm ? 0.45 : 0}
              metalness={cyberArm ? 0.75 : 0.3}
              roughness={cyberArm ? 0.25 : 0.55}
            />
          </mesh>
        </group>
        <group ref={armR} position={[0.36, 1.4, 0]}>
          <mesh castShadow position={[0, -0.28, 0]}>
            <capsuleGeometry args={[0.075, 0.42, 4, 8]} />
            <meshStandardMaterial color={suit} roughness={0.55} />
          </mesh>
          {combat && (
            <mesh castShadow position={[0.05, -0.55, 0.28]} rotation={[0.4, 0, 0]}>
              <boxGeometry args={[0.07, 0.07, 0.55]} />
              <meshStandardMaterial color="#12161c" metalness={0.75} roughness={0.3} />
            </mesh>
          )}
        </group>
      </group>

      <pointLight position={[0, 1.4, 0.4]} intensity={0.9} distance={8} color="#d8e0e8" />
    </group>
  );
}
