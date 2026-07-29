import { create } from "zustand";
import {
  CHARACTERS,
  DIALOGUES,
  INITIAL_CODEX,
  INITIAL_OBJECTIVES,
  NPCS,
  SPAWNS,
} from "./data";
import type {
  AnimState,
  CharacterId,
  CodexEntry,
  GamePhase,
  InteractPrompt,
  JournalEntry,
  Objective,
  ObjectiveId,
  SpawnPoint,
  SpoilerCeiling,
  WeatherKind,
} from "./types";

const SAVE_KEY = "lupus-fieldops-v4";

type GameStore = {
  phase: GamePhase;
  prevPhase: GamePhase | null;
  characterId: CharacterId | null;
  objectives: Objective[];
  codex: CodexEntry[];
  health: number;
  stamina: number;
  signalMeter: number;
  combatEnabled: boolean;
  scannerActive: boolean;
  scanProgress: number;
  scannedIds: string[];
  cachesLooted: string[];
  npcsTalked: string[];
  ridgeBeaconPlanted: boolean;
  kaguyahimeLogged: boolean;
  domeEntered: boolean;
  discoveries: number;
  messages: string[];
  ruinOpened: boolean;
  playerPos: { x: number; y: number; z: number };
  playerYaw: number;
  playerSpeed: number;
  animState: AnimState;
  trackedByFang: boolean;
  pathSamples: { x: number; z: number; t: number }[];
  interact: InteractPrompt;
  compassBearing: number;
  timeOfDay: number;
  weather: WeatherKind;
  weatherIntensity: number;
  stormSurvived: boolean;
  dialogueNpcId: string | null;
  dialogueNode: string | null;
  embedMode: boolean;
  spoilerCeiling: SpoilerCeiling;
  journal: JournalEntry[];
  photoMode: boolean;
  insideDome: boolean;
  pendingSpawn: SpawnPoint | null;
  reducedMotion: boolean;
  masterVolume: number;
  setPhase: (p: GamePhase) => void;
  togglePause: () => void;
  selectCharacter: (id: CharacterId) => void;
  startMission: () => void;
  completeObjective: (id: ObjectiveId) => void;
  unlockCodex: (id: string) => void;
  pushMessage: (msg: string) => void;
  setHealth: (h: number) => void;
  setStamina: (s: number) => void;
  setSignal: (s: number) => void;
  setCombat: (v: boolean) => void;
  setScanner: (v: boolean) => void;
  setScanProgress: (v: number) => void;
  markScanned: (id: string) => void;
  lootCache: (id: string) => void;
  setPlayerPos: (x: number, y: number, z: number) => void;
  setPlayerYaw: (y: number) => void;
  setPlayerMotion: (speed: number, anim: AnimState) => void;
  samplePath: (x: number, z: number) => void;
  setTracked: (v: boolean) => void;
  setInteract: (p: InteractPrompt) => void;
  setCompass: (b: number) => void;
  setTimeOfDay: (t: number) => void;
  setWeather: (w: WeatherKind, intensity?: number) => void;
  markStormSurvived: () => void;
  plantRidgeBeacon: () => void;
  logKaguyahime: () => void;
  enterDome: () => void;
  exitDome: () => void;
  openDialogue: (npcId: string) => void;
  chooseDialogue: (choiceIndex: number) => void;
  closeDialogue: () => void;
  applyDialogueEffect: (effect?: string) => void;
  openRuin: () => void;
  finishMission: () => void;
  setEmbedMode: (v: boolean) => void;
  setSpoilerCeiling: (c: SpoilerCeiling) => void;
  addJournal: (title: string, body: string) => void;
  openJournal: () => void;
  closeOverlay: () => void;
  togglePhotoMode: () => void;
  setPendingSpawn: (s: SpawnPoint | null) => void;
  consumeSpawn: () => { x: number; z: number; yaw: number } | null;
  applyDeepLink: (params: URLSearchParams) => void;
  exportJournal: () => string;
  setReducedMotion: (v: boolean) => void;
  setMasterVolume: (v: number) => void;
  reset: () => void;
  persist: () => void;
  hydrate: () => void;
  getCharacter: () => (typeof CHARACTERS)[number] | null;
  visibleObjectives: () => Objective[];
  visibleCodex: () => CodexEntry[];
};

