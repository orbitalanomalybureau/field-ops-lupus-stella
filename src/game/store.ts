import { create } from "zustand";
import {
  CHAPTER_SCENES,
  CHARACTERS,
  DIALOGUES,
  INITIAL_CODEX,
  INITIAL_OBJECTIVES,
  MARKERS,
  NPCS,
  SPAWNS,
} from "./data";
import { postToParent } from "@/lib/embed";
import { passesCeiling, visibleObjectivesOf } from "./selectors";
import { getAudio } from "./audio";
import { detectTier, isQualityTier, lowerTier } from "./quality";
import type { QualityTier } from "./quality";
import type {
  AnimState,
  CharacterDef,
  CharacterId,
  CodexEntry,
  DialogueChoice,
  Ending,
  GamePhase,
  InteractPrompt,
  ItemId,
  JournalEntry,
  Objective,
  ObjectiveId,
  SpawnPoint,
  SpoilerCeiling,
  UpgradeKey,
  WeatherKind,
  WorldMarker,
} from "./types";

const SAVE_KEY = "lupus-fieldops-v4";

/** Bumped when the blob shape changes. Older blobs still load, best-effort. */
export const SAVE_VERSION = 6;

/** Keys from abandoned save schemas, swept on boot so they stop rotting. */
const LEGACY_SAVE_KEYS = [
  "lupus-fieldops-v1",
  "lupus-fieldops-v2",
  "lupus-fieldops-v3",
];

const AUTOSAVE_MS = 30000;

/** The three staff the "npcs" objective names out loud. */
const REQUIRED_NPCS = ["thornhill", "castillo", "voss"];

const CACHE_MARKERS = MARKERS.filter((m) => m.kind === "cache");

/** Dialogue hints that drop a real navigation pip, keyed to data.ts markers. */
const HINT_MARKERS: Record<string, string> = {
  "hint:ruins": "ruin",
  "hint:ridge7": "ridge7",
  "hint:coast": "coast",
};

/**
 * Scans that unlock tasking. Reading the lattice node is the second route to
 * the ruin, for players who never ask Thornhill what pulls on it.
 */
const SCAN_REVEALS: Record<string, ObjectiveId> = {
  "scan-grid": "ruins",
};

/** Where FURTHER READING points. Overridable per deploy (staging, UTM hosts). */
const NOVEL_SITE_URL =
  (import.meta.env?.VITE_NOVEL_SITE_URL as string | undefined) ??
  "https://exodus2121.com";

const ITEM_IDS: readonly ItemId[] = [
  "fern-spore",
  "fang-quill",
  "prism-shard",
  "collar-component",
];

function isItemId(v: string): v is ItemId {
  return (ITEM_IDS as readonly string[]).includes(v);
}

/** Ticker line for the moment an item lands in the pack. */
const ITEM_PICKUP: Record<ItemId, string> = {
  "fern-spore": "SPECIMEN — fern spore vial sealed",
  "fang-quill": "SPECIMEN — fang quill secured",
  "prism-shard": "SPECIMEN — prism shard cased",
  "collar-component": "SALVAGE — collar component recovered",
};

/** Plain names for ledger lines when a trade consumes stock. */
const ITEM_NAMES: Record<ItemId, string> = {
  "fern-spore": "fern spore",
  "fang-quill": "fang quill",
  "prism-shard": "prism shard",
  "collar-component": "collar component",
};

const UPGRADE_KEYS: readonly UpgradeKey[] = [
  "scan",
  "stamina",
  "combat",
  "stealth",
];

function isUpgradeKey(v: string): v is UpgradeKey {
  return (UPGRADE_KEYS as readonly string[]).includes(v);
}

/** What the field-mod ticker calls each upgrade track. */
const UPGRADE_LABELS: Record<UpgradeKey, string> = {
  scan: "scanner suite",
  stamina: "endurance rig",
  combat: "combat rig",
  stealth: "field craft",
};

/**
 * What a completed scan physically yields — the economy's inputs, keyed by
 * SCAN_TARGETS id. InteractionSystem calls harvestScan alongside markScanned.
 * Ferns carry charged spores only while the lattice pulse is up, so the fern
 * harvest and the boosted-predator window are the same hours on purpose.
 */
const HARVEST_RULES: Record<string, { item: ItemId; nightOnly?: boolean }> = {
  "scan-fern": { item: "fern-spore", nightOnly: true },
  "scan-herd": { item: "prism-shard" },
  "scan-collar": { item: "collar-component" },
};

/** The game's one definition of night — the window Creatures.tsx hunts in. */
function isNight(timeOfDay: number): boolean {
  return timeOfDay < 0.25 || timeOfDay > 0.78;
}

function emptyInventory(): Record<ItemId, number> {
  return {
    "fern-spore": 0,
    "fang-quill": 0,
    "prism-shard": 0,
    "collar-component": 0,
  };
}

function emptyUpgrades(): Record<UpgradeKey, number> {
  return { scan: 0, stamina: 0, combat: 0, stealth: 0 };
}

/**
 * What a predator knows across reloads — "the planet remembers you". The
 * learnedBias intercept point is a ground position, so y is omitted; `tracked`
 * is the seconds of route data behind it (>45 s arms the night ambush).
 */
export type CreatureRecord = {
  id: string;
  bx: number;
  bz: number;
  tracked: number;
  health: number;
};

