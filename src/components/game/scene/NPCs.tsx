import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { NPCS } from "@/game/data";
import { npcPositions } from "@/game/npcState";
import { useGameStore } from "@/game/store";
import { sampleHeight } from "@/game/worldHeight";
import { AnimatedCharacter } from "./AnimatedCharacter";
import type { AnimState, NpcDef, WeatherKind } from "@/game/types";

// Station design constraint: InteractionSystem picks the talk prompt from the
// registry anchor with a 7 m radius, so stations stay within ~6 m of each
// NPC's anchor. See src/game/npcState.ts for the live-position contract.

const WALK_SPEED = 1.4;
const ARRIVE_EPS = 0.2;
const FACE_RADIUS = 12;
/** Nameplate visibility hysteresis so the Html node doesn't flicker-mount. */
const PLATE_SHOW = 13.5;
const PLATE_HIDE = 15;
const BARK_RADIUS = 10;
const UI_PERIOD = 0.25;
/** 48 slots over the 480 s day: a standing bark rotates every ~10 s. */
const BARK_SLOTS = 48;

/** Command-dome hatch, faced by sheltering NPCs while they wait out a cell. */
const HATCH = { x: 0, z: 8 };

type Vec2 = { x: number; z: number };
type Station = Vec2 & { t: number };

type BarkSet = {
  fresh: string[];
  talked: string[];
  night: string;
  rain: string;
  storm: string;
};

type NpcSim = {
  /** Sorted by t, first entry at t 0 so the wrap lookup is trivial. */
  schedule: Station[];
  /** Per-NPC muster point on the dome apron, outside the 4.5 m shell. */
  shelter: Vec2;
  /** Optional detour so the storm leg doesn't clip the command-block prop. */
  stormVia?: Vec2;
  barks: BarkSet | null;
};

/**
 * timeOfDay mapping (DayNight): 0.25 sunrise, 0.5 noon, 0.75 dusk, 0/1 deep
 * night. Stations are chosen against that clock, and — hard constraint — sit
 * within ~6 m of the NPC's registry anchor; see npcPositions above.
 */
