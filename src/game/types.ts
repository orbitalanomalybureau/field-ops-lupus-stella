export type CharacterId = "theo" | "marine" | "survey";

export type GamePhase =
  | "boot"
  | "select"
  | "briefing"
  | "playing"
  | "ruins"
  | "complete"
  | "paused"
  | "dialogue"
  | "journal"
  | "photo"
  | "settings";

export type SpoilerCeiling = "book1" | "book2early";

/** How the survey was closed out. Null until the log is sealed. */
export type Ending = "silent" | "broadcast";

/**
 * Field-harvest currencies. Counts live in `store.inventory`; colony staff
 * redeem them for permanent upgrades via dialogue effects.
 */
export type ItemId =
  | "fern-spore"
  | "fang-quill"
  | "prism-shard"
  | "collar-component";

/**
 * The four permanent field-mod tracks. Bonuses are additive, start at 0, and
 * are folded into `getCharacter()` so every existing consumer sees them.
 */
export type UpgradeKey = "scan" | "stamina" | "combat" | "stealth";

export type ObjectiveId =
  | "perimeter"
  | "ferns"
  | "prismhoof"
  | "shadowfang"
  | "ruins"
  | "remember"
  | "scan"
  | "caches"
  | "npcs"
  | "ridge7"
  | "storm"
  | "kaguyahime"
  | "dome"
  | "journal3";

export type Objective = {
  id: ObjectiveId;
  title: string;
  detail: string;
  done: boolean;
  optional?: boolean;
  /** Hidden when spoiler ceiling is book1 */
  book2?: boolean;
  /** Cannot be completed until every listed objective is done. */
  requires?: ObjectiveId[];
  /** Absent from the log until the player earns the reveal. */
  hidden?: boolean;
  /** Status line pushed on reveal. Falls back to the title. */
  tasking?: string;
};

export type CodexEntry = {
  id: string;
  title: string;
  body: string;
  unlocked: boolean;
  book2?: boolean;
  /**
   * Deeper strata of the same entry. Stage 0 is `body`; stage n (n >= 1)
   * renders stages[n-1]. Progress lives in `store.codexStage`.
   */
  stages?: { body: string; source?: string }[];
  /** Where this thread continues in the novel. Feeds the journal's FURTHER
   * READING section and the fieldops:discovery bridge message. */
  chapterRef?: { chapter: number; teaser: string };
};

export type CharacterDef = {
  id: CharacterId;
  rank: string;
  name: string;
  callsign: string;
  blurb: string;
  speed: number;
  stamina: number;
  stealth: number;
  accent: string;
  /** Active loadout tag */
  loadout: string;
  scanBonus: number;
  combatBonus: number;
  commandBonus: number;
};

export type InteractPrompt = {
  label: string;
  sub?: string;
  dist: number;
} | null;

/**
 * A named survey grid — a circle of ground the HUD title-cards on first entry.
 * First-entry state is a store flag ("region-<id>"), so it persists for free.
 */
export type RegionDef = {
  id: string;
  /** Tracked-caps splash line, survey fiction: "GRID 7 — RIDGE-7 APPROACH". */
  name: string;
  /** Sub-line under the name: survey status, one clause. */
  sub: string;
  x: number;
  z: number;
  /** Containment radius in metres. */
  r: number;
  book2?: boolean;
};

export type WorldMarker = {
  id: string;
  label: string;
  x: number;
  z: number;
  kind:
    | "colony"
    | "objective"
    | "danger"
    | "ruin"
    | "cache"
    | "poi"
    | "ridge"
    | "npc"
    | "coast";
  book2?: boolean;
};

export type ScanTarget = {
  id: string;
  title: string;
  kind: "flora" | "fauna" | "structure" | "anomaly";
  x: number;
  z: number;
  radius: number;
  codexId?: string;
  book2?: boolean;
};

export type WeatherKind = "clear" | "haze" | "rain" | "storm";

/**
 * "aim" is the hold-to-aim rifle posture (cancels the scanner; both arms on
 * the weapon); "attack" is the ~0.2 s melee sweep window. Both are transient
 * postures the controller reports through setPlayerMotion, same as the rest.
 */
export type AnimState =
  | "idle"
  | "walk"
  | "run"
  | "scan"
  | "combat"
  | "aim"
  | "attack";

/**
 * One selectable reply. `if` gates visibility — "flagName", "!flagName", or
 * "item:<ItemId>>=<n>". `once` names a flag raised on first use that hides the
 * choice thereafter; `setFlag` is raised whenever the choice is taken. A
 * gated choice is unreachable even by index — see store.chooseDialogue.
 */
export type DialogueChoice = {
  label: string;
  next?: string;
  effect?: string;
  if?: string;
  setFlag?: string;
  once?: string;
};

export type DialogueLine = {
  speaker: string;
  text: string;
  choices?: DialogueChoice[];
};

export type DialogueTree = {
  id: string;
  npcId: string;
  start: string;
  nodes: Record<string, DialogueLine>;
};

/**
 * World moments the comms layer speaks to. Theo hears Ava; the other
 * operatives hear the terse colony net. Lines live in data.ts AVA_LINES.
 */
export type AvaTrigger =
  | "treeline"
  | "tracked"
  | "storm-in"
  | "ruin-near"
  | "nightfall"
  | "first-kill"
  | "ambush-seen"
  | "coast"
  | "broadcast";

export type NpcDef = {
  id: string;
  name: string;
  role: string;
  x: number;
  z: number;
  color: string;
  dialogueId: string;
  tip?: string;
  book2?: boolean;
};

export type JournalEntry = {
  id: string;
  t: number;
  title: string;
  body: string;
  x: number;
  z: number;
  /** True when the operative wrote it by hand; system log lines omit it.
   * The journal3 objective counts only authored entries. */
  authored?: boolean;
};

export type SpawnPoint =
  | "south-gate"
  | "colony"
  | "ridge7"
  | "ruins"
  | "coast"
  | "treeline";

export type MissionBoardItem = {
  id: string;
  title: string;
  detail: string;
  objectiveId?: ObjectiveId;
  spawn?: SpawnPoint;
  book2?: boolean;
};
