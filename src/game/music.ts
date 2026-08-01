/**
 * Adaptive music — three modal strata that thicken with threat.
 *
 * Same idiom as audio.ts: no samples, a handful of long-lived oscillators,
 * gain ramps measured in seconds, nothing allocated per frame. Everything
 * stays in D Phrygian, which puts the ambience bed's 55 Hz A1 drone under the
 * music as a pedal fifth instead of against it.
 *
 *   0 survey — D2 pedal pair, plus a fifth that swells in and back out over
 *              ~50 s; at rest this is nearly silence, which is the point
 *   1 alert  — D/F pad through a soft lowpass, plus a slow gain pulse
 *   2 hunted — Eb4 saw (the Phrygian b2) grinding on the pedal, pulse quicker
 *
 * Strata cross-fade on setTargetAtTime, faster up than down: threat arrives
 * quicker than it leaves. The layer's lowpass opens with intensity, so calm
 * exploration is dark and muffled before it is quiet.
 *
 * The layer drives itself from the store (installMusicDriver) — no scene code
 * calls it. `phase` decides whether music exists at all; trackedByFang,
 * packsAggroed, health, weather and insideDome set the intensity. The
 * subscription runs at store-change frequency, which is per frame in practice
 * (setPlayerPose, setTimeOfDay), so it compares its raw inputs first and only
 * touches the graph when the derived intensity actually moves.
 *
 * Voices are built on the first start() and torn down a few seconds after
 * stop(): menus, the boot screen and a muted mix burn no oscillators.
 */

import { useGameStore } from "./store";
import type { GamePhase, WeatherKind } from "./types";

/** D Phrygian. The whole layer stays in it; nothing here ever modulates. */
const D2 = 73.42;
const D3 = 146.83;
const F3 = 174.61;
const A3 = 220.0;
const EB4 = 311.13; // b2 — the interval the hunted stratum leans on

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0 below `from`, 1 above `to` — one stratum's cross-fade window. */
const window01 = (v: number, from: number, to: number): number => clamp01((v - from) / (to - from));

export type MusicLayer = {
  /** Build (if needed) and fade in. Idempotent while already running. */
  start: () => void;
  /** Fade out over seconds, then tear the voices down. */
  stop: () => void;
  /** 0..1 threat. Small moves are ignored; the rest ramp, never jump. */
  setIntensity: (v: number) => void;
  /** Dome interior: duck and darken, matching the weather bus. */
  setInterior: (on: boolean) => void;
  /** Immediate teardown, no fade — for context close. */
  dispose: () => void;
};

type Voices = {
  bus: GainNode;
  color: BiquadFilterNode;
  s0: GainNode;
  s1: GainNode;
  s2: GainNode;
  pulseLfo: OscillatorNode;
  oscs: OscillatorNode[];
};

/** Seconds after the fade-out before the oscillators are actually stopped. */
const TEARDOWN_DELAY_MS = 4500;

