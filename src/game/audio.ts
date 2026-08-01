/**
 * Procedural ambience + the SFX identity layer — unlocks on first gesture.
 *
 * Everything is synthesized (no samples). Beds (wind/rain/drone) run as loops;
 * one-shots each get their OWN voice so a harvest never sounds like a kill.
 * A positional layer (HRTF panners, inverse distance) places thunder, the
 * stalking-fang growl, the ruin hum, and the beacon ping in the world; exterior
 * sources route through the weather bus so the dome interior lowpasses and
 * ducks them exactly like the storm.
 *
 * One-shots are gated on a running context: before the user's first gesture
 * they no-op instead of queueing into a suspended graph and firing as a chord
 * on resume.
 *
 * The adaptive music layer lives in ./music. It rides this master bus (so the
 * volume slider, the hurt duck and mute all reach it) and subscribes to the
 * store itself — nothing outside this file has to start or feed it.
 */

import { ENTITIES } from "@/game/entities";
import { createMusicLayer, installMusicDriver } from "./music";

/** Anchors for the placed loops. Fallbacks only guard a data refactor. */
const RUIN_SITE = ENTITIES.find((e) => e.id === "ruin") ?? { x: 18, z: 155 };
const BEACON_SITE = ENTITIES.find((e) => e.id === "ridge-beacon") ?? { x: -118, z: 62 };

/** Listener ear height; panner sources sit near it unless noted. */
const EAR_HEIGHT = 1.6;

type AudioApi = {
  resume: () => void;
  setOutdoor: (v: number) => void;
  setTension: (v: number) => void;
  setNearFern: (v: number) => void;
  /** Rain bed level, 0..1 — the weather sim feeds it weatherIntensity. */
  setRain: (v: number) => void;
  /** Dome interior: lowpass + duck the exterior (weather + positional) bus. */
  setInterior: (v: boolean) => void;
  /** Thunder one-shot; 1 = overhead (bright, loud, immediate), 0 = far. */
  thunder: (distance01?: number) => void;
  /** Placed thunder: panned + attenuated from the last listener pose; falls back to mono. */
  thunderAt: (x: number, z: number) => void;
  setMasterVolume?: (v: number) => void;
  footstep?: (run?: boolean) => void;
  pulseInteract: () => void;
  pulseAlert: () => void;
  /** Pulse-rifle discharge: bright crack + sub blip, seeded per-shot detune. */
  shot: () => void;
  /** Trigger pulled on an empty cell bank — a dead click. */
  dryFire: () => void;
  /** One energy cell finished recharging — soft rising ping. */
  cellTick: () => void;
  /** Bolt connected — tight mid thock. */
  hitConfirm: () => void;
  /** Bolt dropped the target — lower, longer, with a sub component. */
  killThunk: () => void;
  /** The operative took damage: dull body thud + brief lowpass duck of the mix. */
  hurt: () => void;
  /** Two-note minor chime — a successful harvest. */
  harvestChime: () => void;
  /** Slow filtered saw groan — the ruin's seal. */
  sealGroan: () => void;
  /** Three quick ascending sines — a codex entry landing. */
  codexFlourish: () => void;
  /** Flat 120 Hz buzz, short — the world (or a terminal) saying no. */
  refusalBuzz: () => void;
  /** Player ear: world position + facing (three.js yaw; 0 faces -Z). Per frame is fine. */
  updateListener: (x: number, z: number, yaw: number) => void;
  /** The nearest stalking fang's growl loop plays at pos; null fades it out. */
  setStalkerPos: (pos: { x: number; z: number } | null) => void;
  /** Ridge-7 beacon ping loop at the overlook. Inactive by default. */
  setBeaconActive: (on: boolean) => void;
  /** Build (if needed) and fade the music layer in. The store driver calls this. */
  startMusic: () => void;
  /** Fade the music out; the voices are released a few seconds later. */
  stopMusic: () => void;
  /** 0..1 threat for the music strata. Ramped over seconds, never jumped. */
  setMusicIntensity: (v: number) => void;
  dispose: () => void;
};

let api: AudioApi | null = null;

