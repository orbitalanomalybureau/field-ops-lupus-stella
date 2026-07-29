/** Procedural ambience — unlocks on first gesture. */

type AudioApi = {
  resume: () => void;
  setOutdoor: (v: number) => void;
  setTension: (v: number) => void;
  setNearFern: (v: number) => void;
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
  windGain.connect(master);
  noise.start();

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
      master.gain.setTargetAtTime(0.05 + v * 0.35, ctx.currentTime, 0.05);
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