export function createMusicLayer(ctx: AudioContext, out: AudioNode): MusicLayer {
  let voices: Voices | null = null;
  let teardown: number | null = null;
  let running = false;
  let interior = false;
  let intensity = 0;

  const build = (): Voices => {
    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    bus.connect(out);

    // One lowpass for the whole layer: intensity opens the music up, the dome
    // closes it down. Voices -> stratum gain -> color -> bus.
    const color = ctx.createBiquadFilter();
    color.type = "lowpass";
    color.frequency.value = 300;
    color.Q.value = 0.5;
    color.connect(bus);

    const osc = (shape: OscillatorType, freq: number): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = shape;
      o.frequency.value = freq;
      return o;
    };

    /* ------------------------------ 0: survey ------------------------------ */

    const s0 = ctx.createGain();
    s0.gain.value = 0.022;
    s0.connect(color);
    const root = osc("sine", D2);
    const rootB = osc("sine", D2 * 1.005); // ~0.37 Hz beat — the pedal breathes
    root.connect(s0);
    rootB.connect(s0);

    // The fifth has to be able to leave: a unipolar 0..1 swell (LFO into a
    // gain biased to 0.5) means real silence at the bottom, not phase flip.
    const swell = ctx.createGain();
    swell.gain.value = 0.5;
    const swellLfo = osc("sine", 0.021); // ~48 s
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.5;
    swellLfo.connect(swellDepth);
    swellDepth.connect(swell.gain);
    const fifth = osc("triangle", A3);
    const fifthTrim = ctx.createGain();
    fifthTrim.gain.value = 0.5;
    fifth.connect(fifthTrim);
    fifthTrim.connect(swell);
    swell.connect(s0);

    /* ------------------------------- 1: alert ------------------------------- */

    const s1 = ctx.createGain();
    s1.gain.value = 0;
    s1.connect(color);
    const pad = ctx.createBiquadFilter();
    pad.type = "lowpass";
    pad.frequency.value = 900;
    pad.Q.value = 0.7;
    pad.connect(s1);
    const mid1 = osc("triangle", D3);
    const mid2 = osc("triangle", F3); // minor third — the mode's whole colour
    mid1.connect(pad);
    mid2.connect(pad);

    // The pulse: the pedal breathed by a second unipolar LFO whose rate rises
    // with intensity. A gain shape, not a retrigger — nothing to click.
    const pulseLfo = osc("sine", 0.5);
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.5;
    const pulseGate = ctx.createGain();
    pulseGate.gain.value = 0.5;
    pulseLfo.connect(pulseDepth);
    pulseDepth.connect(pulseGate.gain);
    const pulseOsc = osc("sawtooth", D2);
    const pulseFilter = ctx.createBiquadFilter();
    pulseFilter.type = "lowpass";
    pulseFilter.frequency.value = 150;
    pulseFilter.Q.value = 1;
    const pulseTrim = ctx.createGain();
    pulseTrim.gain.value = 1.2;
    pulseOsc.connect(pulseFilter);
    pulseFilter.connect(pulseGate);
    pulseGate.connect(pulseTrim);
    pulseTrim.connect(s1);

    /* ------------------------------ 2: hunted ------------------------------ */

    const s2 = ctx.createGain();
    s2.gain.value = 0;
    s2.connect(color);
    const upFilter = ctx.createBiquadFilter();
    upFilter.type = "lowpass";
    upFilter.frequency.value = 520;
    upFilter.Q.value = 2;
    upFilter.connect(s2);
    const up = osc("sawtooth", EB4);
    up.connect(upFilter);
    // A few cents of drift so the b2 never locks to the pedal's partials.
    const drift = osc("sine", 0.047);
    const driftDepth = ctx.createGain();
    driftDepth.gain.value = 1.6;
    drift.connect(driftDepth);
    driftDepth.connect(up.frequency);

    const oscs = [root, rootB, fifth, swellLfo, mid1, mid2, pulseOsc, pulseLfo, up, drift];
    for (const o of oscs) o.start();

    return { bus, color, s0, s1, s2, pulseLfo, oscs };
  };

  /** Push the current intensity/interior/running state at the graph. */
  const apply = (rising: boolean): void => {
    const v = voices;
    if (!v) return;
    const t = ctx.currentTime;
    const i = intensity;
    // Seconds either way; a threat blooms in about three, and takes ten to go.
    const tc = rising ? 1.1 : 3.2;
    v.s0.gain.setTargetAtTime(0.022 + i * 0.016, t, tc);
    v.s1.gain.setTargetAtTime(0.032 * window01(i, 0.22, 0.52), t, tc);
    v.s2.gain.setTargetAtTime(0.04 * window01(i, 0.5, 0.85), t, tc);
    v.pulseLfo.frequency.setTargetAtTime(0.5 + i * 0.75, t, 4);
    v.color.frequency.setTargetAtTime((300 + i * 1500) * (interior ? 0.4 : 1), t, 1.6);
    v.bus.gain.setTargetAtTime(running ? (interior ? 0.5 : 1) : 0, t, running ? 1.2 : 0.9);
  };

  const hardStop = (): void => {
    if (teardown !== null) {
      window.clearTimeout(teardown);
      teardown = null;
    }
    const v = voices;
    if (!v) return;
    voices = null;
    try {
      for (const o of v.oscs) o.stop();
      v.bus.disconnect();
    } catch {
      /* context already closed — nothing left to release */
    }
  };

  return {
    start: () => {
      if (teardown !== null) {
        window.clearTimeout(teardown);
        teardown = null;
      }
      if (running && voices) return;
      running = true;
      if (!voices) voices = build();
      apply(true);
    },
    stop: () => {
      if (!running) return;
      running = false;
      apply(false);
      if (voices && teardown === null) teardown = window.setTimeout(hardStop, TEARDOWN_DELAY_MS);
    },
    setIntensity: (v) => {
      const next = clamp01(v);
      if (Math.abs(next - intensity) < 0.015) return;
      const rising = next > intensity;
      intensity = next;
      apply(rising);
    },
    setInterior: (on) => {
      if (on === interior) return;
      interior = on;
      apply(false);
    },
    dispose: () => {
      running = false;
      hardStop();
    },
  };
}