type SaveBlob = {
  version?: number;
  updatedAt?: number;
  characterId?: CharacterId | null;
  objectives?: Objective[];
  revealedObjectives?: ObjectiveId[];
  codex?: CodexEntry[];
  scannedIds?: string[];
  cachesLooted?: string[];
  npcsTalked?: string[];
  dynamicMarkers?: WorldMarker[];
  ridgeBeaconPlanted?: boolean;
  kaguyahimeLogged?: boolean;
  domeEntered?: boolean;
  ruinOpened?: boolean;
  ruinSealed?: boolean;
  packsAggroed?: boolean;
  fangQuills?: number;
  fangKills?: number;
  creatureMemory?: CreatureRecord[];
  inventory?: Partial<Record<ItemId, number>>;
  upgrades?: Partial<Record<UpgradeKey, number>>;
  flags?: Record<string, boolean>;
  codexStage?: Record<string, number>;
  ending?: Ending | null;
  discoveries?: number;
  health?: number;
  stamina?: number;
  stormSurvived?: boolean;
  spoilerCeiling?: SpoilerCeiling;
  journal?: JournalEntry[];
  masterVolume?: number;
  reducedMotion?: boolean;
  presenceEnabled?: boolean;
  quality?: QualityTier;
  qualityAuto?: boolean;
  playerPos?: { x: number; y: number; z: number };
  playerYaw?: number;
  timeOfDay?: number;
  weather?: WeatherKind;
  weatherIntensity?: number;
};

type GameStore = {
  phase: GamePhase;
  prevPhase: GamePhase | null;
  characterId: CharacterId | null;
  objectives: Objective[];
  revealedObjectives: ObjectiveId[];
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
  ruinSealed: boolean;
  /** Set by the Broadcast ending: every pack hunts the operative from then
   * on, stealth radii ignored. Consumed by Creatures.tsx; persisted. */
  packsAggroed: boolean;
  /** Lifetime quill count for stats; the spendable copy lives in inventory. */
  fangQuills: number;
  fangKills: number;
  /** Per-predator learnedBias/health snapshots, written by Creatures.tsx. */
  creatureMemory: CreatureRecord[];
  /** Field-harvest counts — the economy Voss and Berger trade against. */
  inventory: Record<ItemId, number>;
  /** Permanent additive field mods, folded into getCharacter(). */
  upgrades: { scan: number; stamina: number; combat: number; stealth: number };
  /** Story memory: dialogue once-gates, setFlag verbs, world triggers. */
  flags: Record<string, boolean>;
  /** Highest stage reached per codex id; absent means stage 0 (base body). */
  codexStage: Record<string, number>;
  ending: Ending | null;
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
  /** One-shot arrival line staged by a ?chapter deep link; shown on deploy. */
  pendingDeployNote: string | null;
  dynamicMarkers: WorldMarker[];
  hasSave: boolean;
  reducedMotion: boolean;
  /**
   * Survey-mesh presence opt-in (persisted, default true). When false the
   * multiplayer layer must neither join a room nor transmit — the ghosts
   * system reads this before touching the network. Off is total.
   */
  presenceEnabled: boolean;
  /**
   * Graphics tier. A device preference, persisted with the save blob and read
   * by GameCanvas (dpr, shadows, far plane), PostFX (which passes run) and by
   * the terrain, vegetation and weather systems via `QUALITY[quality]`.
   */
  quality: QualityTier;
  /**
   * True while the tier is engine-chosen — seeded by `detectTier()` and open to
   * one measured demotion. Set false the moment the player picks a tier, which
   * makes their choice final.
   */
  qualityAuto: boolean;
  masterVolume: number;
  setPhase: (p: GamePhase) => void;
  togglePause: () => void;
  selectCharacter: (id: CharacterId) => void;
  startMission: () => void;
  resumeMission: () => void;
  completeObjective: (id: ObjectiveId) => void;
  revealObjective: (id: ObjectiveId) => void;
  isObjectiveAvailable: (id: ObjectiveId) => boolean;
  /** Unlocks at `stage` (default 0), or advances an already-unlocked entry to
   * a higher stage; either transition posts fieldops:discovery to the host. */
  unlockCodex: (id: string, stage?: number) => void;
  pushMessage: (msg: string) => void;
  setHealth: (h: number) => void;
  setStamina: (s: number) => void;
  setSignal: (s: number) => void;
  setCombat: (v: boolean) => void;
  recordFangKill: () => void;
  recordFangQuill: () => void;
  grantItem: (id: ItemId, n?: number) => void;
  /** Removes up to `n`; stock floors at 0. The "take:" effect verb. */
  takeItem: (id: ItemId, n?: number) => void;
  /** Permanent bump on one upgrade track. The "upgrade:" effect verb. */
  applyUpgrade: (key: UpgradeKey, amount: number) => void;
  /** Sets a story flag true. The "flag:" verb and choice setFlag/once gates. */
  raiseFlag: (name: string) => void;
  /** Applies HARVEST_RULES for a completed scan; safe to call with any id. */
  harvestScan: (targetId: string) => void;
  /** High-cadence caller: sets state only; autosave flushes it to the blob. */
  saveCreatureMemory: (records: CreatureRecord[]) => void;
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
  /** The current node's choices that pass their gates. `index` is the
   * ORIGINAL index into node.choices — what chooseDialogue still takes. */
  visibleChoices: () => { label: string; index: number }[];
  closeDialogue: () => void;
  applyDialogueEffect: (effect?: string) => void;
  addDynamicMarker: (marker: WorldMarker) => void;
  openRuin: () => void;
  finishMission: () => void;
  broadcastSignal: () => void;
  setEmbedMode: (v: boolean) => void;
  setSpoilerCeiling: (c: SpoilerCeiling) => void;
  /** `authored` marks a note the operative wrote by hand; only those count
   * toward the journal3 objective. */
  addJournal: (title: string, body: string, authored?: boolean) => void;
  openJournal: () => void;
  closeOverlay: () => void;
  togglePhotoMode: () => void;
  setPendingSpawn: (s: SpawnPoint | null) => void;
  consumeSpawn: () => { x: number; z: number; yaw: number } | null;
  applyDeepLink: (params: URLSearchParams) => void;
  exportJournal: () => string;
  setReducedMotion: (v: boolean) => void;
  setPresenceEnabled: (v: boolean) => void;
  setQuality: (tier: QualityTier | "auto") => void;
  autoTuneQuality: () => void;
  initPreferences: () => void;
  setMasterVolume: (v: number) => void;
  reset: () => void;
  persist: () => void;
  startAutosave: () => () => void;
  hydrate: () => void;
  getCharacter: () => (typeof CHARACTERS)[number] | null;
  visibleObjectives: () => Objective[];
  visibleCodex: () => CodexEntry[];
};

