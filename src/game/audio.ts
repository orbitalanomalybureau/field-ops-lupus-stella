/** Procedural ambience — unlocks on first gesture. */

type AudioApi = {
  resume: () => void;
  setOutdoor: (v: number) => void;
  setTension: (v: number) => void;
  setNearFern: (v: number) => void;
  /** Rain bed level, 0..1 — the weather sim feeds it weatherIntensity. */
  setRain: (v: number) => void;
  /** Dome interior: lowpass + duck the wind/rain/thunder bus. */
  setInterior: (v: boolean) => void;
  /** Thunder one-shot; 1 = overhead (bright, loud, immediate), 0 = far. */
  thunder: (distance01?: number) => void;
  setMasterVolume?: (v: number) => void;
  footstep?: (run?: boolean) => void;
  pulseInteract: () => void;
  pulseAlert: () => void;
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
      setMasterVolume: () => {},
      footstep: () => {},
      pulseInteract: () => {},
      pulseAlert: () => {},
      dispose: () => {},
    };
    return api;
  }

  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);

  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  // Weather bus: wind, rain and thunder share one path so the dome interior
  // can lowpass and duck them together without touching UI pulses or steps.
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
      rainFilter.frequency.setTargetAtTime(
        1500 + t * 1700,
        ctx.currentTime,
        0.8,
      );
    },
    setInterior: (v) => {
      // Constants long enough that crossing the hatch swells, never clicks.
      interiorFilter.frequency.setTargetAtTime(
        v ? 320 : 18000,
        ctx.currentTime,
        0.25,
      );
      weatherBus.gain.setTargetAtTime(v ? 0.35 : 1, ctx.currentTime, 0.25);
    },
    thunder: (distance01 = 0.5) => {
      const near = Math.max(0, Math.min(1, distance01));
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
      g.connect(weatherBus);
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
      tg.connect(weatherBus);
      thump.start(t0);
      thump.stop(t0 + 1);
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
    dispose: () => {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
      api = null;
    },
  };
  return api;
}
