import { PlayerController } from "./PlayerController";
import { Colony } from "./Colony";
import { Forest } from "./Forest";
import { Terrain } from "./Terrain";
import { Creatures } from "./Creatures";
import { Ruins } from "./Ruins";
import { InteractionSystem } from "./InteractionSystem";
import { WorldPOIs } from "./WorldPOIs";
import { DayNight } from "./DayNight";
import { SkyDome } from "./SkyDome";
import { WeatherSystem } from "./WeatherSystem";
import { Ridge7 } from "./Ridge7";
import { NPCs } from "./NPCs";
import { KaguyahimeCoast } from "./KaguyahimeCoast";
import { CommandDomeInterior, DomeHatchMarker } from "./CommandDome";
import { PostFX } from "./PostFX";
import { useWeatherSim } from "./useWeatherSim";
import { WORLD } from "@/game/data";
import { useGameStore } from "@/game/store";

export function GameScene() {
  const reduced = useGameStore((s) => s.reducedMotion);

  // Simulation is never gated on reducedMotion — only the particles are.
  useWeatherSim();

  return (
    <>
      <color attach="background" args={["#2a1812"]} />
      {/* Near/far stay weather-driven distances; SkyDome's patched fog chunk
          turns them into a height-attenuated density and takes the colour from
          the same atmosphere the dome is painted with. */}
      <fog attach="fog" args={["#3a2218", 20, 150]} />

      {/* DayNight writes `atmosphere` and must run before anything reads it,
          which for useFrame means it mounts first. SkyDome draws its dome last
          in the opaque pass, so the world's depth rejects the sky pixels. */}
      <DayNight />
      <SkyDome />
      {!reduced && <WeatherSystem />}
      <Terrain />
      <Colony />
      <DomeHatchMarker />
      <CommandDomeInterior />
      <Forest />
      <Ridge7 />
      <KaguyahimeCoast />
      <NPCs />
      <Creatures />
      <WorldPOIs />
      <Ruins position={WORLD.ruinPos} />
      <PlayerController />
      <InteractionSystem />
      {!reduced && <PostFX />}
    </>
  );
}
