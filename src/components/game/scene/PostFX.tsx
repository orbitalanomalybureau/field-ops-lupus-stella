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

/**
 * Antialiasing samples for the composer's buffer.
 *
 * The renderer's own `antialias` flag does nothing once an EffectComposer is in
 * the pipeline — it antialiases the default framebuffer, not the composer's
 * FBO — so this used to ship every frame fully aliased.
 *
 * MSAA resolves are costly on tile-based and integrated GPUs, but the obvious
 * alternative is worse here: postprocessing's SMAA pass embeds a 66 KB base64
 * lookup texture, which means paying ~50 KB gz of extra download on exactly the
 * devices that can least afford it. Two samples on mobile removes the worst
 * crawling edges at a fraction of the fill cost, for zero bytes.
 */
function msaaSamples(): number {
  if (typeof window === "undefined") return 4;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const lowDpr = window.devicePixelRatio < 1.5;
  return coarse || lowDpr ? 2 : 4;
}

export function PostFX() {
  const scanner = useGameStore((s) => s.scannerActive);
  const samples = useMemo(() => msaaSamples(), []);
  const offset = useMemo(
    () => new Vector2(scanner ? 0.0011 : 0.0003, scanner ? 0.0011 : 0.0003),
    [scanner],
  );

  return (
    <EffectComposer multisampling={samples}>
      <>
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
      </>
    </EffectComposer>
  );
}
