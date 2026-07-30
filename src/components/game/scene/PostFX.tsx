import {
  EffectComposer,
  Bloom,
  BrightnessContrast,
  GodRays,
  HueSaturation,
  N8AO,
  ToneMapping,
  Vignette,
  ChromaticAberration,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import type { GodRaysEffect } from "postprocessing";
import { memo, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector2 } from "three";
import type { Mesh } from "three";
import { atmosphere } from "@/game/atmosphere";
import { getGodRaySource, subscribeGodRaySource } from "@/game/godRaySource";
import { QUALITY } from "@/game/quality";
import { useGameStore } from "@/game/store";

/**
 * Antialiasing samples for the composer's buffer.
 *
 * The renderer's own `antialias` flag does nothing once an EffectComposer is in
 * the pipeline — it antialiases the default framebuffer, not the composer's
 * FBO. The requested count now comes from the quality ladder; this clamps it to
 * what the context can actually resolve, and holds coarse-pointer devices at 2
 * regardless of tier: MSAA resolves are costly on tile-based GPUs, and 2 was
 * the shipped phone budget — the ladder must not raise it. (SMAA stays off the
 * table: postprocessing's pass embeds a 66 KB base64 lookup texture, ~50 KB gz
 * of download on exactly the devices that can least afford it.)
 */
function clampMsaa(requested: number, maxSamples: number): number {
  const cap =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
      ? 2
      : requested;
  return Math.min(requested, maxSamples, cap);
}

/**
 * God rays from the sun-source mesh DayNight publishes. Isolated and memoized
 * because the R3F wrapper rebuilds the whole effect (render targets included)
 * whenever its props object changes identity — a scanner toggle re-rendering
 * PostFX must not recreate FBOs. The `weight` prop only seeds the material;
 * the frame loop drives it so dawn and dusk sing (the dusk² curve peaks at
 * dayFactor 0.5), midday keeps a faint shaft, storms smother it, and night is
 * handled upstream by the source mesh fading out below the horizon.
 */
const SunShafts = memo(function SunShafts({ sun }: { sun: Mesh }) {
  const effect = useRef<GodRaysEffect>(null);

  useFrame(() => {
    if (!effect.current) return;
    const f = atmosphere.dayFactor;
    const dusk = 4 * f * (1 - f);
    effect.current.godRaysMaterial.weight =
      (0.12 + 0.38 * dusk * dusk) * (1 - atmosphere.storminess * 0.8);
  });

  return (
    <GodRays
      ref={effect}
      sun={sun}
      samples={48}
      density={0.96}
      decay={0.92}
      weight={0.3}
      exposure={0.55}
      clampMax={0.9}
    />
  );
});

export function PostFX() {
  const scanner = useGameStore((s) => s.scannerActive);
  const quality = useGameStore((s) => s.quality);
  const gl = useThree((s) => s.gl);
  const settings = QUALITY[quality];
  // The mesh appears one commit after first render (DayNight's refs attach
  // then), and the server snapshot is null for the SSR pass.
  const sunSource = useSyncExternalStore(
    subscribeGodRaySource,
    getGodRaySource,
    () => null,
  );
  const samples = useMemo(
    () => clampMsaa(settings.msaa, gl.capabilities.maxSamples),
    [settings.msaa, gl],
  );
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
        {/* Rays before bloom so a bright shaft can still catch the bloom knee
            like any other bright pixel. Gated on the published mesh as well as
            the tier: the effect crashes on a null light source. */}
        {settings.godRays && sunSource !== null && (
          <SunShafts sun={sunSource} />
        )}
        {/* Softer, not brighter: intensity down from the shipped 0.75/1.25 and
            the luminance knee widened, so glow feathers out of emissives
            instead of ringing them. */}
        <Bloom
          luminanceThreshold={scanner ? 0.32 : 0.52}
          luminanceSmoothing={0.7}
          intensity={scanner ? 1.05 : 0.6}
          mipmapBlur
        />
        {/* The filmic grade (medium+). Deliberately tiny numbers: it has to
            survive under ACES, which already carries most of the filmic curve.
            Both effects merge into the surrounding EffectPass — no extra
            full-screen pass is spent here. */}
        {settings.grade && <BrightnessContrast contrast={0.02} />}
        {settings.grade && <HueSaturation saturation={0.05} />}
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={offset}
        />
        {/* Slightly wider and lighter than the shipped 0.15/0.5 — the frame
            edge should breathe, not read as a porthole. */}
        <Vignette eskil={false} offset={0.18} darkness={scanner ? 0.66 : 0.44} />
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
