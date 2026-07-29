import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { CHARACTERS } from "@/game/data";
import { useGameStore } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";
import {
  getGhost,
  getGhosts,
  presenceRoom,
  startPresence,
  stopPresence,
} from "@/lib/multiplayer";
import { AnimatedCharacter } from "./AnimatedCharacter";

/**
 * Silent holographic survey ghosts — other current readers, rendered from the
 * presence layer (src/lib/multiplayer). No chat, callsigns only; every value
 * they are drawn from was validated and clamped before it got here.
 */

/** Render budget: the rig is ~28 primitives, so eight ghosts ≈ one colony crowd. */
const MAX_GHOSTS = 8;
/** Same nameplate hysteresis as NPCs.tsx, so the two plate systems feel alike. */
const PLATE_SHOW = 13.5;
const PLATE_HIDE = 15;
const UI_PERIOD = 0.25;
/** How often the nearest-8 roster is re-picked from the live peers map. */
const ROSTER_PERIOD = 0.5;
/** Approach rates tuned against the ~8.7 Hz packet cadence: walking, not teleporting. */
const POS_RATE = 8;
const YAW_RATE = 10;
const SPEED_RATE = 6;

const FALLBACK_ACCENT = "#3d9e8f";

function GhostFigure({ id, callsign }: { id: string; callsign: string }) {
  const group = useRef<THREE.Group>(null);
  const [spawn] = useState(() => {
    const t = getGhost(id);
    return t ? { x: t.x, z: t.z, yaw: t.yaw } : { x: 0, z: 40, yaw: 0 };
  });
  const yaw = useRef(spawn.yaw);
  const speed = useRef(0);
  const uiAcc = useRef(UI_PERIOD);
  const plateShown = useRef(false);
  const [plate, setPlate] = useState(false);

  // The callsign is one of the three fixed operative callsigns (enforced on
  // receive), so it keys straight into the roster for the accent tint.
  const accent = CHARACTERS.find((c) => c.callsign === callsign)?.accent ?? FALLBACK_ACCENT;

  /** One shared hologram surface for the whole rig: accent-tinted, semi-transparent,
   * emissive — unmistakably a projection, not a local actor. No lights. */
  const holoMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        metalness: 0.1,
        roughness: 0.4,
      }),
    [accent],
  );
  useEffect(() => () => holoMaterial.dispose(), [holoMaterial]);

  // The rig owns its own materials and shadow flags; a ghost overrides both
  // after mount. The mesh set is static (combat off, fixed variant), and the
  // rig's material props never change, so one traversal holds. castShadow OFF
  // for ghosts is a hard constraint.
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    g.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        obj.material = holoMaterial;
      }
    });
  }, [holoMaterial]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const t = getGhost(id);
    // Between expiry and the next roster sweep a ghost hides rather than
    // standing frozen at a stale position.
    g.visible = Boolean(t);
    if (!t) return;
    const d = Math.min(delta, 0.05);

    // Exponential approach so 8 Hz updates read as walking, not teleporting.
    const kPos = 1 - Math.exp(-POS_RATE * d);
    const prevX = g.position.x;
    const prevZ = g.position.z;
    g.position.x += (t.x - prevX) * kPos;
    g.position.z += (t.z - prevZ) * kPos;
    // Remote y is never trusted: the ground under the ghost is the ground.
    g.position.y = sampleHeight(g.position.x, g.position.z);

    const diff = Math.atan2(Math.sin(t.yaw - yaw.current), Math.cos(t.yaw - yaw.current));
    yaw.current += diff * Math.min(1, YAW_RATE * d);
    g.rotation.y = yaw.current;

    // The rig reads { speed, anim } from its parent's userData, exactly like
    // the player and NPC drivers; speed derives from the interpolated motion.
    const inst = d > 0 ? Math.hypot(g.position.x - prevX, g.position.z - prevZ) / d : 0;
    speed.current += (inst - speed.current) * Math.min(1, SPEED_RATE * d);
    g.userData.speed = speed.current;
    g.userData.anim = t.anim;

    uiAcc.current += d;
    if (uiAcc.current >= UI_PERIOD) {
      uiAcc.current = 0;
      const s = useGameStore.getState();
      // Callsign tags are HUD, not world: distance-gated like NPC plates and
      // absent from photo mode so photographs stay clean.
      const dist = Math.hypot(s.playerPos.x - g.position.x, s.playerPos.z - g.position.z);
      const next = !s.photoMode && (plateShown.current ? dist < PLATE_HIDE : dist < PLATE_SHOW);
      if (next !== plateShown.current) {
        plateShown.current = next;
        setPlate(next);
      }
    }
  });

  return (
    <group
      ref={group}
      visible={false}
      position={[spawn.x, sampleHeight(spawn.x, spawn.z), spawn.z]}
      rotation={[0, spawn.yaw, 0]}
    >
      <AnimatedCharacter accent={accent} combat={false} cyberArm={false} />
      {plate && (
        <Html distanceFactor={22} position={[0, 2.35, 0]} center style={{ pointerEvents: "none" }}>
          <div
            className="whitespace-nowrap rounded-sm border border-border bg-void/60 px-2 py-0.5 font-mono text-[10px] text-dim"
          >
            {callsign}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Mounts inside GameScene, so it exists exactly while a world phase does:
 * mount joins the presence room, unmount leaves it. Renders nothing — and the
 * presence layer does nothing — when the toggle is off, WebRTC is blocked,
 * signaling is absent, or nobody else is reading right now.
 */
export function GhostOperatives() {
  const presenceEnabled = useGameStore((s) => s.presenceEnabled);
  const spoilerCeiling = useGameStore((s) => s.spoilerCeiling);
  const [roster, setRoster] = useState<{ id: string; callsign: string }[]>([]);
  const rosterKey = useRef("");
  const rosterAcc = useRef(0);

  useEffect(() => {
    if (!presenceEnabled) return;
    const callsign = useGameStore.getState().getCharacter()?.callsign ?? "SURVEY-3";
    startPresence({
      room: presenceRoom(spoilerCeiling),
      callsign,
      sample: () => {
        const s = useGameStore.getState();
        return { x: s.playerPos.x, z: s.playerPos.z, yaw: s.playerYaw, anim: s.animState };
      },
    });
    return () => stopPresence();
  }, [presenceEnabled, spoilerCeiling]);

  useFrame((_, delta) => {
    rosterAcc.current += Math.min(delta, 0.05);
    if (rosterAcc.current < ROSTER_PERIOD) return;
    rosterAcc.current = 0;
    const s = useGameStore.getState();
    const nearest = getGhosts()
      .map((gh) => ({
        gh,
        d2: (gh.x - s.playerPos.x) ** 2 + (gh.z - s.playerPos.z) ** 2,
      }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, MAX_GHOSTS)
      .map(({ gh }) => ({ id: gh.id, callsign: gh.callsign }));
    // Keyed on membership, not order, so walking past a ghost does not churn
    // React state while the same eight stay on stage.
    const key = nearest
      .map((n) => `${n.id}:${n.callsign}`)
      .sort()
      .join("|");
    if (key !== rosterKey.current) {
      rosterKey.current = key;
      setRoster(nearest);
    }
  });

  if (roster.length === 0) return null;
  return (
    <group>
      {roster.map((g) => (
        <GhostFigure key={g.id} id={g.id} callsign={g.callsign} />
      ))}
    </group>
  );
}
