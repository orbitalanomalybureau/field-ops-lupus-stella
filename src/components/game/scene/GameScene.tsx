import { PlayerController } from "./PlayerController";
import { Colony } from "./Colony";
import { Forest } from "./Forest";
import { Terrain } from "./Terrain";
import { Creatures } from "./Creatures";
import { Ruins } from "./Ruins";
import { InteractionSystem } from "./InteractionSystem";
import { WorldPOIs } from "./WorldPOIs";
import { DayNight } from "./DayNight";
import { WeatherSystem } from "./WeatherSystem";
import { Ridge7 } from "./Ridge7";
import { NPCs } from "./NPCs";
import { KaguyahimeCoast } from "./KaguyahimeCoast";
import { CommandDomeInterior, DomeHatchMarker } from "./CommandDome";
import { PostFX } from "./PostFX";
import { WORLD } from "@/game/data";
import { useGameStore } from "@/game/store";

export function GameScene() {
  const reduced = useGameStore((s) => s.reducedMotion);

  return (
    <>
      <color attach="background" args={["#2a1812"]} />
      <fog attach="fog" args={["#3a2218", 20, 150]} />

      <DayNight />
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
