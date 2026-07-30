/**
 * The graphics quality ladder.
 *
 * `reducedMotion` used to be the only graphics lever in the game, which
 * conflated an accessibility preference with a performance one: a player who
 * dislikes motion lost the entire composer, and a player on a weak phone had no
 * way to buy frames back without also flattening the interface. The tier below
 * is a device preference; `reducedMotion` stays a separate accessibility
 * switch and keeps working exactly as it does today.
 *
 * Deliberately free of three.js and React imports so scene modules can read the
 * numbers without dragging the renderer into their dependency graph.
 */

export type QualityTier = "low" | "medium" | "high";

/** Cheapest to richest. The auto-tuner only ever walks this backwards. */
export const QUALITY_ORDER = ["low", "medium", "high"] as const;

export type QualitySettings = {
  /** Upper bound of the Canvas `dpr` range; the floor is always 1. */
  dprCap: number;
  /**
   * Square shadow map edge for any shadow-casting light. Read even when
   * `shadowsEnabled` is false so the value is defined if a tier flips it on.
   */
  shadowMapSize: number;
  shadowsEnabled: boolean;
  /**
   * Which composer passes run. "off" skips the EffectComposer entirely, which
   * also drops the MSAA resolve and the extra full-screen blit — the single
   * largest saving available on a tile-based mobile GPU. "bloom" is the shipped
   * look: the bloom pass plus the cheap colour grade (chromatic aberration and
   * vignette merge into one EffectPass). "full" adds ambient occlusion ahead of
   * both.
   */
  postFx: "off" | "bloom" | "full";
  /** N8AO in the composer. Only ever true when `postFx` is "full". */
  ao: boolean;
  /**
   * Renderer shadow filter. "vsm" buys a real blurred penumbra (the light's
   * `shadow.radius`/`shadow.blurSamples` drive a separable blur over the whole
   * map every shadow update) but also draws shadow *receivers* into the depth
   * pass — that is how three r185's WebGLShadowMap works, not an option. "pcf"
   * is the cheap fallback: three r185 deprecated PCFSoftShadowMap (it warns and
   * silently falls back), so "pcf" must map to plain PCFShadowMap, softened
   * only by `shadowRadius` tap spread.
   */
  shadowType: "pcf" | "vsm";
  /**
   * The light's `shadow.radius`. Under VSM it is the blur radius in texels;
   * under PCF it spreads the fixed tap pattern. Read even on tiers with
   * shadows disabled so the value is defined if a tier flips them on.
   */
  shadowRadius: number;
  /** VSM separable-blur taps per direction; ignored by PCF. */
  shadowBlurSamples: number;
  /**
   * Composer MSAA samples. PostFX clamps this at runtime to the context's
   * `capabilities.maxSamples`, and to 2 on coarse pointers — tile-based mobile
   * GPUs pay for the resolve, and the phone budget predates this field. 0 on
   * tiers that never mount a composer.
   */
  msaa: number;
  /** postprocessing GodRays sourced from the sun disc. Costs three extra
      half-resolution passes per frame, so the top tier only. */
  godRays: boolean;
  /** The filmic grade: brightness/contrast + saturation, one merged pass. */
  grade: boolean;
  /** Camera far plane in metres — also the useful terrain draw distance. */
  farPlane: number;
  /** Multiplier on weather particle counts. */
  particleScale: number;
  /** Multiplier on grass blade count. */
  grassDensity: number;
  /** Multiplier on scattered instance counts: trees, ferns, rocks, debris. */
  vegetationScale: number;
  /**
   * Added to a terrain chunk's computed LOD level before clamping. LOD 0 is the
   * finest tile, so a positive bias means coarser geometry sooner. Consumers
   * own the clamp to their own LOD count.
   */
  terrainLodBias: number;
};

