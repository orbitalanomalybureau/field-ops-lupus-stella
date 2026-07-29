import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useMemo } from "react";
import { Vector2 } from "three";
import { useGameStore } from "@/game/store";

export function PostFX() {
  const scanner = useGameStore((s) => s.scannerActive);
  const offset = useMemo(
    () => new Vector2(scanner ? 0.0011 : 0.0003, scanner ? 0.0011 : 0.0003),
    [scanner],
  );

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        luminanceThreshold={scanner ? 0.32 : 0.52}
        luminanceSmoothing={0.45}
        intensity={scanner ? 1.25 : 0.75}
        mipmapBlur
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={offset}
      />
      <Vignette eskil={false} offset={0.15} darkness={scanner ? 0.72 : 0.5} />
    </EffectComposer>
  );
}
