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

/**
 * Headless weather state machine: store writes, lightning, audio. Mounted
 * unconditionally — WeatherSystem is presentation only and is gated on
 * reducedMotion, which must never gate the simulation.
 */
export function useWeatherSim() {
  const weatherTimer = useRef(0);
  const stormHold = useRef(0);
  const nextStrike = useRef(3);
  const phaseClock = useRef(0);
  const lastKind = useRef<WeatherKind>("haze");

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    if (useGameStore.getState().phase === "paused") return;

    phaseClock.current += d;
    weatherTimer.current += d;

    const cycle = phaseClock.current % 100;
    let kind: WeatherKind = "haze";
    let intensity = 0.3;
    if (cycle < 22) {
      kind = "clear";
      intensity = 0.1;
    } else if (cycle < 42) {
      kind = "haze";
      intensity = 0.35;
    } else if (cycle < 62) {
      kind = "rain";
      intensity = 0.55;
    } else if (cycle < 82) {
      kind = "storm";
      intensity = 0.85 + Math.sin(phaseClock.current) * 0.1;
      stormHold.current += d;
      if (stormHold.current > 18) {
        useGameStore.getState().markStormSurvived();
      }
    } else {
      kind = "rain";
      intensity = 0.4;
      stormHold.current = 0;
    }

    if (kind !== lastKind.current) {
      lastKind.current = kind;
      useGameStore.getState().setWeather(kind, intensity);
    }

    if (kind === "storm") {
      nextStrike.current -= d;
      if (nextStrike.current <= 0) {
        strike.id += 1;
        strike.power = 40 + Math.random() * 50;
        strike.x = (Math.random() - 0.5) * 100;
        strike.y = 40;
        strike.z = 40 + Math.random() * 80;
        nextStrike.current = 2 + Math.random() * 5;
        getAudio().pulseAlert();
        const p = useGameStore.getState().playerPos;
        if (p.x < -80 && p.y > 8) {
          useGameStore.getState().setHealth(useGameStore.getState().health - 2);
        }
      }
    }

    if (weatherTimer.current > 0.4) {
      weatherTimer.current = 0;
      const a = getAudio();
      a.setOutdoor(kind === "storm" ? 1 : kind === "rain" ? 0.7 : 0.4);
      if (kind === "storm") a.setTension(0.6);
    }
  });
}