export function getAudio(): AudioApi {
  if (api) return api;
  if (typeof window === "undefined") {
    api = {
      resume: () => {},
      setOutdoor: () => {},
      setTension: () => {},
      setNearFern: () => {},
      setRain: () => {},
      setInterior: () => {},
      thunder: () => {},
      thunderAt: () => {},
      setMasterVolume: () => {},
      footstep: () => {},
      pulseInteract: () => {},
      pulseAlert: () => {},
      shot: () => {},
      dryFire: () => {},
      cellTick: () => {},
      hitConfirm: () => {},
      killThunk: () => {},
      hurt: () => {},
      harvestChime: () => {},
      sealGroan: () => {},
      codexFlourish: () => {},
      refusalBuzz: () => {},
      updateListener: () => {},
      setStalkerPos: () => {},
      setBeaconActive: () => {},
      startMusic: () => {},
      stopMusic: () => {},
      setMusicIntensity: () => {},
      dispose: () => {},
    };
    return api;
  }

  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();

  /** One-shots refuse to schedule into a suspended graph. */
  const ready = () => ctx.state === "running";

  // Seeded LCG (Park–Miller) for per-shot variation and noise-buffer fill —
  // this module owns no Math.random, matching the world's determinism rule.
  let sfxSeed = 48271;
  const sfxRand = (): number => {
    sfxSeed = (sfxSeed * 16807) % 2147483647;
    return (sfxSeed - 1) / 2147483646;
  };

  const master = ctx.createGain();
  master.gain.value = 0.22;
  // hurt() ducks the whole mix through this tail: pain is a filter, not a number.
  const duckFilter = ctx.createBiquadFilter();
  duckFilter.type = "lowpass";
  duckFilter.frequency.value = 18000;
  duckFilter.Q.value = 0.3;
  const duckGain = ctx.createGain();
  duckGain.gain.value = 1;
  master.connect(duckFilter);
  duckFilter.connect(duckGain);
  duckGain.connect(ctx.destination);

  // Shared noise buffer: every burst and bed reads from this one allocation.
  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = sfxRand() * 2 - 1;

  // Exterior bus: wind, rain, thunder and the placed world loops share one
  // path so the dome interior can lowpass and duck them together without
  // touching UI pulses, steps, or the player's own weapon.
  const interiorFilter = ctx.createBiquadFilter();
  interiorFilter.type = "lowpass";
  interiorFilter.frequency.value = 18000;
  interiorFilter.Q.value = 0.4;
  const weatherBus = ctx.createGain();
  weatherBus.gain.value = 1;
  weatherBus.connect(interiorFilter);
  interiorFilter.connect(master);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = "bandpass";
  windFilter.frequency.value = 280;
  windFilter.Q.value = 0.6;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.35;
  noise.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(weatherBus);
  noise.start();

  // Rain bed: the same looping noise source fanned into a brighter band.
  const rainFilter = ctx.createBiquadFilter();
  rainFilter.type = "bandpass";
  rainFilter.frequency.value = 2200;
  rainFilter.Q.value = 0.45;
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0;
  noise.connect(rainFilter);
  rainFilter.connect(rainGain);
  rainGain.connect(weatherBus);

  const drone = ctx.createOscillator();
  drone.type = "sine";
  drone.frequency.value = 55;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.08;
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start();

  const shimmer = ctx.createOscillator();
  shimmer.type = "triangle";
  shimmer.frequency.value = 440;
  const shimLfo = ctx.createOscillator();
  shimLfo.frequency.value = 0.21;
  const shimLfoGain = ctx.createGain();
  shimLfoGain.gain.value = 0.04;
  const shimGain = ctx.createGain();
  shimGain.gain.value = 0;
  shimLfo.connect(shimLfoGain);
  shimLfoGain.connect(shimGain.gain);
  shimmer.connect(shimGain);
  shimGain.connect(master);
  shimmer.start();
  shimLfo.start();

  const tension = ctx.createOscillator();
  tension.type = "sawtooth";
  tension.frequency.value = 90;
  const tFilter = ctx.createBiquadFilter();
  tFilter.type = "lowpass";
  tFilter.frequency.value = 200;
  const tGain = ctx.createGain();
  tGain.gain.value = 0;
  tension.connect(tFilter);
  tFilter.connect(tGain);
  tGain.connect(master);
  tension.start();

  // Music: on the master bus, under everything else. No voices exist until the
  // store driver (installed at the end of this factory) sees a live session.
  const music = createMusicLayer(ctx, master);
  let musicUnsub: (() => void) | null = null;

  /* ------------------------------ voice helpers ------------------------------ */

  type ToneOpts = { at?: number; glideTo?: number; filterFreq?: number; out?: AudioNode };

  /** One decaying oscillator voice: osc -> (lowpass) -> gain -> out. */
  const tone = (
    shape: OscillatorType,
    freq: number,
    peak: number,
    dur: number,
    opts: ToneOpts = {},
  ): void => {
    const t0 = opts.at ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = shape;
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (opts.glideTo !== undefined) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.glideTo), t0 + dur * 0.8);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    let head: AudioNode = o;
    if (opts.filterFreq !== undefined) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = opts.filterFreq;
      head.connect(f);
      head = f;
    }
    head.connect(g);
    g.connect(opts.out ?? master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  };

  type BurstOpts = { at?: number; rate?: number; out?: AudioNode };

  /** One decaying slice of the shared noise buffer through a swept filter. */
  const noiseBurst = (
    kind: BiquadFilterType,
    freqFrom: number,
    freqTo: number,
    q: number,
    peak: number,
    dur: number,
    opts: BurstOpts = {},
  ): void => {
    const t0 = opts.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = opts.rate ?? 1;
    const f = ctx.createBiquadFilter();
    f.type = kind;
    f.frequency.setValueAtTime(freqFrom, t0);
    if (freqTo !== freqFrom) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(opts.out ?? master);
    src.start(t0, sfxRand() * 1.5);
    src.stop(t0 + dur + 0.05);
  };

  /* ----------------------------- positional layer ----------------------------- */

  const makePanner = (refDistance: number, rolloff: number): PannerNode => {
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = refDistance;
    p.rolloffFactor = rolloff;
    return p;
  };

  /** Move a panner; tiny glide ≈ jump for one-shots, longer for movers. */
  const placePanner = (p: PannerNode, x: number, y: number, z: number, glide: number): void => {
    const t = ctx.currentTime;
    try {
      p.positionX.setTargetAtTime(x, t, glide);
      p.positionY.setTargetAtTime(y, t, glide);
      p.positionZ.setTargetAtTime(z, t, glide);
    } catch {
      p.setPosition(x, y, z); // older WebKit: no position params — jump
    }
  };

  // A small round-robin pool for placed one-shots (thunder, beacon pings) so
  // storms never allocate a panner per strike. Four deep covers thunder tails.
  const pannerPool: PannerNode[] = [];
  let pannerIdx = 0;
  const oneShotPanner = (
    x: number,
    y: number,
    z: number,
    refDistance: number,
    rolloff: number,
    out: AudioNode,
  ): PannerNode | null => {
    try {
      if (pannerPool.length < 4) pannerPool.push(makePanner(refDistance, rolloff));
      const p = pannerPool[pannerIdx % pannerPool.length];
      pannerIdx += 1;
      p.refDistance = refDistance;
      p.rolloffFactor = rolloff;
      p.disconnect();
      p.connect(out);
      placePanner(p, x, y, z, 0.001);
      return p;
    } catch {
      return null;
    }
  };

  // Last listener pose — thunderAt shapes brightness from it even when the
  // panner path fails and the strike falls back to the mono bed.
  let listenerX = 0;
  let listenerZ = 0;

  // The ruin hum starts lazily on the first listener update: no oscillator
  // burns before the camera owner proves the positional layer is in use.
  let ruinHumStarted = false;
  const startRuinHum = (): void => {
    if (ruinHumStarted) return;
    ruinHumStarted = true;
    try {
      // refDistance 3 / rolloff 1.6 ≈ -26 dB at 40 m: barely audible past it.
      const p = makePanner(3, 1.6);
      placePanner(p, RUIN_SITE.x, EAR_HEIGHT, RUIN_SITE.z, 0.001);
      p.connect(weatherBus);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 52;
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = 77.8; // detuned partial — a slow, uneasy beat
      const g = ctx.createGain();
      g.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      o.connect(g);
      o2.connect(g);
      g.connect(p);
      o.start();
      o2.start();
      lfo.start();
    } catch {
      /* no positional audio — the ruin stays silent, nothing else breaks */
    }
  };

  // The stalker growl: one persistent placed loop, gain-gated by Creatures.
  let stalker: { p: PannerNode; g: GainNode } | null = null;
  const ensureStalker = (): { p: PannerNode; g: GainNode } | null => {
    if (stalker) return stalker;
    try {
      const p = makePanner(6, 0.9);
      p.connect(weatherBus);
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 62;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 150;
      f.Q.value = 1.2;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 45; // breathes the filter open and shut
      lfo.connect(lfoGain);
      lfoGain.connect(f.frequency);
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(f);
      f.connect(g);
      g.connect(p);
      o.start();
      lfo.start();
      stalker = { p, g };
    } catch {
      stalker = null;
    }
    return stalker;
  };

  /** Beacon ping scheduler handle; null while the beacon is unplanted. */
  let beaconTimer: number | null = null;

  /** Shared thunder synthesis; `out` picks mono bed vs a placed panner. */
  const thunderCore = (near: number, out: AudioNode): void => {
    // The report trails the flash: far cells arrive later, darker, longer.
    const t0 = ctx.currentTime + (1 - near) * 1.1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.3 + near * 0.25;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(120 + near * 260, t0);
    f.frequency.setTargetAtTime(55, t0 + 0.2, 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16 + near * 0.22, t0 + 0.07);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.7 + near * 1.3);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t0);
    src.stop(t0 + 3.4);
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.value = 42;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t0);
    tg.gain.exponentialRampToValueAtTime(0.04 + near * 0.11, t0 + 0.05);
    tg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
    thump.connect(tg);
    tg.connect(out);
    thump.start(t0);
    thump.stop(t0 + 1);
  };

  let lastStep = 0;

  api = {
    resume: () => {
      if (ctx.state === "suspended") void ctx.resume();
    },
    setMasterVolume: (v) => {
      // 0 must be true silence — the old 0.05 floor made mute impossible.
      const gain = v <= 0 ? 0 : 0.05 + v * 0.35;
      master.gain.setTargetAtTime(gain, ctx.currentTime, 0.05);
    },
    setOutdoor: (v) => {
      windGain.gain.setTargetAtTime(0.25 + v * 0.25, ctx.currentTime, 0.4);
    },
    setTension: (v) => {
      tGain.gain.setTargetAtTime(v * 0.12, ctx.currentTime, 0.3);
      tFilter.frequency.setTargetAtTime(180 + v * 400, ctx.currentTime, 0.4);
    },
    setNearFern: (v) => {
      shimGain.gain.setTargetAtTime(v * 0.06, ctx.currentTime, 0.5);
    },
    setRain: (v) => {
      const t = Math.max(0, Math.min(1, v));
      rainGain.gain.setTargetAtTime(t * 0.45, ctx.currentTime, 0.8);
      // Heavier rain reads brighter and wider, not merely louder.
      rainFilter.frequency.setTargetAtTime(1500 + t * 1700, ctx.currentTime, 0.8);
    },
    setInterior: (v) => {
      // Constants long enough that crossing the hatch swells, never clicks.
      interiorFilter.frequency.setTargetAtTime(v ? 320 : 18000, ctx.currentTime, 0.25);
      weatherBus.gain.setTargetAtTime(v ? 0.35 : 1, ctx.currentTime, 0.25);
      music.setInterior(v); // music sits on master, so it ducks separately
    },
    thunder: (distance01 = 0.5) => {
      thunderCore(Math.max(0, Math.min(1, distance01)), weatherBus);
    },
    thunderAt: (x, z) => {
      if (!ready()) return;
      const range = Math.hypot(listenerX - x, listenerZ - z);
      const near = Math.max(0, Math.min(1, 1 - range / 260));
      // Wide refDistance: the panner steers and softens with range but must
      // not strangle a kilometre-scale sound the way it would a footstep.
      const p = oneShotPanner(x, 30, z, 80, 0.6, weatherBus);
      thunderCore(near, p ?? weatherBus); // mono fallback: same voice, unplaced
    },
    footstep: (run) => {
      const now = ctx.currentTime;
      if (now - lastStep < (run ? 0.22 : 0.36)) return;
      lastStep = now;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = run ? 400 : 280;
      o.type = "triangle";
      o.frequency.value = run ? 90 : 70;
      g.gain.value = run ? 0.08 : 0.05;
      o.connect(f);
      f.connect(g);
      g.connect(master);
      o.start(now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      o.stop(now + 0.09);
    },
    pulseInteract: () => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 660;
      o.type = "sine";
      g.gain.value = 0.12;
      o.connect(g);
      g.connect(master);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      o.stop(ctx.currentTime + 0.26);
    },
    pulseAlert: () => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 180;
      o.type = "square";
      g.gain.value = 0.06;
      o.connect(g);
      g.connect(master);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.stop(ctx.currentTime + 0.42);
    },
    shot: () => {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      // Seeded per-shot detune: no two discharges identical, no Math.random.
      const det = 0.92 + sfxRand() * 0.16;
      // The crack: a bright noise burst swept down through a bandpass.
      noiseBurst("bandpass", 3400 * det, 900, 1.4, 0.2, 0.14, { at: t0, rate: 1.4 });
      // The cell dumping: a square sub-blip falling under it.
      tone("square", 150 * det, 0.1, 0.12, { at: t0, glideTo: 65, filterFreq: 900 });
    },
    dryFire: () => {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      noiseBurst("bandpass", 2600, 2600, 3, 0.06, 0.03, { at: t0 });
      tone("square", 190, 0.04, 0.05, { at: t0, filterFreq: 1200 });
    },
    cellTick: () => {
      if (!ready()) return;
      tone("sine", 880, 0.05, 0.16, { glideTo: 1245 });
    },
    hitConfirm: () => {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      tone("triangle", 340, 0.14, 0.09, { at: t0, glideTo: 190, filterFreq: 1400 });
      noiseBurst("bandpass", 1800, 1400, 2, 0.05, 0.03, { at: t0 });
    },
    killThunk: () => {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      tone("triangle", 180, 0.14, 0.22, { at: t0, glideTo: 90, filterFreq: 700 });
      tone("sine", 58, 0.16, 0.38, { at: t0, glideTo: 40 });
      noiseBurst("lowpass", 420, 160, 0.8, 0.08, 0.12, { at: t0, rate: 0.7 });
    },
    hurt: () => {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      tone("sine", 95, 0.16, 0.2, { at: t0, glideTo: 48 });
      noiseBurst("lowpass", 260, 120, 0.7, 0.1, 0.1, { at: t0, rate: 0.5 });
      // The world goes briefly woolly — the whole mix ducks, then recovers.
      duckFilter.frequency.setTargetAtTime(500, t0, 0.015);
      duckFilter.frequency.setTargetAtTime(18000, t0 + 0.12, 0.2);
      duckGain.gain.setTargetAtTime(0.55, t0, 0.015);
      duckGain.gain.setTargetAtTime(1, t0 + 0.12, 0.2);
    },
    harvestChime: () => {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      tone("sine", 523.25, 0.07, 0.4, { at: t0 }); // C5
      tone("sine", 622.25, 0.07, 0.5, { at: t0 + 0.13 }); // Eb5 — minor third
    },
    sealGroan: () => {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(58, t0);
      o.frequency.exponentialRampToValueAtTime(38, t0 + 1.6);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(320, t0);
      f.frequency.exponentialRampToValueAtTime(110, t0 + 1.6);
      f.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.5);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.9);
      o.connect(f);
      f.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + 2);
    },
    codexFlourish: () => {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      tone("sine", 660, 0.06, 0.18, { at: t0 });
      tone("sine", 880, 0.06, 0.18, { at: t0 + 0.09 });
      tone("sine", 1108, 0.06, 0.26, { at: t0 + 0.18 });
    },
    refusalBuzz: () => {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = 120;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 600;
      const g = ctx.createGain();
      // Flat body with fast edges — a denial, not a note.
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.setTargetAtTime(0.06, t0, 0.008);
      g.gain.setTargetAtTime(0.0001, t0 + 0.16, 0.015);
      o.connect(f);
      f.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + 0.3);
    },
    updateListener: (x, z, yaw) => {
      listenerX = x;
      listenerZ = z;
      // three.js yaw convention: yaw 0 faces -Z, so forward = (-sin, 0, -cos).
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const t = ctx.currentTime;
      const l = ctx.listener;
      try {
        l.positionX.setTargetAtTime(x, t, 0.03);
        l.positionY.setTargetAtTime(EAR_HEIGHT, t, 0.03);
        l.positionZ.setTargetAtTime(z, t, 0.03);
        l.forwardX.setTargetAtTime(fx, t, 0.03);
        l.forwardY.setTargetAtTime(0, t, 0.03);
        l.forwardZ.setTargetAtTime(fz, t, 0.03);
        l.upX.setTargetAtTime(0, t, 0.03);
        l.upY.setTargetAtTime(1, t, 0.03);
        l.upZ.setTargetAtTime(0, t, 0.03);
      } catch {
        l.setPosition(x, EAR_HEIGHT, z); // Firefox: no listener AudioParams
        l.setOrientation(fx, 0, fz, 0, 1, 0);
      }
      startRuinHum();
    },
    setStalkerPos: (pos) => {
      if (pos === null) {
        if (stalker) stalker.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        return;
      }
      const s = ensureStalker();
      if (!s) return;
      placePanner(s.p, pos.x, 0.8, pos.z, 0.15); // low: a thing on four legs
      s.g.gain.setTargetAtTime(0.4, ctx.currentTime, 0.3);
    },
    setBeaconActive: (on) => {
      if (!on) {
        if (beaconTimer !== null) {
          window.clearInterval(beaconTimer);
          beaconTimer = null;
        }
        return;
      }
      if (beaconTimer !== null) return;
      beaconTimer = window.setInterval(() => {
        if (!ready()) return;
        const p = oneShotPanner(BEACON_SITE.x, 3, BEACON_SITE.z, 10, 0.7, weatherBus);
        const t0 = ctx.currentTime;
        tone("sine", 1175, 0.05, 0.3, { at: t0, out: p ?? weatherBus });
        tone("sine", 2350, 0.015, 0.18, { at: t0, out: p ?? weatherBus });
      }, 2600);
    },
    startMusic: () => music.start(),
    stopMusic: () => music.stop(),
    setMusicIntensity: (v) => music.setIntensity(v),
    dispose: () => {
      if (beaconTimer !== null) {
        window.clearInterval(beaconTimer);
        beaconTimer = null;
      }
      musicUnsub?.();
      musicUnsub = null;
      music.dispose();
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
      api = null;
    },
  };
  // The music reads the store directly — phase decides whether it plays, threat
  // decides how thick — so no caller anywhere has to think about it.
  musicUnsub = installMusicDriver(music);
  return api;
}

