import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useGameStore } from "@/game/store";
import { getAudio } from "@/game/audio";
import type { WeatherKind } from "@/game/types";

/** A scheduled strike; `id` increments so the flash fires exactly once. */
export type LightningStrike = {
  id: number;
  x: number;
  y: number;
  z: number;
  power: number;
};

const strike: LightningStrike = { id: 0, x: 0, y: 40, z: 0, power: 0 };

/**
 * The sim owns the strike schedule and WeatherSystem only draws it, so storms
 * still damage and still count when the particle layer is unmounted.
 */
export function getLightningStrike(): Readonly<LightningStrike> {
  return strike;
}

/** Park–Miller LCG. QA replays the same forecast; never seed from time. */
const WEATHER_SEED = 20121;
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Steady intensity each kind cross-lerps toward on entry. */
const BASE_INTENSITY: Record<WeatherKind, number> = {
  clear: 0.1,
  haze: 0.35,
  rain: 0.55,
  storm: 0.9,
};

/** Dwell range in seconds, rolled per visit. */
const DWELL: Record<WeatherKind, readonly [number, number]> = {
  clear: [75, 150],
  haze: [60, 120],
  rain: [60, 120],
  storm: [60, 95],
};

/** Seconds of warning before a storm state begins. */
const WARNING_LEAD = 30;

/** Contiguous storm exposure that satisfies the survival objective. */
const STORM_HOLD = 18;

/** Adjacent intensities only: clear never jumps straight to an ion cell. */
function rollNext(kind: WeatherKind, roll: number): WeatherKind {
  if (kind === "clear") return "haze";
  if (kind === "haze") return roll < 0.55 ? "clear" : "rain";
  if (kind === "rain") return roll < 0.5 ? "haze" : "storm";
  return "rain";
}

/**
 * Headless weather state machine: store writes, lightning, audio. Mounted
 * unconditionally — WeatherSystem is presentation only and is gated on
 * reducedMotion, which must never gate the simulation.
 *
 * Markov chain over clear/haze/rain/storm rather than the old fixed loop. The
 * kind flips at transition start (Tutorial and signal logic key off it) while
 * `weatherIntensity` cross-lerps over 6–10 s; DayNight already filters its
 * storminess from the intensity, so presentation glides instead of cutting.
 */
export function useWeatherSim() {
  const rng = useRef<(() => number) | null>(null);
  const kind = useRef<WeatherKind>("haze");
  const next = useRef<WeatherKind>("haze");
  const intensity = useRef(0.3);
  /** Time left in the current state, including its lerp-in window. */
  const stateLeft = useRef(0);
  const lerpLeft = useRef(0);
  const lerpDur = useRef(1);
  const lerpFrom = useRef(0.3);
  const warned = useRef(false);
  const started = useRef(false);
  const publishAcc = useRef(0);
  const stormHold = useRef(0);
  const nextStrike = useRef(3);
  const audioAcc = useRef(0);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const store = useGameStore.getState();
    if (store.phase === "paused") return;
    if (!rng.current) rng.current = seeded(WEATHER_SEED);
    const rand = rng.current;

    // Adopt externally set weather instead of fighting it: the deep-link `wx`
    // pin (applied before the canvas mounts) seeds the first state here, and a
    // later external write (host deeplink, the Broadcast ending's storm) re-
    // bases the chain on whatever the store says. Adopted states keep their
    // pinned intensity — no lerp, no republish — until their dwell expires.
    if (!started.current || store.weather !== kind.current) {
      started.current = true;
      kind.current = store.weather;
      intensity.current = store.weatherIntensity;
      next.current = rollNext(kind.current, rand());
      const [lo, hi] = DWELL[kind.current];
      stateLeft.current = lo + rand() * (hi - lo);
      lerpLeft.current = 0;
      warned.current = false;
      stormHold.current = 0;
      nextStrike.current = 2.5 + rand() * 3;
    }

    if (lerpLeft.current > 0) {
      lerpLeft.current = Math.max(0, lerpLeft.current - d);
      const t = 1 - lerpLeft.current / lerpDur.current;
      intensity.current =
        lerpFrom.current +
        (BASE_INTENSITY[kind.current] - lerpFrom.current) * t;
      // Throttled: DayNight low-passes storminess anyway, and per-frame store
      // writes would re-render every weather subscriber at frame rate.
      publishAcc.current += d;
      if (publishAcc.current > 0.3 || lerpLeft.current === 0) {
        publishAcc.current = 0;
        store.setWeather(kind.current, intensity.current);
      }
    }

    stateLeft.current -= d;

    if (
      next.current === "storm" &&
      !warned.current &&
      stateLeft.current < WARNING_LEAD
    ) {
      warned.current = true;
      // Berger reads incoming ion fronts off the ark's skin; ozone is his tell.
      store.pushMessage("WX — ozone on the wind. Ion cell inbound.");
    }

    if (stateLeft.current <= 0) {
      lerpFrom.current = intensity.current;
      kind.current = next.current;
      lerpDur.current = 6 + rand() * 4;
      lerpLeft.current = lerpDur.current;
      const [lo, hi] = DWELL[kind.current];
      stateLeft.current = lerpDur.current + lo + rand() * (hi - lo);
      next.current = rollNext(kind.current, rand());
      warned.current = false;
      stormHold.current = 0;
      if (kind.current === "storm") nextStrike.current = 2.5 + rand() * 3;
      store.setWeather(kind.current, lerpFrom.current);
    }

    if (kind.current === "storm") {
      stormHold.current += d;
      if (stormHold.current > STORM_HOLD) {
        store.markStormSurvived();
      }

      nextStrike.current -= d;
      if (nextStrike.current <= 0) {
        strike.id += 1;
        strike.power = 40 + rand() * 50;
        strike.x = (rand() - 0.5) * 100;
        strike.y = 40;
        strike.z = 40 + rand() * 80;
        nextStrike.current = 2 + rand() * 5;
        const p = store.playerPos;
        const range = Math.hypot(p.x - strike.x, p.z - strike.z);
        getAudio().thunder(Math.max(0, 1 - range / 260));
        // Exposed-ridge rule, unchanged: altitude west of the spine bleeds.
        if (p.x < -80 && p.y > 8) {
          useGameStore.getState().setHealth(useGameStore.getState().health - 2);
        }
      }
    }

    audioAcc.current += d;
    if (audioAcc.current > 0.4) {
      audioAcc.current = 0;
      const a = getAudio();
      const k = kind.current;
      a.setOutdoor(k === "storm" ? 1 : k === "rain" ? 0.7 : 0.4);
      if (k === "storm") a.setTension(0.6);
      a.setRain(k === "rain" || k === "storm" ? intensity.current : 0);
      a.setInterior(store.insideDome);
    }
  });
}