function ceilingFilter<T extends { book2?: boolean }>(
  items: T[],
  ceiling: SpoilerCeiling,
): T[] {
  return items.filter((i) => passesCeiling(i, ceiling));
}

/** Objective text names three sites; the forest holds two of the four drops. */
function cachesRequired(ceiling: SpoilerCeiling): number {
  return Math.max(1, ceilingFilter(CACHE_MARKERS, ceiling).length - 1);
}

function readSave(): SaveBlob | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SaveBlob) : null;
  } catch {
    return null;
  }
}

/**
 * Saves store progress flags only; prose and spoiler tiers always come from
 * data.ts, so new or reworded content reaches players who already have a save.
 */
function mergeObjectives(saved?: Objective[]): Objective[] {
  const done = new Map(
    (saved ?? []).map((o) => [o.id, Boolean(o.done)] as const),
  );
  return INITIAL_OBJECTIVES.map((o) => ({
    ...o,
    done: done.get(o.id) ?? o.done,
  }));
}

/**
 * Reveals are progress, not content. Saves written before the quest graph
 * existed have no list, so anything already done — or whose prerequisites are
 * all done — is treated as revealed rather than yanked out of the log. Hidden
 * objectives with no prerequisites stay hidden: only a dialogue or a scan
 * opens those.
 */
function mergeReveals(
  objectives: Objective[],
  saved?: ObjectiveId[],
): ObjectiveId[] {
  const known = new Set(objectives.map((o) => o.id));
  const revealed = new Set((saved ?? []).filter((id) => known.has(id)));
  const isDone = (id: ObjectiveId) =>
    objectives.some((o) => o.id === id && o.done);
  for (const o of objectives) {
    if (!o.hidden) continue;
    if (o.done || (o.requires?.length && o.requires.every(isDone))) {
      revealed.add(o.id);
    }
  }
  return Array.from(revealed);
}

function mergeCodex(saved?: CodexEntry[]): CodexEntry[] {
  const unlocked = new Map(
    (saved ?? []).map((c) => [c.id, Boolean(c.unlocked)] as const),
  );
  return INITIAL_CODEX.map((c) => ({
    ...c,
    unlocked: unlocked.get(c.id) ?? c.unlocked,
  }));
}

function mergeInventory(
  saved?: Partial<Record<ItemId, number>>,
): Record<ItemId, number> {
  const inventory = emptyInventory();
  for (const id of ITEM_IDS) {
    const v = saved?.[id];
    if (typeof v === "number" && Number.isFinite(v)) {
      inventory[id] = Math.max(0, Math.floor(v));
    }
  }
  return inventory;
}

function mergeUpgrades(
  saved?: Partial<Record<UpgradeKey, number>>,
): Record<UpgradeKey, number> {
  const upgrades = emptyUpgrades();
  for (const key of UPGRADE_KEYS) {
    const v = saved?.[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      upgrades[key] = Math.max(0, v);
    }
  }
  return upgrades;
}

function mergeFlags(
  saved?: Record<string, boolean>,
  characterId?: CharacterId | null,
): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const [name, v] of Object.entries(saved ?? {})) {
    if (v === true) flags[name] = true;
  }
  // Command access derives from the operative, not from history — a save
  // written before the flag existed still gets its command branches.
  if ((CHARACTERS.find((c) => c.id === characterId)?.commandBonus ?? 1) > 1) {
    flags["cmd-access"] = true;
  }
  return flags;
}

/**
 * Stage progress is merged against data.ts content like everything else:
 * unknown ids drop, and a stage clamps to the stages the entry has today, so
 * a save from a build with deeper entries never points past the end.
 */
function mergeCodexStage(
  saved?: Record<string, number>,
): Record<string, number> {
  const codexStage: Record<string, number> = {};
  for (const entry of INITIAL_CODEX) {
    const v = saved?.[entry.id];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const max = entry.stages?.length ?? 0;
    const stage = Math.max(0, Math.min(max, Math.floor(v)));
    if (stage > 0) codexStage[entry.id] = stage;
  }
  return codexStage;
}

/**
 * Dialogue-choice gate: "flagName" | "!flagName" | "item:<ItemId>>=<n>".
 * Malformed conditions fail closed — a typo hides a choice rather than
 * exposing a gated one.
 */
function passesCondition(s: GameStore, cond: string): boolean {
  const item = /^item:([a-z-]+)>=(\d+)$/.exec(cond);
  if (item) {
    const id = item[1];
    if (!isItemId(id)) return false;
    return s.inventory[id] >= Number.parseInt(item[2], 10);
  }
  if (cond.startsWith("item:")) return false;
  if (cond.startsWith("!")) return !s.flags[cond.slice(1)];
  return Boolean(s.flags[cond]);
}