/* ---------------------------------------------------------------------------
 * Contract conveniences: the wave's combat/site/positional calls, importable
 * directly (`import { shot } from "@/game/audio"`) or via `getAudio().shot()`.
 * Both forms hit the same singleton; before the user's first gesture they all
 * no-op through the suspended-context gate above.
 * ------------------------------------------------------------------------- */

export const shot = (): void => getAudio().shot();
export const dryFire = (): void => getAudio().dryFire();
export const cellTick = (): void => getAudio().cellTick();
export const hitConfirm = (): void => getAudio().hitConfirm();
export const killThunk = (): void => getAudio().killThunk();
export const hurt = (): void => getAudio().hurt();
export const harvestChime = (): void => getAudio().harvestChime();
export const sealGroan = (): void => getAudio().sealGroan();
export const codexFlourish = (): void => getAudio().codexFlourish();
export const refusalBuzz = (): void => getAudio().refusalBuzz();
export const thunderAt = (x: number, z: number): void => getAudio().thunderAt(x, z);
export const setStalkerPos = (pos: { x: number; z: number } | null): void =>
  getAudio().setStalkerPos(pos);
export const updateListener = (x: number, z: number, yaw: number): void =>
  getAudio().updateListener(x, z, yaw);
export const setBeaconActive = (on: boolean): void => getAudio().setBeaconActive(on);