/* ------------------------------- store driver ------------------------------- */

/** The store fields the music reads. Structural, so nothing imports the store type. */
type MusicInputs = {
  phase: GamePhase;
  prevPhase: GamePhase | null;
  trackedByFang: boolean;
  packsAggroed: boolean;
  health: number;
  weather: WeatherKind;
  weatherIntensity: number;
  insideDome: boolean;
  reducedMotion: boolean;
  masterVolume: number;
};

const inPlay = (p: GamePhase | null): boolean => p === "playing" || p === "ruins";

/**
 * Overlays (pause, journal, settings, photo, dialogue) sit on top of a live
 * session, so they hold the bed and duck it rather than restarting the layer
 * every time the journal opens. Only the shell phases — boot, select,
 * briefing, complete — are silent.
 */
const isOverlay = (p: GamePhase): boolean =>
  p === "paused" || p === "journal" || p === "settings" || p === "photo" || p === "dialogue";

function intensityOf(s: MusicInputs): number {
  let v = 0.05;
  if (s.trackedByFang) v += 0.6; // the one input that alone reaches "hunted"
  if (s.packsAggroed) v += 0.22;
  if (s.health < 55) v += ((55 - s.health) / 55) * 0.3;
  if (s.weather === "storm") v += 0.14 + s.weatherIntensity * 0.16;
  else if (s.weather === "rain") v += s.weatherIntensity * 0.1;
  if (s.insideDome) v *= 0.45;
  if (isOverlay(s.phase)) v *= 0.5;
  // Reduced motion reads as "don't work me up": cap the ceiling, which also
  // holds the pulse slow, since its rate is derived from intensity.
  if (s.reducedMotion && v > 0.55) v = 0.55;
  return clamp01(v);
}

/**
 * Subscribe the layer to the store. Returns the uninstaller; call it before
 * disposing the layer. Seeds itself from the current state so a driver
 * installed mid-session doesn't wait for the next store write.
 */
export function installMusicDriver(layer: MusicLayer): () => void {
  let phase: GamePhase | null = null;
  let prevPhase: GamePhase | null = null;
  let tracked = false;
  let aggro = false;
  let health = -1;
  let weather: WeatherKind | null = null;
  let weatherIntensity = -1;
  let insideDome = false;
  let reducedMotion = false;
  let volume = -1;
  let active = false;
  let sent = -1;

  const apply = (s: MusicInputs): void => {
    // Store writes are per frame in practice; this comparison is the whole
    // reason the music costs nothing while the player is just walking.
    if (
      s.phase === phase &&
      s.prevPhase === prevPhase &&
      s.trackedByFang === tracked &&
      s.packsAggroed === aggro &&
      s.health === health &&
      s.weather === weather &&
      s.weatherIntensity === weatherIntensity &&
      s.insideDome === insideDome &&
      s.reducedMotion === reducedMotion &&
      s.masterVolume === volume
    ) {
      return;
    }
    phase = s.phase;
    prevPhase = s.prevPhase;
    tracked = s.trackedByFang;
    aggro = s.packsAggroed;
    health = s.health;
    weather = s.weather;
    weatherIntensity = s.weatherIntensity;
    insideDome = s.insideDome;
    reducedMotion = s.reducedMotion;
    volume = s.masterVolume;

    // A muted mix stops the layer outright — silence should not cost voices.
    const on =
      s.masterVolume > 0 && (inPlay(s.phase) || (isOverlay(s.phase) && inPlay(s.prevPhase)));
    if (on !== active) {
      active = on;
      if (on) layer.start();
      else layer.stop();
    }
    if (!on) return;
    const next = intensityOf(s);
    if (Math.abs(next - sent) < 0.02) return;
    sent = next;
    layer.setIntensity(next);
  };

  const unsub = useGameStore.subscribe(apply);
  apply(useGameStore.getState());
  return () => {
    unsub();
    layer.stop();
  };
}