export const QUALITY: Record<QualityTier, QualitySettings> = {
  low: {
    dprCap: 1.25,
    shadowMapSize: 1024,
    // A shadow pass re-renders every caster in the scene. On a phone that is
    // worth more frames than any amount of geometry trimming, so the rescue
    // tier spends it rather than the terrain.
    shadowsEnabled: false,
    postFx: "off",
    ao: false,
    shadowType: "pcf",
    shadowRadius: 1,
    shadowBlurSamples: 8,
    msaa: 0,
    godRays: false,
    grade: false,
    farPlane: 260,
    particleScale: 0.35,
    grassDensity: 0.3,
    vegetationScale: 0.45,
    terrainLodBias: 1,
  },
  medium: {
    dprCap: 1.5,
    shadowMapSize: 2048,
    shadowsEnabled: true,
    postFx: "bloom",
    ao: false,
    // VSM at 8 taps is close to three's own defaults (8 taps, radius 4), so
    // the medium blur pass costs roughly what a stock VSM setup costs.
    shadowType: "vsm",
    shadowRadius: 5,
    shadowBlurSamples: 8,
    msaa: 4,
    godRays: false,
    grade: true,
    farPlane: 340,
    particleScale: 0.7,
    grassDensity: 0.65,
    vegetationScale: 0.75,
    terrainLodBias: 0,
  },
  high: {
    dprCap: 1.75,
    shadowMapSize: 2048,
    shadowsEnabled: true,
    postFx: "full",
    ao: true,
    shadowType: "vsm",
    shadowRadius: 6,
    shadowBlurSamples: 12,
    msaa: 8,
    godRays: true,
    grade: true,
    farPlane: 420,
    particleScale: 1,
    grassDensity: 1,
    vegetationScale: 1,
    terrainLodBias: -1,
  },
};

/**
 * Median frametime, in milliseconds, above which the auto-tuner drops a tier.
 * 28 ms is roughly 36 fps: comfortably below the 30 fps floor a hand-held
 * survey has to hold, and far enough above a 60 fps target that a device merely
 * missing vsync occasionally is never punished for it.
 */
export const FRAME_BUDGET_MS = 28;

/** `deviceMemory` is Chromium-only and absent from the DOM lib. */
type HardwareNavigator = Navigator & { deviceMemory?: number };

/**
 * A conservative first guess from hardware hints. Hints lie in both directions,
 * so this only has to be roughly right — the frametime sampler corrects
 * downward from here, and the player can override from Settings.
 */
export function detectTier(): QualityTier {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "medium";
  }
  const nav: HardwareNavigator = navigator;
  const cores = nav.hardwareConcurrency || 4;
  // Quantised to 0.25/0.5/1/2/4/8 and undefined off Chromium, so it can only
  // ever push the guess down, never up.
  const memory = nav.deviceMemory;
  const coarse = window.matchMedia
    ? window.matchMedia("(pointer: coarse)").matches
    : false;

  // Hand-helds are judged on their own terms. iOS clamps hardwareConcurrency
  // to 4 whatever the SoC, so a desktop core threshold would drop every iPhone
  // ever made onto the rescue tier with no way back up — and the tuner only
  // walks downward. Cap phones at medium and let the sampler decide.
  if (coarse) {
    return memory !== undefined && memory <= 4 ? "low" : "medium";
  }
  if (cores <= 4 || (memory !== undefined && memory <= 4)) return "low";
  if (cores >= 8 && (memory === undefined || memory >= 8)) return "high";
  return "medium";
}

export function isQualityTier(value: unknown): value is QualityTier {
  return value === "low" || value === "medium" || value === "high";
}

/** The next tier down, or null when there is nothing cheaper left to give up. */
export function lowerTier(tier: QualityTier): QualityTier | null {
  const index = QUALITY_ORDER.indexOf(tier);
  return index > 0 ? QUALITY_ORDER[index - 1] : null;
}

/** One terse line of what a tier actually costs, derived so it cannot drift. */
export function describeTier(tier: QualityTier): string {
  const q = QUALITY[tier];
  const fx =
    q.postFx === "off"
      ? "no post FX"
      : [
          "bloom",
          ...(q.ao ? ["AO"] : []),
          ...(q.godRays ? ["rays"] : []),
          ...(q.grade ? ["grade"] : []),
        ].join("+");
  const shadows = q.shadowsEnabled
    ? `${q.shadowMapSize} ${q.shadowType === "vsm" ? "soft " : ""}shadows`
    : "no shadows";
  const flora = Math.round(q.vegetationScale * 100);
  return `${q.dprCap}× pixels · ${shadows} · ${fx} · ${q.farPlane} m draw · ${flora}% flora`;
}
