import type {
  CharacterDef,
  CodexEntry,
  DialogueTree,
  MissionBoardItem,
  NpcDef,
  Objective,
  ScanTarget,
  SpawnPoint,
  WorldMarker,
} from "./types";

export const CHARACTERS: CharacterDef[] = [
  {
    id: "theo",
    rank: "COL (Ret.)",
    name: "Theo Daniel",
    callsign: "DANIEL",
    blurb:
      "USSF. Promethei Terra. Cybernetic left arm. Command authority. Colony staff open up faster under his callsign.",
    speed: 1,
    stamina: 1.15,
    stealth: 0.9,
    accent: "#3d9e8f",
    loadout: "Command suite · Ava link",
    scanBonus: 1.05,
    combatBonus: 1.1,
    commandBonus: 1.25,
  },
  {
    id: "marine",
    rank: "SGT",
    name: "Miles, J.",
    callsign: "MILES",
    blurb:
      "Perimeter detail. Quiet hands. Faster on the sprint, harder in combat stance when fangs close.",
    speed: 1.12,
    stamina: 1.25,
    stealth: 1,
    accent: "#c45c2a",
    loadout: "Pulse rifle · hard plates",
    scanBonus: 0.95,
    combatBonus: 1.35,
    commandBonus: 0.9,
  },
  {
    id: "survey",
    rank: "CIV",
    name: "Carrera, S.",
    callsign: "SURVEY-3",
    blurb:
      "Orbital cartography reassigned to ground recon. Fastest field scans; ghosts past pattern-hunters.",
    speed: 0.96,
    stamina: 0.95,
    stealth: 1.25,
    accent: "#6a8ab0",
    loadout: "Survey suite · low-noise pack",
    scanBonus: 1.4,
    combatBonus: 0.85,
    commandBonus: 1,
  },
];

export const INITIAL_OBJECTIVES: Objective[] = [
  {
    id: "perimeter",
    title: "Walk the south perimeter",
    detail: "Confirm light-tower line and generator collar status.",
    done: false,
  },
  {
    id: "npcs",
    title: "Speak with colony staff",
    detail: "Talk to Thornhill, Castillo, and Voss before deep recon.",
    done: false,
  },
  {
    id: "dome",
    title: "Enter command dome",
    detail: "Step inside the central dome ops floor (E at hatch).",
    done: false,
  },
  {
    id: "scan",
    title: "Run field scanner",
    detail: "Hold Q to scan flora, fauna, and structures (3 targets).",
    done: false,
  },
  {
    id: "ferns",
    title: "Log Lumina Fern pulse",
    detail: "Record the 4.7s bioluminescence cycle at the treeline.",
    done: false,
  },
  {
    id: "ridge7",
    title: "Survey Ridge-7",
    detail: "West ridge expedition. Plant a beacon at the overlook.",
    done: false,
  },
  {
    id: "journal3",
    title: "File three journal notes",
    detail: "Press J to open the field journal; log discoveries (3).",
    done: false,
    optional: true,
  },
  {
    id: "storm",
    title: "Weather a storm front",
    detail: "Survive a full ion-rain cell without fatal vitals drop.",
    done: false,
    optional: true,
  },
  {
    id: "caches",
    title: "Recover supply caches",
    detail: "Locate survey caches along forest, ridge, and coast.",
    done: false,
    optional: true,
  },
  {
    id: "prismhoof",
    title: "Observe Prismhoof",
    detail: "Approach the herd without stampede.",
    done: false,
    optional: true,
  },
  {
    id: "shadowfang",
    title: "Note Shadowfang contact",
    detail: "They learn routes. Break pattern if tracked.",
    done: false,
    optional: true,
  },
  {
    id: "kaguyahime",
    title: "Log Kaguyahime carrier",
    detail: "South coast overlook — far-continent signal memorial.",
    done: false,
    book2: true,
  },
  {
    id: "ruins",
    title: "Locate the southern ruin",
    detail: "Follow EM gradient into the Titans.",
    done: false,
  },
  {
    id: "remember",
    title: "Enter the chamber",
    detail: "Catalog the alloy slab. Do not broadcast.",
    done: false,
  },
];