/** True when the choice may be listed — and taken; both paths share this. */
function choiceVisible(s: GameStore, choice: DialogueChoice): boolean {
  if (choice.once && s.flags[choice.once]) return false;
  if (choice.if && !passesCondition(s, choice.if)) return false;
  return true;
}

/**
 * getCharacter() folds upgrades into a clone of the CHARACTERS entry. The
 * clone is cached against the (characterId, upgrades) pair because HUD and
 * PlayerController select `s.getCharacter()` — a fresh object per call would
 * re-render them on every store write, including per-frame position updates.
 */
let characterCache: {
  id: CharacterId;
  upgrades: Record<UpgradeKey, number>;
  value: CharacterDef;
} | null = null;

function beginPlay(get: () => GameStore) {
  get().persist();
  if (typeof window !== "undefined") {
    getAudio().resume();
    getAudio().setMasterVolume?.(get().masterVolume);
  }
  postToParent({ type: "fieldops:started", operative: get().characterId });
}

/**
 * Dialogue effect verbs, "|"-separated:
 *   codex:<id>[:<stage>]      unlock, or advance to a codex stage
 *   reveal:<objectiveId>      open hidden tasking
 *   heal                      full vitals
 *   hint:<site>               drop a nav marker
 *   give:<ItemId>:<n>         add to inventory
 *   take:<ItemId>:<n>         remove from inventory, floored at 0
 *   upgrade:<track>:<amount>  permanent field mod (scan|stamina|combat|stealth)
 *   flag:<name>               raise a story flag
 */
function applyEffect(get: () => GameStore, effect?: string) {
  if (!effect) return;
  for (const part of effect.split("|")) {
    const seg = part.split(":");
    if (seg[0] === "codex" && seg.length > 1) {
      get().unlockCodex(
        seg[1],
        seg.length > 2 ? Number.parseInt(seg[2], 10) : undefined,
      );
    }
    if (part.startsWith("reveal:")) {
      get().revealObjective(part.slice(7) as ObjectiveId);
    }
    if ((seg[0] === "give" || seg[0] === "take") && seg.length > 1) {
      const id = seg[1];
      const n = seg.length > 2 ? Number.parseInt(seg[2], 10) : 1;
      if (isItemId(id) && Number.isInteger(n) && n > 0) {
        if (seg[0] === "give") get().grantItem(id, n);
        else get().takeItem(id, n);
      }
    }
    if (seg[0] === "upgrade" && seg.length > 2) {
      const key = seg[1];
      const amount = Number.parseFloat(seg[2]);
      if (isUpgradeKey(key) && Number.isFinite(amount) && amount > 0) {
        get().applyUpgrade(key, amount);
      }
    }
    if (seg[0] === "flag" && seg.length > 1 && seg[1]) {
      get().raiseFlag(seg[1]);
    }
    if (part === "heal") {
      get().setHealth(100);
      get().setStamina(100);
      get().pushMessage("MED — stim administered");
    }
    const markerId = HINT_MARKERS[part];
    if (markerId) {
      const marker = MARKERS.find((m) => m.id === markerId);
      if (marker) get().addDynamicMarker(marker);
    }
    if (part === "hint:ruins") get().pushMessage("NAV — south Titans marked");
    if (part === "hint:ridge7")
      get().pushMessage("NAV — Ridge-7 west corridor open");
    if (part === "hint:storm") get().pushMessage("WX — ion cell expected");
    if (part === "hint:coast")
      get().pushMessage("NAV — south coast memorial marked");
  }
}