function applyEffect(get: () => GameStore, effect?: string) {
  if (!effect) return;
  for (const part of effect.split("|")) {
    if (part.startsWith("codex:")) get().unlockCodex(part.slice(6));
    if (part === "heal") {
      get().setHealth(100);
      get().setStamina(100);
      get().pushMessage("MED — stim administered");
    }
    if (part === "hint:ruins") get().pushMessage("NAV — south Titans marked");
    if (part === "hint:ridge7") get().pushMessage("NAV — Ridge-7 west corridor open");
    if (part === "hint:storm") get().pushMessage("WX — ion cell expected");
    if (part === "hint:coast") get().pushMessage("NAV — south coast memorial marked");
  }
}

export const useGameStore = create<GameStore>((set, get) => ({
  phase: "boot",
  prevPhase: null,
  characterId: null,
  objectives: INITIAL_OBJECTIVES.map((o) => ({ ...o })),
  codex: INITIAL_CODEX.map((c) => ({ ...c })),
  health: 100,
  stamina: 100,
  signalMeter: 0.35,
  combatEnabled: false,
  scannerActive: false,
  scanProgress: 0,
  scannedIds: [],
  cachesLooted: [],
  npcsTalked: [],
  ridgeBeaconPlanted: false,
  kaguyahimeLogged: false,
  domeEntered: false,
  discoveries: 0,
  messages: [],
  ruinOpened: false,
  playerPos: { x: 0, y: 0, z: 40 },
  playerYaw: Math.PI,
  playerSpeed: 0,
  animState: "idle",
  trackedByFang: false,
  pathSamples: [],
  interact: null,
  compassBearing: 0,
  timeOfDay: 0.35,
  weather: "haze",
  weatherIntensity: 0.25,
  stormSurvived: false,
  dialogueNpcId: null,
  dialogueNode: null,
  embedMode: false,
  spoilerCeiling: "book2early",
  journal: [],
  photoMode: false,
  insideDome: false,
  pendingSpawn: null,
  reducedMotion: false,
  masterVolume: 0.7,

  setPhase: (phase) => set({ phase }),
  setEmbedMode: (embedMode) => set({ embedMode }),
  setSpoilerCeiling: (spoilerCeiling) => {
    set({ spoilerCeiling });
    get().pushMessage(
      spoilerCeiling === "book1"
        ? "SPOILER CEILING — BOOK I ONLY"
        : "SPOILER CEILING — BOOK I + EARLY II",
    );
    get().persist();
  },
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setMasterVolume: (masterVolume) => {
    set({ masterVolume: Math.max(0, Math.min(1, masterVolume)) });
    import("./audio").then(({ getAudio }) =>
      getAudio().setMasterVolume?.(get().masterVolume),
    );
  },

  togglePause: () => {
    const { phase, prevPhase } = get();
    if (phase === "paused" || phase === "journal" || phase === "settings") {
      set({ phase: prevPhase ?? "playing", prevPhase: null, photoMode: false });
    } else if (phase === "playing" || phase === "ruins") {
      set({ prevPhase: phase, phase: "paused" });
    } else if (phase === "dialogue") {
      get().closeDialogue();
    } else if (phase === "photo") {
      get().togglePhotoMode();
    }
  },

  selectCharacter: (id) => set({ characterId: id, phase: "briefing" }),

  startMission: () => {
    const spawn = get().consumeSpawn();
    set({
      phase: "playing",
      messages: [
        "FIELD OPS ONLINE — SURVEY MESH LOADED",
        "J journal · P photo · Esc menu · deep recon active",
      ],
      health: 100,
      stamina: 100,
      playerPos: spawn
        ? { x: spawn.x, y: 0, z: spawn.z }
        : { x: 0, y: 0, z: 40 },
      playerYaw: spawn?.yaw ?? Math.PI,
    });
    get().persist();
    if (typeof window !== "undefined") {
      import("./audio").then(({ getAudio }) => {
        getAudio().resume();
        getAudio().setMasterVolume?.(get().masterVolume);
      });
    }
    try {
      window.parent?.postMessage({ type: "fieldops:started" }, "*");
    } catch {
      /* ignore */
    }
  },

  completeObjective: (id) => {
    const was = get().objectives.find((o) => o.id === id);
    if (!was || was.done) return;
    if (was.book2 && get().spoilerCeiling === "book1") return;
    set({
      objectives: get().objectives.map((o) =>
        o.id === id ? { ...o, done: true } : o,
      ),
    });
    get().pushMessage(`OBJECTIVE COMPLETE — ${was.title}`);
    get().addJournal(was.title, was.detail);
    get().persist();
  },

  unlockCodex: (id) => {
    const was = get().codex.find((c) => c.id === id);
    if (!was || was.unlocked) return;
    if (was.book2 && get().spoilerCeiling === "book1") return;
    set({
      codex: get().codex.map((c) =>
        c.id === id ? { ...c, unlocked: true } : c,
      ),
      discoveries: get().discoveries + 1,
    });
    get().pushMessage(`CODEX — ${was.title}`);
    get().addJournal(`Codex: ${was.title}`, was.body.slice(0, 160));
    get().persist();
  },

  pushMessage: (msg) =>
    set((s) => ({ messages: [msg, ...s.messages].slice(0, 10) })),

  setHealth: (health) => set({ health: Math.max(0, Math.min(100, health)) }),
  setStamina: (stamina) =>
    set({ stamina: Math.max(0, Math.min(100, stamina)) }),
  setSignal: (signalMeter) =>
    set({ signalMeter: Math.max(0, Math.min(1, signalMeter)) }),
  setCombat: (combatEnabled) => {
    if (get().combatEnabled === combatEnabled) return;
    set({ combatEnabled });
    get().pushMessage(
      combatEnabled ? "COMBAT STANCE — ARMED" : "SAFE STANCE — WEAPONS LOW",
    );
  },
  setScanner: (scannerActive) => set({ scannerActive }),
  setScanProgress: (scanProgress) =>
    set({ scanProgress: Math.max(0, Math.min(1, scanProgress)) }),

  markScanned: (id) => {
    if (get().scannedIds.includes(id)) return;
    const scannedIds = [...get().scannedIds, id];
    set({ scannedIds });
    if (scannedIds.length >= 3) get().completeObjective("scan");
    get().persist();
  },

  lootCache: (id) => {
    if (get().cachesLooted.includes(id)) return;
    const cachesLooted = [...get().cachesLooted, id];
    set({ cachesLooted });
    get().pushMessage(`CACHE RECOVERED — ${id.toUpperCase()}`);
    get().setHealth(Math.min(100, get().health + 12));
    get().setStamina(100);
    if (cachesLooted.length >= 2) get().completeObjective("caches");
    get().persist();
  },

  setPlayerPos: (x, y, z) => set({ playerPos: { x, y, z } }),
  setPlayerYaw: (playerYaw) => set({ playerYaw }),
  setPlayerMotion: (playerSpeed, animState) => set({ playerSpeed, animState }),

  samplePath: (x, z) => {
    const now = performance.now();
    const samples = [...get().pathSamples, { x, z, t: now }].filter(
      (s) => now - s.t < 45000,
    );
    set({ pathSamples: samples.slice(-48) });
  },

  setTracked: (trackedByFang) => {
    if (trackedByFang && !get().trackedByFang) {
      import("./audio").then(({ getAudio }) => getAudio().pulseAlert());
    }
    set({ trackedByFang });
  },
  setInteract: (interact) => set({ interact }),
  setCompass: (compassBearing) => set({ compassBearing }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),

  setWeather: (weather, intensity = 0.5) => {
    if (get().weather !== weather) {
      if (weather === "storm") get().pushMessage("WX ALERT — ION STORM CELL");
      if (weather === "rain" && get().weather === "storm")
        get().pushMessage("WX — front weakening");
      if (weather === "clear") get().unlockCodex("daycycle");
    }
    set({ weather, weatherIntensity: intensity });
  },

  markStormSurvived: () => {
    if (get().stormSurvived) return;
    set({ stormSurvived: true });
    get().completeObjective("storm");
    get().unlockCodex("weather");
    get().pushMessage("WX — storm cell survived");
  },

  plantRidgeBeacon: () => {
    if (get().ridgeBeaconPlanted) return;
    set({ ridgeBeaconPlanted: true });
    get().completeObjective("ridge7");
    get().unlockCodex("ridge7");
    get().pushMessage("RIDGE-7 — expedition beacon planted");
    get().persist();
  },

  logKaguyahime: () => {
    if (get().kaguyahimeLogged) return;
    if (get().spoilerCeiling === "book1") return;
    set({ kaguyahimeLogged: true });
    get().completeObjective("kaguyahime");
    get().unlockCodex("kaguyahime");
    get().unlockCodex("signal");
    get().pushMessage("COAST — Kaguyahime vector logged");
    get().persist();
  },

  enterDome: () => {
    set({ insideDome: true, domeEntered: true });
    get().completeObjective("dome");
    get().unlockCodex("command-dome");
    get().pushMessage("DOME — ops floor access");
    get().persist();
  },
  exitDome: () => set({ insideDome: false }),

  openDialogue: (npcId) => {
    const npc = NPCS.find((n) => n.id === npcId);
    if (!npc) return;
    if (npc.book2 && get().spoilerCeiling === "book1") {
      get().pushMessage("ACCESS DENIED — spoiler ceiling");
      return;
    }
    const tree = DIALOGUES[npc.dialogueId];
    if (!tree) return;
    const prev =
      get().phase === "dialogue" ? get().prevPhase : get().phase;
    set({
      prevPhase: prev === "dialogue" ? "playing" : prev,
      phase: "dialogue",
      dialogueNpcId: npcId,
      dialogueNode: tree.start,
    });
    if (!get().npcsTalked.includes(npcId)) {
      const npcsTalked = [...get().npcsTalked, npcId];
      set({ npcsTalked });
      if (npcsTalked.filter((id) => id !== "tomas").length >= 3)
        get().completeObjective("npcs");
    }
    if (npcId === "theo" || get().characterId === "theo") {
      get().unlockCodex("ava");
    }
    if (typeof document !== "undefined" && document.pointerLockElement) {
      document.exitPointerLock();
    }
  },

  chooseDialogue: (choiceIndex) => {
    const { dialogueNpcId, dialogueNode } = get();
    if (!dialogueNpcId || !dialogueNode) return;
    const npc = NPCS.find((n) => n.id === dialogueNpcId);
    if (!npc) return;
    const tree = DIALOGUES[npc.dialogueId];
    const node = tree?.nodes[dialogueNode];
    const choice = node?.choices?.[choiceIndex];
    if (!choice) {
      get().closeDialogue();
      return;
    }
    applyEffect(get, choice.effect);
    if (choice.next && tree.nodes[choice.next]) {
      set({ dialogueNode: choice.next });
    } else if (tree.nodes.end) {
      set({ dialogueNode: "end" });
    } else {
      get().closeDialogue();
    }
  },

  closeDialogue: () => {
    set({
      phase: get().prevPhase ?? "playing",
      prevPhase: null,
      dialogueNpcId: null,
      dialogueNode: null,
    });
    get().persist();
  },

  applyDialogueEffect: (effect) => applyEffect(get, effect),

  openRuin: () => {
    set({ ruinOpened: true, phase: "ruins" });
    get().completeObjective("ruins");
    get().unlockCodex("ruins");
    get().pushMessage("CHAMBER SEAL — BREACHED");
    import("./audio").then(({ getAudio }) => getAudio().pulseInteract());
  },

  finishMission: () => {
    get().completeObjective("remember");
    get().unlockCodex("signal");
    set({ phase: "complete" });
    get().pushMessage("LOG SEALED — REMEMBER");
    get().persist();
    try {
      window.parent?.postMessage({ type: "fieldops:complete" }, "*");
    } catch {
      /* ignore */
    }
  },

  addJournal: (title, body) => {
    const { x, z } = get().playerPos;
    const entry: JournalEntry = {
      id: `j-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      t: Date.now(),
      title,
      body,
      x,
      z,
    };
    const journal = [entry, ...get().journal].slice(0, 40);
    set({ journal });
    if (journal.length >= 3) get().completeObjective("journal3");
  },

  openJournal: () => {
    if (get().phase === "playing" || get().phase === "ruins") {
      set({ prevPhase: get().phase, phase: "journal" });
      if (typeof document !== "undefined" && document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
  },

  closeOverlay: () => {
    set({
      phase: get().prevPhase ?? "playing",
      prevPhase: null,
      photoMode: false,
    });
  },

  togglePhotoMode: () => {
    const on = !get().photoMode;
    set({
      photoMode: on,
      phase: on ? "photo" : get().prevPhase ?? "playing",
      prevPhase: on ? get().phase === "photo" ? "playing" : get().phase : null,
    });
    if (on && typeof document !== "undefined" && document.pointerLockElement) {
      document.exitPointerLock();
    }
    get().pushMessage(on ? "PHOTO MODE — UI hidden" : "PHOTO MODE — off");
  },

  setPendingSpawn: (pendingSpawn) => set({ pendingSpawn }),
  consumeSpawn: () => {
    const s = get().pendingSpawn;
    set({ pendingSpawn: null });
    if (!s) return null;
    return SPAWNS[s] ?? null;
  },

  applyDeepLink: (params) => {
    const spoiler = params.get("spoiler");
    if (spoiler === "book1" || spoiler === "book2early") {
      set({ spoilerCeiling: spoiler });
    }
    const spawn = params.get("spawn") as SpawnPoint | null;
    if (spawn && SPAWNS[spawn]) set({ pendingSpawn: spawn });
    const op = params.get("operative") as CharacterId | null;
    if (op && CHARACTERS.some((c) => c.id === op)) {
      set({ characterId: op, phase: "briefing" });
    }
    if (params.get("auto") === "1" && get().characterId) {
      get().startMission();
    }
  },

  exportJournal: () => {
    const s = get();
    const char = s.getCharacter();
    const lines = [
      "FIELD OPS JOURNAL — LUPUS STELLA",
      `Operative: ${char?.name ?? "unknown"}`,
      `Discoveries: ${s.discoveries}`,
      `Objectives: ${s.objectives.filter((o) => o.done).length}/${s.objectives.length}`,
      "",
      ...s.journal.map(
        (j) =>
          `[${new Date(j.t).toISOString()}] ${j.title} @ ${j.x.toFixed(0)},${j.z.toFixed(0)}\n${j.body}`,
      ),
      "",
      "— End of log — The dead do not correct the living.",
    ];
    return lines.join("\n\n");
  },

  reset: () => {
    set({
      phase: "select",
      prevPhase: null,
      characterId: null,
      objectives: INITIAL_OBJECTIVES.map((o) => ({ ...o })),
      codex: INITIAL_CODEX.map((c) => ({ ...c })),
      health: 100,
      stamina: 100,
      signalMeter: 0.35,
      combatEnabled: false,
      scannerActive: false,
      scanProgress: 0,
      scannedIds: [],
      cachesLooted: [],
      npcsTalked: [],
      ridgeBeaconPlanted: false,
      kaguyahimeLogged: false,
      domeEntered: false,
      discoveries: 0,
      messages: [],
      ruinOpened: false,
      playerPos: { x: 0, y: 0, z: 40 },
      playerYaw: Math.PI,
      playerSpeed: 0,
      animState: "idle",
      trackedByFang: false,
      pathSamples: [],
      interact: null,
      weather: "haze",
      weatherIntensity: 0.25,
      stormSurvived: false,
      dialogueNpcId: null,
      dialogueNode: null,
      timeOfDay: 0.35,
      journal: [],
      photoMode: false,
      insideDome: false,
      pendingSpawn: null,
    });
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  },

  persist: () => {
    try {
      const s = get();
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          characterId: s.characterId,
          objectives: s.objectives,
          codex: s.codex,
          scannedIds: s.scannedIds,
          cachesLooted: s.cachesLooted,
          npcsTalked: s.npcsTalked,
          ridgeBeaconPlanted: s.ridgeBeaconPlanted,
          kaguyahimeLogged: s.kaguyahimeLogged,
          domeEntered: s.domeEntered,
          discoveries: s.discoveries,
          health: s.health,
          stormSurvived: s.stormSurvived,
          spoilerCeiling: s.spoilerCeiling,
          journal: s.journal,
          masterVolume: s.masterVolume,
        }),
      );
    } catch {
      /* ignore */
    }
  },

  hydrate: () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<GameStore>;
      set({
        characterId: data.characterId ?? null,
        objectives: data.objectives ?? get().objectives,
        codex: data.codex ?? get().codex,
        scannedIds: data.scannedIds ?? [],
        cachesLooted: data.cachesLooted ?? [],
        npcsTalked: data.npcsTalked ?? [],
        ridgeBeaconPlanted: data.ridgeBeaconPlanted ?? false,
        kaguyahimeLogged: data.kaguyahimeLogged ?? false,
        domeEntered: data.domeEntered ?? false,
        discoveries: data.discoveries ?? 0,
        health: data.health ?? 100,
        stormSurvived: data.stormSurvived ?? false,
        spoilerCeiling: data.spoilerCeiling ?? "book2early",
        journal: data.journal ?? [],
        masterVolume: data.masterVolume ?? 0.7,
      });
    } catch {
      /* ignore */
    }
  },

  getCharacter: () => {
    const id = get().characterId;
    return CHARACTERS.find((c) => c.id === id) ?? null;
  },

  visibleObjectives: () => {
    const ceil = get().spoilerCeiling;
    return get().objectives.filter((o) => !o.book2 || ceil !== "book1");
  },

  visibleCodex: () => {
    const ceil = get().spoilerCeiling;
    return get().codex.filter((c) => !c.book2 || ceil !== "book1");
  },
}));