export const INITIAL_CODEX: CodexEntry[] = [
  {
    id: "lupus",
    title: "Lupus Stella",
    body: "Wolf 1061c. Habitable. 1.15g. 28-hour day. Crimson seas under an amber sky. The ecosystem is not dormant. It is aggressive.",
    unlocked: true,
  },
  {
    id: "new-eden",
    title: "New Eden Colony",
    body: "Plateau settlement. Prefab domes, four ZPE generators under modulation collars, light towers, south field marker for John Carver.",
    unlocked: true,
  },
  {
    id: "titans",
    title: "Obsidian Titans",
    body: "Kilometer-scale canopy. Trunks four to five meters across. Bark like cooled lava. Pale inner wood where the skin cracks.",
    unlocked: false,
  },
  {
    id: "ferns",
    title: "Lumina Ferns",
    body: "Blue-green understory. Synchronized pulse ~4.7 seconds. Matches planetary EM baseline within measurement error.",
    unlocked: false,
  },
  {
    id: "prismhoof",
    title: "Prismhoof",
    body: "Herd fauna. Crystaline antler lattice refracts red-star light. Non-hostile unless cornered.",
    unlocked: false,
  },
  {
    id: "shadowfang",
    title: "Shadowfang",
    body: "Apex pack predator. Flanking, pattern learning, copper eyeshine. Coordinates with larger threats under stress.",
    unlocked: false,
  },
  {
    id: "ruins",
    title: "Pre-human ruins",
    body: "Dark alloy, ambient temperature match to certain neural interfaces. Star maps. One word: REMEMBER.",
    unlocked: false,
  },
  {
    id: "signal",
    title: "Far-continent carrier",
    body: "Kaguyahime. Japanese ark, far south. Carrier once silent; now responding to analysis pings.",
    unlocked: false,
    book2: true,
  },
  {
    id: "collars",
    title: "Modulation collars",
    body: "Thornhill's retrofit. Flattens ZPE signatures to noise. Drift a few millihertz a night. The work that cost Carver.",
    unlocked: false,
  },
  {
    id: "grid",
    title: "EM lattice",
    body: "Planetary electromagnetic grid under the foundations. The forest keeps time with it. So does the chamber.",
    unlocked: false,
  },
  {
    id: "ridge7",
    title: "Ridge-7",
    body: "Western basalt spine. Clear sightline toward the far continent. Expedition caches left by Survey Team B before the quiet protocol.",
    unlocked: false,
  },
  {
    id: "weather",
    title: "Ion rain cells",
    body: "Storm fronts carry charged particulates. Comms degrade. Ferns go dark. Shadowfangs hunt in the noise.",
    unlocked: false,
  },
  {
    id: "daycycle",
    title: "28-hour day",
    body: "Local sol lasts longer than Earth. Amber dawns, long crimson dusks. Night is not empty — it is when the lattice sings.",
    unlocked: false,
  },
  {
    id: "kaguyahime",
    title: "Kaguyahime",
    body: "Far-continent Japanese ark colony. Cherry memorials at New Eden face their vector. Quiet protocol once kept both silent.",
    unlocked: false,
    book2: true,
  },
  {
    id: "quiet",
    title: "Quiet protocol",
    body: "No unfiltered broadcasts. No naked ZPE. We hid and lived. The covenant is silence until something answers correctly.",
    unlocked: false,
    book2: true,
  },
  {
    id: "ava",
    title: "Ava interface",
    body: "Theo's neural suite. Half partner, half ghost of Promethei Terra. Field Ops routes low-band queries through her filters.",
    unlocked: false,
  },
  {
    id: "command-dome",
    title: "Command dome",
    body: "Ops floor under the central prefab. Mission board, collar telemetry, and the only coffee that tastes like Earth regret.",
    unlocked: false,
  },
];

