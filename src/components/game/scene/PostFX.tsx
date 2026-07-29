import {
  EffectComposer,
  Bloom,
  N8AO,
  ToneMapping,
  Vignette,
  ChromaticAberration,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { useMemo } from "react";
import { Vector2 } from "three";
import { QUALITY } from "@/game/quality";
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
  const quality = useGameStore((s) => s.quality);
  const settings = QUALITY[quality];
  const samples = useMemo(() => msaaSamples(), []);
  const offset = useMemo(
    () => new Vector2(scanner ? 0.0011 : 0.0003, scanner ? 0.0011 : 0.0003),
    [scanner],
  );

  // Unmounting the composer outright is the point of the low tier: it also
  // drops the MSAA resolve and the extra full-screen blit, not just the passes.
  if (settings.postFx === "off") return null;

  return (
    <EffectComposer multisampling={samples}>
      <>
        {/* Ambient occlusion first, so the bloom sees the contact shadows it
            adds rather than blooming over them. Half resolution with
            depth-aware upsampling: the grounding effect survives the downsample
            but the sample cost does not. */}
        {settings.ao && (
          <N8AO
            halfRes
            depthAwareUpsampling
            aoRadius={1.7}
            distanceFalloff={0.9}
            intensity={2.1}
            aoSamples={12}
            denoiseSamples={4}
            denoiseRadius={12}
            color="#1a0e08"
          />
        )}
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
        {/* Last, and not optional. Mounting a composer takes tone mapping away
            from the renderer, so without this the scene is displayed as raw
            linear radiance and every lit surface crushes to near-black — the
            sky survived only because it opts out of tone mapping entirely.
            ACES at 1.2 exposure here mirrors the renderer's own settings in
            GameCanvas, so the low tier (no composer) and the tiers that do run
            one agree on how the planet looks. */}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </>
    </EffectComposer>
  );
}