export const useGameStore = create<GameStore>((set, get) => ({
  phase: "boot",
  prevPhase: null,
  characterId: null,
  objectives: INITIAL_OBJECTIVES.map((o) => ({ ...o })),
  revealedObjectives: [],
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
  ruinSealed: false,
  packsAggroed: false,
  fangQuills: 0,
  fangKills: 0,
  creatureMemory: [],
  inventory: emptyInventory(),
  upgrades: emptyUpgrades(),
  flags: {},
  codexStage: {},
  ending: null,
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
  spoilerCeiling: "book1",
  journal: [],
  photoMode: false,
  insideDome: false,
  pendingSpawn: null,
  pendingDeployNote: null,
  dynamicMarkers: [],
  hasSave: false,
  reducedMotion: false,
  presenceEnabled: true,
  // Static rather than `detectTier()` so the module has the same value on the
  // server and on the first client render; initPreferences seeds the real one.
  quality: "medium",
  qualityAuto: true,
  masterVolume: 0.7,

  setPhase: (phase) => set({ phase }),
  setEmbedMode: (embedMode) => set({ embedMode }),
  setSpoilerCeiling: (spoilerCeiling) => {
    set({
      spoilerCeiling,
      dynamicMarkers: ceilingFilter(get().dynamicMarkers, spoilerCeiling),
    });
    get().pushMessage(
      spoilerCeiling === "book1"
        ? "SPOILER CEILING — BOOK I ONLY"
        : "SPOILER CEILING — BOOK I + EARLY II",
    );
    get().persist();
  },
  setReducedMotion: (reducedMotion) => {
    set({ reducedMotion });
    get().persist();
  },

  setPresenceEnabled: (presenceEnabled) => {
    if (get().presenceEnabled === presenceEnabled) return;
    set({ presenceEnabled });
    get().pushMessage(
      presenceEnabled
        ? "SURVEY MESH — peer ghosts visible"
        : "SURVEY MESH — running dark",
    );
    get().persist();
  },

  setQuality: (tier) => {
    // "auto" re-derives from hardware hints and hands the tier back to the
    // engine; anything else is the player's word and the auto-tuner stops.
    const quality = tier === "auto" ? detectTier() : tier;
    set({ quality, qualityAuto: tier === "auto" });
    get().persist();
  },

  /**
   * One quiet step down, for the frametime sampler only. Never raises: a player
   * who chose a tier keeps it, and quality that oscillates is worse than
   * quality that is simply low.
   */
  autoTuneQuality: () => {
    if (!get().qualityAuto) return;
    const next = lowerTier(get().quality);
    if (!next) return;
    set({ quality: next });
    get().pushMessage("OPTICS — reducing survey fidelity");
    get().persist();
  },

  initPreferences: () => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const saved = readSave();
    if (typeof saved?.reducedMotion !== "boolean") {
      set({
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
      });
    }
    if (!isQualityTier(saved?.quality)) {
      set({ quality: detectTier(), qualityAuto: true });
    }
  },
  setMasterVolume: (masterVolume) => {
    set({ masterVolume: Math.max(0, Math.min(1, masterVolume)) });
    getAudio().setMasterVolume?.(get().masterVolume);
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

  selectCharacter: (id) => {
    // Command authority is a dialogue key, not just a stat: staff branches
    // gate on this flag, and it belongs to whoever carries command rank.
    // Derived from the roster rather than hardcoding "theo" so a future
    // command-tier operative inherits the access.
    const cmd = (CHARACTERS.find((c) => c.id === id)?.commandBonus ?? 1) > 1;
    set({
      characterId: id,
      phase: "briefing",
      flags: { ...get().flags, "cmd-access": cmd },
    });
  },

  startMission: () => {
    const spawn = get().consumeSpawn();
    const note = get().pendingDeployNote;
    set({
      phase: "playing",
      pendingDeployNote: null,
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
    // Pushed after the boilerplate so a chapter link's arrival line is the
    // newest ticker entry — the toast the reader deployed for.
    if (note) get().pushMessage(note);
    beginPlay(get);
  },

  resumeMission: () => {
    set({
      phase: "playing",
      messages: [
        "FIELD OPS ONLINE — FIELD LOG RESTORED",
        "J journal · P photo · Esc menu · position held",
      ],
    });
    beginPlay(get);
  },

  completeObjective: (id) => {
    const was = get().objectives.find((o) => o.id === id);
    if (!was || was.done) return;
    if (was.book2 && get().spoilerCeiling === "book1") return;
    if (!get().isObjectiveAvailable(id)) return;
    set({
      objectives: get().objectives.map((o) =>
        o.id === id ? { ...o, done: true } : o,
      ),
    });
    get().pushMessage(`OBJECTIVE COMPLETE — ${was.title}`);
    get().addJournal(was.title, was.detail);
    const isDone = (oid: ObjectiveId) =>
      get().objectives.some((o) => o.id === oid && o.done);
    for (const dep of get().objectives) {
      const reqs = dep.requires;
      if (!dep.hidden || !reqs?.includes(id)) continue;
      if (reqs.every(isDone)) get().revealObjective(dep.id);
    }
    get().persist();
  },

  revealObjective: (id) => {
    const obj = get().objectives.find((o) => o.id === id);
    if (!obj) return;
    if (obj.book2 && get().spoilerCeiling === "book1") return;
    if (get().revealedObjectives.includes(id)) return;
    set({ revealedObjectives: [...get().revealedObjectives, id] });
    get().pushMessage(obj.tasking ?? `TASKING — ${obj.title}`);
    get().addJournal(`Tasking: ${obj.title}`, obj.detail);
    get().persist();
  },

  isObjectiveAvailable: (id) => {
    const obj = get().objectives.find((o) => o.id === id);
    if (!obj) return false;
    if (obj.hidden && !get().revealedObjectives.includes(id)) return false;
    return (obj.requires ?? []).every((req) =>
      get().objectives.some((o) => o.id === req && o.done),
    );
  },

  unlockCodex: (id, stage) => {
    const was = get().codex.find((c) => c.id === id);
    if (!was) return;
    if (was.book2 && get().spoilerCeiling === "book1") return;
    const target = Math.max(
      0,
      Math.min(was.stages?.length ?? 0, Math.floor(stage ?? 0)),
    );
    const current = get().codexStage[id] ?? 0;
    if (!was.unlocked) {
      set({
        codex: get().codex.map((c) =>
          c.id === id ? { ...c, unlocked: true } : c,
        ),
        discoveries: get().discoveries + 1,
        codexStage:
          target > 0 ? { ...get().codexStage, [id]: target } : get().codexStage,
      });
      get().pushMessage(`CODEX — ${was.title}`);
      get().addJournal(`Codex: ${was.title}`, was.body.slice(0, 160));
    } else if (target > current) {
      // Knowledge deepens: same entry, new stratum. Stage n reads stages[n-1].
      set({ codexStage: { ...get().codexStage, [id]: target } });
      get().pushMessage(`CODEX UPDATED — ${was.title}`);
      const stageBody = was.stages?.[target - 1]?.body ?? was.body;
      get().addJournal(`Codex update: ${was.title}`, stageBody.slice(0, 160));
    } else {
      return; // nothing new — no bridge message, no write
    }
    const chapter = was.chapterRef?.chapter;
    postToParent(
      chapter === undefined
        ? { type: "fieldops:discovery", id, title: was.title }
        : { type: "fieldops:discovery", id, title: was.title, chapter },
    );
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

  recordFangKill: () => {
    set({ fangKills: get().fangKills + 1 });
    get().pushMessage("CONTACT DOWN — shadowfang neutralized");
    get().persist();
  },

  recordFangQuill: () => {
    // The stat counter predates the economy; both move together so lifetime
    // stats stay honest while the inventory copy gets spent on upgrades.
    set({ fangQuills: get().fangQuills + 1 });
    get().grantItem("fang-quill");
  },

  grantItem: (id, n = 1) => {
    if (!Number.isFinite(n) || n <= 0) return;
    set({ inventory: { ...get().inventory, [id]: get().inventory[id] + n } });
    get().pushMessage(n > 1 ? `${ITEM_PICKUP[id]} ×${n}` : ITEM_PICKUP[id]);
    get().persist();
  },

  takeItem: (id, n = 1) => {
    if (!Number.isFinite(n) || n <= 0) return;
    const spent = Math.min(get().inventory[id], n);
    if (spent <= 0) return;
    set({
      inventory: { ...get().inventory, [id]: get().inventory[id] - spent },
    });
    get().pushMessage(`LEDGER — ${ITEM_NAMES[id]} ×${spent} expended`);
    get().persist();
  },

  applyUpgrade: (key, amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    set({
      upgrades: { ...get().upgrades, [key]: get().upgrades[key] + amount },
    });
    get().pushMessage(`FIELD MOD — ${UPGRADE_LABELS[key]} +${amount}`);
    get().persist();
  },

  raiseFlag: (name) => {
    if (!name || get().flags[name]) return;
    set({ flags: { ...get().flags, [name]: true } });
    get().persist();
  },

  saveCreatureMemory: (creatureMemory) => set({ creatureMemory }),

  setScanner: (scannerActive) => set({ scannerActive }),
  setScanProgress: (scanProgress) =>
    set({ scanProgress: Math.max(0, Math.min(1, scanProgress)) }),

  markScanned: (id) => {
    if (get().scannedIds.includes(id)) return;
    const scannedIds = [...get().scannedIds, id];
    set({ scannedIds });
    const reveal = SCAN_REVEALS[id];
    if (reveal) get().revealObjective(reveal);
    if (scannedIds.length >= 3) get().completeObjective("scan");
    get().persist();
  },

  harvestScan: (targetId) => {
    const rule = HARVEST_RULES[targetId];
    if (!rule) return;
    if (rule.nightOnly && !isNight(get().timeOfDay)) {
      get().pushMessage("SPECIMEN — spores inert by day; sample after dark");
      return;
    }
    get().grantItem(rule.item);
  },

  lootCache: (id) => {
    if (get().cachesLooted.includes(id)) return;
    const cachesLooted = [...get().cachesLooted, id];
    set({ cachesLooted });
    get().pushMessage(`CACHE RECOVERED — ${id.toUpperCase()}`);
    get().setHealth(Math.min(100, get().health + 12));
    get().setStamina(100);
    if (cachesLooted.length >= cachesRequired(get().spoilerCeiling))
      get().completeObjective("caches");
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
      getAudio().pulseAlert();
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
    // Voss's clearance is the authorization; without it the beacon stays in
    // the pack and the interaction remains available for a later trip.
    if (!get().isObjectiveAvailable("ridge7")) {
      get().pushMessage("GATE CONTROL — no waiver on file for Ridge-7");
      return;
    }
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
      if (REQUIRED_NPCS.every((id) => npcsTalked.includes(id)))
        get().completeObjective("npcs");
    }
    if (get().characterId === "theo") get().unlockCodex("ava");
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
    // Gated choices are not merely unlisted — an index call cannot take them.
    if (!choiceVisible(get(), choice)) return;
    if (choice.once) get().raiseFlag(choice.once);
    if (choice.setFlag) get().raiseFlag(choice.setFlag);
    applyEffect(get, choice.effect);
    if (choice.next && tree.nodes[choice.next]) {
      set({ dialogueNode: choice.next });
    } else if (tree.nodes.end) {
      set({ dialogueNode: "end" });
    } else {
      get().closeDialogue();
    }
  },

  visibleChoices: () => {
    const s = get();
    const { dialogueNpcId, dialogueNode } = s;
    if (!dialogueNpcId || !dialogueNode) return [];
    const npc = NPCS.find((n) => n.id === dialogueNpcId);
    if (!npc) return [];
    const choices = DIALOGUES[npc.dialogueId]?.nodes[dialogueNode]?.choices;
    if (!choices) return [];
    return choices
      .map((choice, index) => ({ choice, index }))
      .filter(({ choice }) => choiceVisible(s, choice))
      .map(({ choice, index }) => ({ label: choice.label, index }));
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

  addDynamicMarker: (marker) => {
    if (marker.book2 && get().spoilerCeiling === "book1") return;
    if (get().dynamicMarkers.some((m) => m.id === marker.id)) return;
    set({ dynamicMarkers: [...get().dynamicMarkers, { ...marker }] });
    get().persist();
  },

  openRuin: () => {
    // Reaching the ruin is not the same as earning it: the chamber only
    // answers an operative who traced the gradient that leads here.
    if (!get().isObjectiveAvailable("ruins")) {
      const first = !get().ruinSealed;
      set({ ruinSealed: true });
      get().pushMessage("CHAMBER SEAL — NO RESPONSE");
      if (first) get().unlockCodex("seal");
      getAudio().pulseAlert();
      get().persist();
      return;
    }
    set({ ruinOpened: true, phase: "ruins" });
    get().completeObjective("ruins");
    get().unlockCodex("ruins");
    get().pushMessage("CHAMBER SEAL — BREACHED");
    getAudio().pulseInteract();
  },

  finishMission: () => {
    get().completeObjective("remember");
    get().unlockCodex("signal");
    set({ phase: "complete", ending: "silent" });
    get().pushMessage("LOG SEALED — REMEMBER");
    get().persist();
    const visible = get().visibleObjectives();
    postToParent({
      type: "fieldops:complete",
      ending: "silent",
      objectives: visible.filter((o) => o.done).length,
      total: visible.length,
      discoveries: get().discoveries,
    });
  },

  broadcastSignal: () => {
    if (get().ending) return;
    get().completeObjective("remember");
    get().unlockCodex("broadcast");
    get().setSignal(1);
    get().setWeather("storm", 1);
    set({ phase: "complete", ending: "broadcast", packsAggroed: true });
    get().pushMessage("CARRIER OPEN — STAR MAPS TRANSMITTING");
    get().pushMessage("QUIET PROTOCOL — VIOLATED");
    get().persist();
    const visible = get().visibleObjectives();
    postToParent({
      type: "fieldops:complete",
      ending: "broadcast",
      objectives: visible.filter((o) => o.done).length,
      total: visible.length,
      discoveries: get().discoveries,
    });
  },

  addJournal: (title, body, authored = false) => {
    const { x, z } = get().playerPos;
    const entry: JournalEntry = {
      id: `j-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      t: Date.now(),
      title,
      body,
      x,
      z,
    };
    if (authored) entry.authored = true;
    const journal = [entry, ...get().journal].slice(0, 40);
    set({ journal });
    // System log lines don't count; the objective asks for the operative's
    // own hand.
    if (journal.filter((j) => j.authored).length >= 3) {
      get().completeObjective("journal3");
    }
    get().persist();
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
      set({
        spoilerCeiling: spoiler,
        dynamicMarkers: ceilingFilter(get().dynamicMarkers, spoiler),
      });
    }
    // Chapter scene preset — the novel site's per-chapter "Visit this scene"
    // link. Handled before ?spawn and the QA pins (?tod / ?wx) so anything
    // explicit in the same URL still wins over the preset.
    const chapterParam = params.get("chapter");
    const scene = chapterParam ? CHAPTER_SCENES[chapterParam] : undefined;
    if (scene) {
      // The ceiling only ever rises toward the preset: a late-book chapter
      // page may open early Book II, but a chapter link never lowers a
      // ceiling the reader (or their save) already chose.
      if (scene.ceiling === "book2early" && get().spoilerCeiling === "book1") {
        set({ spoilerCeiling: "book2early" });
      }
      set({ pendingSpawn: scene.spawn, pendingDeployNote: scene.note });
      get().setTimeOfDay(scene.tod);
      get().setWeather(scene.wx);
    }
    const spawn = params.get("spawn") as SpawnPoint | null;
    if (spawn && SPAWNS[spawn]) set({ pendingSpawn: spawn });
    const op = params.get("operative") as CharacterId | null;
    if (op && CHARACTERS.some((c) => c.id === op)) {
      set({ characterId: op, phase: "briefing" });
    }
    // QA only: `tod` and `wx` pin the world clock and the sky so golden
    // screenshots are reproducible. Inert unless a test passes them.
    const tod = params.get("tod");
    if (tod !== null) {
      const t = Number.parseFloat(tod);
      if (Number.isFinite(t)) get().setTimeOfDay(Math.max(0, Math.min(1, t)));
    }
    const wx = params.get("wx");
    if (wx === "clear" || wx === "haze" || wx === "rain" || wx === "storm") {
      get().setWeather(wx);
    }
    // Not QA-only: a host page embedding the game on a page that is already
    // doing heavy work has a legitimate reason to pin the cheap tier.
    const q = params.get("quality");
    if (q === "low" || q === "medium" || q === "high") get().setQuality(q);
    if (params.get("auto") === "1" && get().characterId) {
      get().startMission();
    }
  },

  exportJournal: () => {
    const s = get();
    const char = s.getCharacter();
    // Every unlocked discovery that continues in the novel, one line per
    // chapter, lowest first. This is the whole point of the funnel: the log
    // the player carries out of the game ends where the book picks up.
    const refs: { chapter: number; teaser: string }[] = [];
    for (const c of s.visibleCodex()) {
      if (c.unlocked && c.chapterRef) refs.push(c.chapterRef);
    }
    refs.sort((a, b) => a.chapter - b.chapter);
    const reading: string[] = [];
    const seen = new Set<number>();
    for (const ref of refs) {
      if (seen.has(ref.chapter)) continue;
      seen.add(ref.chapter);
      reading.push(
        `Continue in 2121: EXODUS — Ch. ${ref.chapter}: ${ref.teaser}`,
      );
    }
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
      "",
      "FURTHER READING",
      ...reading,
      NOVEL_SITE_URL,
    ];
    return lines.join("\n\n");
  },

  reset: () => {
    // Device and privacy preferences — masterVolume, reducedMotion, quality,
    // spoilerCeiling, presenceEnabled — deliberately survive a run wipe: "New
    // operative" must never quietly re-enable presence for a reader who
    // opted out.
    set({
      phase: "select",
      prevPhase: null,
      characterId: null,
      objectives: INITIAL_OBJECTIVES.map((o) => ({ ...o })),
      revealedObjectives: [],
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
      ruinSealed: false,
      packsAggroed: false,
      fangQuills: 0,
      fangKills: 0,
      creatureMemory: [],
      inventory: emptyInventory(),
      upgrades: emptyUpgrades(),
      flags: {},
      codexStage: {},
      ending: null,
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
      pendingDeployNote: null,
      dynamicMarkers: [],
      hasSave: false,
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
          version: SAVE_VERSION,
          updatedAt: Date.now(),
          characterId: s.characterId,
          objectives: s.objectives,
          revealedObjectives: s.revealedObjectives,
          codex: s.codex,
          scannedIds: s.scannedIds,
          cachesLooted: s.cachesLooted,
          npcsTalked: s.npcsTalked,
          dynamicMarkers: s.dynamicMarkers,
          ridgeBeaconPlanted: s.ridgeBeaconPlanted,
          kaguyahimeLogged: s.kaguyahimeLogged,
          domeEntered: s.domeEntered,
          ruinOpened: s.ruinOpened,
          ruinSealed: s.ruinSealed,
          packsAggroed: s.packsAggroed,
          fangQuills: s.fangQuills,
          fangKills: s.fangKills,
          creatureMemory: s.creatureMemory,
          inventory: s.inventory,
          upgrades: s.upgrades,
          flags: s.flags,
          codexStage: s.codexStage,
          ending: s.ending,
          discoveries: s.discoveries,
          health: s.health,
          stamina: s.stamina,
          stormSurvived: s.stormSurvived,
          spoilerCeiling: s.spoilerCeiling,
          journal: s.journal,
          masterVolume: s.masterVolume,
          reducedMotion: s.reducedMotion,
          presenceEnabled: s.presenceEnabled,
          quality: s.quality,
          qualityAuto: s.qualityAuto,
          playerPos: s.playerPos,
          playerYaw: s.playerYaw,
          timeOfDay: s.timeOfDay,
          weather: s.weather,
          weatherIntensity: s.weatherIntensity,
        } satisfies SaveBlob),
      );
    } catch {
      /* ignore */
    }
  },

  startAutosave: () => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return () => {};
    }
    const flush = () => get().persist();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const timer = window.setInterval(() => {
      const phase = get().phase;
      if (phase === "playing" || phase === "ruins") flush();
    }, AUTOSAVE_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  },

  hydrate: () => {
    try {
      for (const key of LEGACY_SAVE_KEYS) localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    try {
      const data = readSave();
      if (!data) return;
      const spoilerCeiling = data.spoilerCeiling ?? "book1";
      const objectives = mergeObjectives(data.objectives);
      set({
        characterId: data.characterId ?? null,
        objectives,
        revealedObjectives: mergeReveals(objectives, data.revealedObjectives),
        codex: mergeCodex(data.codex),
        scannedIds: data.scannedIds ?? [],
        cachesLooted: data.cachesLooted ?? [],
        npcsTalked: data.npcsTalked ?? [],
        dynamicMarkers: ceilingFilter(
          data.dynamicMarkers ?? [],
          spoilerCeiling,
        ),
        ridgeBeaconPlanted: data.ridgeBeaconPlanted ?? false,
        kaguyahimeLogged: data.kaguyahimeLogged ?? false,
        domeEntered: data.domeEntered ?? false,
        ruinOpened: data.ruinOpened ?? false,
        ruinSealed: data.ruinSealed ?? false,
        packsAggroed: data.packsAggroed ?? false,
        fangQuills: data.fangQuills ?? 0,
        fangKills: data.fangKills ?? 0,
        creatureMemory: data.creatureMemory ?? [],
        inventory: mergeInventory(data.inventory),
        upgrades: mergeUpgrades(data.upgrades),
        flags: mergeFlags(data.flags, data.characterId),
        codexStage: mergeCodexStage(data.codexStage),
        ending: data.ending ?? null,
        discoveries: data.discoveries ?? 0,
        health: data.health ?? 100,
        stamina: data.stamina ?? 100,
        stormSurvived: data.stormSurvived ?? false,
        spoilerCeiling,
        journal: data.journal ?? [],
        masterVolume: data.masterVolume ?? 0.7,
        reducedMotion: data.reducedMotion ?? get().reducedMotion,
        // Absent on pre-v6 blobs; presence defaults ON, opt-out is explicit.
        presenceEnabled: data.presenceEnabled ?? true,
        // A demoted auto tier is restored as-is rather than re-detected: the
        // sampler already knows more about this device than the hints do.
        quality: isQualityTier(data.quality) ? data.quality : get().quality,
        qualityAuto: data.qualityAuto ?? get().qualityAuto,
        playerPos: data.playerPos ?? get().playerPos,
        playerYaw: data.playerYaw ?? get().playerYaw,
        timeOfDay: data.timeOfDay ?? get().timeOfDay,
        weather: data.weather ?? get().weather,
        weatherIntensity: data.weatherIntensity ?? get().weatherIntensity,
        hasSave: Boolean(data.characterId),
      });
    } catch {
      /* ignore */
    }
  },

  getCharacter: () => {
    const id = get().characterId;
    if (!id) return null;
    const base = CHARACTERS.find((c) => c.id === id);
    if (!base) return null;
    const upgrades = get().upgrades;
    if (
      characterCache &&
      characterCache.id === id &&
      characterCache.upgrades === upgrades
    ) {
      return characterCache.value;
    }
    // Clone — never mutate the CHARACTERS source — with upgrade bonuses
    // already applied, so every existing consumer gets progression for free.
    const value: CharacterDef = {
      ...base,
      scanBonus: base.scanBonus + upgrades.scan,
      stamina: base.stamina + upgrades.stamina,
      combatBonus: base.combatBonus + upgrades.combat,
      stealth: base.stealth + upgrades.stealth,
    };
    characterCache = { id, upgrades, value };
    return value;
  },

  /** Hidden tasking stays out of the log — and out of the completion total. */
  visibleObjectives: () =>
    visibleObjectivesOf(
      get().objectives,
      get().revealedObjectives,
      get().spoilerCeiling,
    ),

  visibleCodex: () => ceilingFilter(get().codex, get().spoilerCeiling),
}));