const SIM: Record<string, NpcSim | undefined> = {
  // Anchor (-18, 14). Collar station reads as gen-west (-22, 12) duty; the
  // night post reads as walking the west-dome approach.
  thornhill: {
    schedule: [
      { t: 0, x: -15.9, z: 10.2 },
      { t: 0.27, x: -20.2, z: 13.2 },
      { t: 0.52, x: -18, z: 14 },
      { t: 0.6, x: -20.2, z: 13.2 },
      { t: 0.78, x: -15.9, z: 10.2 },
    ],
    shelter: { x: -3.6, z: 10.4 },
    barks: {
      fresh: [
        "Collar four drifted two millihertz overnight. Again.",
        "Don't lean on the housing. It's load-bearing and fussy.",
      ],
      talked: [
        "Drift's holding under three. Small mercies.",
        "If the readout flickers, that's the lattice, not me.",
      ],
      night: "Lattice is loud tonight. The cores can hear it.",
      rain: "Humidity puts noise on every trace. Wonderful.",
      storm: "Cell's sitting on the collars. I'm for the dome.",
    },
  },
  // Anchor (8, 24) sits on the command-block corner, so her idle med post is
  // nudged just outside its footprint; the day round circles it to the north.
  castillo: {
    schedule: [
      { t: 0, x: 9.5, z: 26 },
      { t: 0.28, x: 12.5, z: 26.5 },
      { t: 0.42, x: 9, z: 29 },
      { t: 0.56, x: 3.5, z: 26.5 },
      { t: 0.7, x: 9.5, z: 26 },
    ],
    shelter: { x: 3.6, z: 10.2 },
    stormVia: { x: 10, z: 17 },
    barks: {
      fresh: [
        "Hydrate. Not a suggestion.",
        "Walk-ins before dusk. After that, emergencies only.",
      ],
      talked: [
        "Vitals held. Keep them that way.",
        "Dust-burn line forms on the left.",
      ],
      night: "Night detail chews people up. Pace yourself.",
      rain: "Wet dust cuts worse. Seal your cuffs.",
      storm: "Shelter first, argue later. Dome.",
    },
  },
  // Anchor (16, 10) — the gate desk. Midday stretch to the east-dome apron,
  // dusk pass along the east fence line, back to the desk by night.
  voss: {
    schedule: [
      { t: 0, x: 16, z: 10 },
      { t: 0.3, x: 13, z: 9 },
      { t: 0.5, x: 16, z: 10 },
      { t: 0.66, x: 18.5, z: 13.5 },
      { t: 0.8, x: 16, z: 10 },
    ],
    shelter: { x: 1.5, z: 11.6 },
    barks: {
      fresh: [
        "Unlogged movement is how files end.",
        "The gate ledger has a line with your name. Blank.",
      ],
      talked: ["Your file is open. Keep it boring.", "Exit logged. Return pending."],
      night: "Night exits need a waiver. Nobody has one.",
      rain: "Rain is not a filing exemption.",
      storm: "Gate's sealed. Storm traffic is dome traffic.",
    },
  },
  // Anchor (-6, 32) — the ark stores. The modeled crate props sit ~20 m away,
  // outside his prompt radius, so his round works the stores abstractly.
  berger: {
    schedule: [
      { t: 0, x: -6, z: 32 },
      { t: 0.26, x: -2.5, z: 34.5 },
      { t: 0.5, x: -6, z: 32 },
      { t: 0.64, x: -9.5, z: 29.5 },
      { t: 0.82, x: -6, z: 32 },
    ],
    shelter: { x: -1.4, z: 11.8 },
    barks: {
      fresh: [
        "Hear that? Ark metal's quiet. Good sign.",
        "Ozone's flat today. Breathe while it's cheap.",
      ],
      talked: [
        "Hull hums a half-tone low. She's fine.",
        "Stores smell of cold iron. As they should.",
      ],
      night: "Cold metal talks in its sleep. Listen.",
      rain: "Rain on ark plate. Almost sounds like home.",
      storm: "Burnt citrus on the wind. Dome. Now.",
    },
  },
  // Anchor (4, 18). Out at the cherry-start plot for dawn and dusk offices;
  // the plot sits south of the command block so the walk never clips it.
  tomas: {
    schedule: [
      { t: 0, x: 4, z: 18 },
      { t: 0.2, x: 7.8, z: 17.5 },
      { t: 0.32, x: 4, z: 18 },
      { t: 0.68, x: 7.8, z: 17.5 },
      { t: 0.8, x: 4, z: 18 },
    ],
    shelter: { x: 0.2, z: 12.6 },
    barks: {
      fresh: [
        "The Voice keeps hours. Keep yours.",
        "Silence is a discipline, not an absence.",
      ],
      talked: [
        "You listened. Rarer than speech.",
        "The cherry starts hold. Small covenants matter.",
      ],
      night: "The lattice sings at night. We do not answer.",
      rain: "The sky speaks softly. Let it finish.",
      storm: "The sky raises its voice. We lower ours.",
    },
  },
};

function fallbackSim(n: NpcDef): NpcSim {
  return {
    schedule: [{ t: 0, x: n.x, z: n.z }],
    shelter: { x: 0.2, z: 12.6 },
    barks: null,
  };
}

function stationAt(schedule: Station[], tod: number): Vec2 {
  let cur = schedule[0];
  for (const s of schedule) if (s.t <= tod) cur = s;
  return cur;
}

/** Two Park-Miller steps: enough mixing that adjacent slots don't correlate. */
function seededIndex(seed: number, len: number): number {
  let s = (Math.abs(Math.trunc(seed)) % 2147483646) + 1;
  s = (s * 16807) % 2147483647;
  s = (s * 16807) % 2147483647;
  return s % len;
}

/** Deterministic: keyed to the game clock, never to wall time or Math.random. */
function pickBark(
  barks: BarkSet,
  talked: boolean,
  weather: WeatherKind,
  tod: number,
  npcIndex: number,
): string {
  if (weather === "storm") return barks.storm;
  const pool = [...(talked ? barks.talked : barks.fresh)];
  if (tod < 0.23 || tod > 0.77) pool.push(barks.night);
  if (weather === "rain") pool.push(barks.rain);
  const slot = Math.floor(tod * BARK_SLOTS);
  return pool[seededIndex(slot * 101 + npcIndex * 7919, pool.length)];
}

function spawnPos(sim: NpcSim): Vec2 {
  const s = useGameStore.getState();
  return {
    ...(s.weather === "storm" ? sim.shelter : stationAt(sim.schedule, s.timeOfDay)),
  };
}