export const NPCS: NpcDef[] = [
  {
    id: "thornhill",
    name: "Dr. Thornhill",
    role: "ZPE systems",
    x: -18,
    z: 14,
    color: "#6a90a8",
    dialogueId: "dlg-thornhill",
    tip: "Ask about collars",
  },
  {
    id: "castillo",
    name: "June Castillo",
    role: "Perimeter med",
    x: 8,
    z: 24,
    color: "#a87868",
    dialogueId: "dlg-castillo",
    tip: "Vitals & Carver",
  },
  {
    id: "voss",
    name: "Adele Voss",
    role: "Contracts / Gate",
    x: 16,
    z: 10,
    color: "#8a7a60",
    dialogueId: "dlg-voss",
    tip: "Ridge-7 clearance",
  },
  {
    id: "berger",
    name: "Berger",
    role: "Ark engineer",
    x: -6,
    z: 32,
    color: "#5a7068",
    dialogueId: "dlg-berger",
    tip: "Storm protocol",
  },
  {
    id: "tomas",
    name: "Tomas",
    role: "Office of the Voice",
    x: 4,
    z: 18,
    color: "#7a6a90",
    dialogueId: "dlg-tomas",
    tip: "Quiet protocol",
    book2: true,
  },
];

export const DIALOGUES: Record<string, DialogueTree> = {
  "dlg-thornhill": {
    id: "dlg-thornhill",
    npcId: "thornhill",
    start: "intro",
    nodes: {
      intro: {
        speaker: "Dr. Thornhill",
        text: "Collar drift is two millihertz overnight. Again. Carver would have recalibrated by hand before the shift change.",
        choices: [
          { label: "Walk me through the collars.", next: "collars" },
          { label: "Any EM spike south?", next: "south" },
          { label: "I'll let you work.", next: "end" },
        ],
      },
      collars: {
        speaker: "Dr. Thornhill",
        text: "Four ZPE cores under modulation collars. They flatten our signature into planetary noise. When they drift, the forest hears us.",
        choices: [
          { label: "I'll inspect the nearest collar.", next: "end", effect: "codex:collars" },
          { label: "Why not shut them down?", next: "shutdown" },
        ],
      },
      shutdown: {
        speaker: "Dr. Thornhill",
        text: "Cold cores kill us slow. Bare signatures kill us fast. Choose your speed.",
        choices: [{ label: "Understood.", next: "end", effect: "codex:collars" }],
      },
      south: {
        speaker: "Dr. Thornhill",
        text: "Something under the Titans is pulling on the lattice. Same band as certain neural-interface alloys from Earth.",
        choices: [
          { label: "I'll recon the ruin.", next: "end", effect: "hint:ruins" },
          { label: "Keep the cores quiet.", next: "end" },
        ],
      },
      end: {
        speaker: "Dr. Thornhill",
        text: "Stay on the beacons. If the ferns go dark all at once — run.",
      },
    },
  },
  "dlg-castillo": {
    id: "dlg-castillo",
    npcId: "castillo",
    start: "intro",
    nodes: {
      intro: {
        speaker: "June Castillo",
        text: "You're upright. Good. Half the perimeter detail comes back with dust-burn and excuses.",
        choices: [
          { label: "How's the colony holding?", next: "colony" },
          { label: "Tell me about Carver.", next: "carver" },
          { label: "I need a stim pack.", next: "heal" },
        ],
      },
      colony: {
        speaker: "June Castillo",
        text: "We're not dying. That's the high bar. Kids still plant cherry starts by the Kaguyahime memorial.",
        choices: [
          { label: "Keep them safe.", next: "end" },
          { label: "About Carver…", next: "carver" },
        ],
      },
      carver: {
        speaker: "June Castillo",
        text: "John Carver died keeping a collar from cascading. The south marker is his. Don't salute it if you won't walk the line he held.",
        choices: [{ label: "I walk it.", next: "end", effect: "codex:new-eden" }],
      },
      heal: {
        speaker: "June Castillo",
        text: "One dose. The forest already wants your pattern — don't hand it your vitals too.",
        choices: [{ label: "Thanks.", next: "end", effect: "heal" }],
      },
      end: {
        speaker: "June Castillo",
        text: "Come back breathing. That's an order from med, not command.",
      },
    },
  },
  "dlg-voss": {
    id: "dlg-voss",
    npcId: "voss",
    start: "intro",
    nodes: {
      intro: {
        speaker: "Adele Voss",
        text: "Gate records don't care about bravery. They care about who left, who returned, and who signed the risk waiver.",
        choices: [
          { label: "Clear me for Ridge-7.", next: "ridge" },
          { label: "What is Ridge-7?", next: "what" },
          { label: "Just checking in.", next: "end" },
        ],
      },
      what: {
        speaker: "Adele Voss",
        text: "Western basalt spine. Survey B planted caches and a mast. Storms hit the ridge first.",
        choices: [
          { label: "Authorize the trek.", next: "ridge", effect: "codex:ridge7" },
          { label: "I'll stick to forest.", next: "end" },
        ],
      },
      ridge: {
        speaker: "Adele Voss",
        text: "Authorized. Plant the expedition beacon at the overlook. Don't hero the ridge at night.",
        choices: [
          { label: "Copy. Heading west.", next: "end", effect: "codex:ridge7|hint:ridge7" },
        ],
      },
      end: {
        speaker: "Adele Voss",
        text: "Log your exit. Log your return. The dead don't get to correct the paperwork.",
      },
    },
  },
  "dlg-berger": {
    id: "dlg-berger",
    npcId: "berger",
    start: "intro",
    nodes: {
      intro: {
        speaker: "Berger",
        text: "Ark metal sings when the ion front is twenty minutes out. You learn to hear it or you learn the hard way.",
        choices: [
          { label: "Storm protocol?", next: "storm" },
          { label: "How's the Verne hull?", next: "verne" },
          { label: "Keep an ear out.", next: "end" },
        ],
      },
      storm: {
        speaker: "Berger",
        text: "When the sky goes copper and the ferns black out, get off high ground. Fangs hunt the noise. Towers are islands.",
        choices: [
          { label: "I'll weather one.", next: "end", effect: "codex:weather|hint:storm" },
        ],
      },
      verne: {
        speaker: "Berger",
        text: "She's quiet under the islands now. We hid and lived. That was the whole strategy.",
        choices: [{ label: "Hard lesson.", next: "end" }],
      },
      end: {
        speaker: "Berger",
        text: "If you smell ozone like burnt citrus — that's not dinner. Move.",
      },
    },
  },
  "dlg-tomas": {
    id: "dlg-tomas",
    npcId: "tomas",
    start: "intro",
    nodes: {
      intro: {
        speaker: "Tomas",
        text: "The Voice does not shout. We listen for patterns that are not ours — then we decide if answering is survival or invitation.",
        choices: [
          { label: "Explain quiet protocol.", next: "quiet" },
          { label: "Kaguyahime?", next: "kaguya" },
          { label: "I should go.", next: "end" },
        ],
      },
      quiet: {
        speaker: "Tomas",
        text: "No naked broadcasts. No uncollared cores. The lattice already knows we are here. We do not teach it our names.",
        choices: [
          { label: "Understood.", next: "end", effect: "codex:quiet" },
        ],
      },
      kaguya: {
        speaker: "Tomas",
        text: "Far south, across crimson water. They kept cherry trees alive through silence. Their carrier answers analysis pings now. Be careful what you ask it.",
        choices: [
          {
            label: "I'll log the coast memorial.",
            next: "end",
            effect: "codex:kaguyahime|hint:coast",
          },
        ],
      },
      end: {
        speaker: "Tomas",
        text: "Remember is not a command. It is a burden. Carry it lightly.",
      },
    },
  },
};

