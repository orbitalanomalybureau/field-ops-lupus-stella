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
};

export type CodexEntry = {
  id: string;
  title: string;
  body: string;
  unlocked: boolean;
  book2?: boolean;
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

export type AnimState = "idle" | "walk" | "run" | "scan" | "combat";

export type DialogueLine = {
  speaker: string;
  text: string;
  choices?: { label: string; next?: string; effect?: string }[];
};

export type DialogueTree = {
  id: string;
  npcId: string;
  start: string;
  nodes: Record<string, DialogueLine>;
};

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