function NpcFigure({
  npc,
  index,
  talked,
}: {
  npc: NpcDef;
  index: number;
  talked: boolean;
}) {
  const sim = SIM[npc.id] ?? fallbackSim(npc);
  const [spawn] = useState(() => spawnPos(sim));
  const pos = useRef<Vec2>({ ...spawn });
  const group = useRef<THREE.Group>(null);
  const heading = useRef(Math.PI);
  const viaDone = useRef(false);
  const uiAcc = useRef(UI_PERIOD);
  const shown = useRef<{ plate: boolean; bark: string | null }>({
    plate: false,
    bark: null,
  });
  const [ui, setUi] = useState<{ plate: boolean; bark: string | null }>({
    plate: false,
    bark: null,
  });

  useEffect(() => {
    return () => {
      npcPositions.delete(npc.id);
    };
  }, [npc.id]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const d = Math.min(delta, 0.05);
    const p = pos.current;
    const s = useGameStore.getState();
    // Movement freezes outside play so a dialogue partner cannot walk away
    // mid-conversation; facing and the nameplate keep updating.
    const live = s.phase === "playing" || s.phase === "ruins";
    const storm = s.weather === "storm";
    if (!storm) viaDone.current = false;

    let target = stationAt(sim.schedule, s.timeOfDay);
    if (storm) {
      if (sim.stormVia && !viaDone.current) {
        if (Math.hypot(sim.stormVia.x - p.x, sim.stormVia.z - p.z) < 0.5) {
          viaDone.current = true;
        }
        target = viaDone.current ? sim.shelter : sim.stormVia;
      } else {
        target = sim.shelter;
      }
    }

    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    let speed = 0;
    if (live && dist > ARRIVE_EPS) {
      speed = WALK_SPEED;
      const step = Math.min(dist, WALK_SPEED * d);
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
    }

    const px = s.playerPos.x - p.x;
    const pz = s.playerPos.z - p.z;
    const playerDist = Math.hypot(px, pz);
    const want =
      speed > 0
        ? Math.atan2(dx, dz)
        : playerDist < FACE_RADIUS
          ? Math.atan2(px, pz)
          : storm
            ? Math.atan2(HATCH.x - p.x, HATCH.z - p.z)
            : heading.current;
    const diff = Math.atan2(
      Math.sin(want - heading.current),
      Math.cos(want - heading.current),
    );
    heading.current += diff * Math.min(1, 10 * d);

    g.position.set(p.x, sampleHeight(p.x, p.z), p.z);
    g.rotation.y = heading.current;
    const anim: AnimState = speed > 0 ? "walk" : "idle";
    g.userData.speed = speed;
    g.userData.anim = anim;
    npcPositions.set(npc.id, p);

    uiAcc.current += d;
    if (uiAcc.current >= UI_PERIOD) {
      uiAcc.current = 0;
      // Nameplates are HUD, not world: they stay out of photographs.
      const plate =
        !s.photoMode &&
        (shown.current.plate
          ? playerDist < PLATE_HIDE
          : playerDist < PLATE_SHOW);
      const bark =
        plate && playerDist < BARK_RADIUS && sim.barks
          ? pickBark(sim.barks, talked, s.weather, s.timeOfDay, index)
          : null;
      if (plate !== shown.current.plate || bark !== shown.current.bark) {
        shown.current = { plate, bark };
        setUi(shown.current);
      }
    }
  });

  return (
    <group ref={group} position={[spawn.x, sampleHeight(spawn.x, spawn.z), spawn.z]}>
      <AnimatedCharacter variant="colonist" accent={npc.color} cyberArm={false} />
      {ui.plate && (
        <Html
          distanceFactor={22}
          position={[0, 2.35, 0]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div className="flex flex-col items-center">
            <div
              className={`whitespace-nowrap rounded-sm border px-2 py-0.5 font-mono text-[10px] ${
                talked
                  ? "border-border bg-void/70 text-dim"
                  : "border-accent/50 bg-void/85 text-accent"
              }`}
            >
              {talked ? npc.name : `${npc.name} · E`}
            </div>
            {ui.bark && (
              <div
                className="mt-0.5 max-w-[190px] whitespace-normal rounded-sm border border-border bg-void/75 px-2 py-0.5 text-center font-mono text-[9px] leading-tight text-dim"
              >
                {ui.bark}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

export function NPCs() {
  const talked = useGameStore((s) => s.npcsTalked);
  const spoiler = useGameStore((s) => s.spoilerCeiling);
  const list = NPCS.filter((n) => !n.book2 || spoiler !== "book1");
  return (
    <group>
      {/* Bark seed uses the NPCS index so a ceiling change never reshuffles lines. */}
      {list.map((n) => (
        <NpcFigure
          key={n.id}
          npc={n}
          index={NPCS.indexOf(n)}
          talked={talked.includes(n.id)}
        />
      ))}
    </group>
  );
}