export const MARKERS: WorldMarker[] = [
  { id: "colony", label: "New Eden", x: 0, z: 8, kind: "colony" },
  { id: "south-gate", label: "South Gate", x: 0, z: 42, kind: "objective" },
  { id: "treeline", label: "Treeline", x: 0, z: 72, kind: "objective" },
  { id: "herd", label: "Herd field", x: -55, z: 95, kind: "objective" },
  { id: "cache-a", label: "Cache Alpha", x: -22, z: 88, kind: "cache" },
  { id: "cache-b", label: "Cache Bravo", x: 28, z: 118, kind: "cache" },
  { id: "cache-r", label: "Ridge cache", x: -95, z: 40, kind: "cache" },
  { id: "cache-c", label: "Coast cache", x: 35, z: 195, kind: "cache", book2: true },
  { id: "sensor", label: "Sensor mast", x: 12, z: 58, kind: "poi" },
  { id: "ruin", label: "Ruin approach", x: 18, z: 155, kind: "ruin" },
  { id: "ridge7", label: "Ridge-7", x: -110, z: 55, kind: "ridge" },
  { id: "coast", label: "Kaguyahime memorial", x: 22, z: 200, kind: "coast", book2: true },
  { id: "npc-t", label: "Thornhill", x: -18, z: 14, kind: "npc" },
  { id: "npc-c", label: "Castillo", x: 8, z: 24, kind: "npc" },
];

export const SCAN_TARGETS: ScanTarget[] = [
  {
    id: "scan-fern",
    title: "Lumina Fern bed",
    kind: "flora",
    x: 4,
    z: 74,
    radius: 14,
    codexId: "ferns",
  },
  {
    id: "scan-collar",
    title: "ZPE modulation collar",
    kind: "structure",
    x: -22,
    z: 12,
    radius: 10,
    codexId: "collars",
  },
  {
    id: "scan-herd",
    title: "Prismhoof herd",
    kind: "fauna",
    x: -55,
    z: 95,
    radius: 18,
    codexId: "prismhoof",
  },
  {
    id: "scan-ruin",
    title: "Alloy chamber",
    kind: "anomaly",
    x: 18,
    z: 155,
    radius: 16,
    codexId: "ruins",
  },
  {
    id: "scan-grid",
    title: "EM lattice node",
    kind: "anomaly",
    x: 12,
    z: 58,
    radius: 12,
    codexId: "grid",
  },
  {
    id: "scan-ridge",
    title: "Ridge-7 basalt",
    kind: "structure",
    x: -110,
    z: 55,
    radius: 16,
    codexId: "ridge7",
  },
  {
    id: "scan-coast",
    title: "Kaguyahime memorial",
    kind: "anomaly",
    x: 22,
    z: 200,
    radius: 14,
    codexId: "kaguyahime",
    book2: true,
  },
];

export const MISSION_BOARD: MissionBoardItem[] = [
  {
    id: "m-perimeter",
    title: "Perimeter walk",
    detail: "South gate and light towers.",
    objectiveId: "perimeter",
    spawn: "south-gate",
  },
  {
    id: "m-ridge",
    title: "Ridge-7 survey",
    detail: "Plant expedition beacon west.",
    objectiveId: "ridge7",
    spawn: "ridge7",
  },
  {
    id: "m-forest",
    title: "Fern + fauna log",
    detail: "Treeline bioluminescence and herd field.",
    spawn: "treeline",
  },
  {
    id: "m-ruins",
    title: "Ruin approach",
    detail: "Southern Titans chamber.",
    objectiveId: "ruins",
    spawn: "ruins",
  },
  {
    id: "m-coast",
    title: "Far-continent vector",
    detail: "Kaguyahime memorial on the south coast.",
    objectiveId: "kaguyahime",
    spawn: "coast",
    book2: true,
  },
];

export const SPAWNS: Record<SpawnPoint, { x: number; z: number; yaw: number }> = {
  "south-gate": { x: 0, z: 40, yaw: Math.PI },
  colony: { x: 2, z: 20, yaw: 0 },
  ridge7: { x: -100, z: 50, yaw: -Math.PI / 2 },
  ruins: { x: 18, z: 140, yaw: Math.PI },
  coast: { x: 20, z: 185, yaw: Math.PI },
  treeline: { x: 0, z: 70, yaw: Math.PI },
};

export const WORLD = {
  colonyCenter: [0, 0, 8] as const,
  southGate: [0, 0, 42] as const,
  treelineZ: 68,
  ruinPos: [18, 0, 155] as const,
  herdPos: [-55, 0, 95] as const,
  ridgeBeacon: [-112, 0, 58] as const,
  ridgeOverlook: [-118, 0, 62] as const,
  coastMemorial: [22, 0, 200] as const,
  domeHatch: [0, 0, 6] as const,
  bounds: 260,
  fernPulse: 4.7,
  dayLengthSec: 480,
};
