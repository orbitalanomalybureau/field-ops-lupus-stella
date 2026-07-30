import { ENTITIES } from "./entities";
import type {
  AvaTrigger,
  CharacterDef,
  CodexEntry,
  DialogueTree,
  MissionBoardItem,
  NpcDef,
  Objective,
  RegionDef,
  ScanTarget,
  SpawnPoint,
  SpoilerCeiling,
  WeatherKind,
  WorldMarker,
} from "./types";

/**
 * entities.ts owns where things stand; this file owns what they are called and
 * what they say. A site named in both places is looked up, never retyped.
 */
function site(id: string): { x: number; z: number } {
  const entity = ENTITIES.find((e) => e.id === id);
  if (!entity) throw new Error(`data: no world entity "${id}"`);
  return { x: entity.x, z: entity.z };
}

function sitePos(id: string): readonly [number, number, number] {
  const { x, z } = site(id);
  return [x, 0, z] as const;
}

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
    detail: "Hold {scan} to scan flora, fauna, and structures (3 targets).",
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
    detail:
      "West ridge expedition, gate waiver required. Plant a beacon at the overlook.",
    done: false,
    hidden: true,
    tasking: "TASKING — Ridge-7 survey authorized. Waiver on file.",
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
    detail: "Follow the EM gradient south into the Titans until the alloy answers.",
    done: false,
    hidden: true,
    tasking: "TASKING — EM gradient resolves south. Ruin bearing logged.",
  },
  {
    id: "remember",
    title: "Enter the chamber",
    detail: "Catalog the alloy slab. Do not broadcast.",
    done: false,
    hidden: true,
    requires: ["ruins"],
    tasking: "TASKING — chamber interior. Catalog it and withdraw.",
  },
];

/**
 * Stage convention: `body` is stage 1 — what the first scan or conversation
 * earns. `stages[0]` is stage 2, unlocked by the deeper event named in its
 * `source`. `chapterRef` chapter numbers are placeholders pending manuscript
 * alignment — see canon/CANON.md § Chapter references.
 */
export const INITIAL_CODEX: CodexEntry[] = [
  {
    id: "lupus",
    title: "Lupus Stella",
    body: "Wolf 1061c. Habitable. 1.15g. 28-hour day. Crimson seas under an amber sky. The ecosystem is not dormant. It is aggressive.",
    unlocked: true,
    chapterRef: { chapter: 1, teaser: "the first amber dawn over a crimson sea" },
  },
  {
    id: "new-eden",
    title: "New Eden Colony",
    body: "Plateau settlement. Prefab domes, four ZPE generators under modulation collars, light towers, south field marker for John Carver.",
    unlocked: true,
    chapterRef: { chapter: 3, teaser: "how the plateau was chosen, and what it cost" },
  },
  {
    id: "carver",
    title: "John Carver",
    body: "Retrofit engineer, ZPE systems. Signed the collar retrofit off with Thornhill. Died holding the west collar out of cascade. The south field marker is his. Castillo trims the line to the gate; Thornhill keeps the drift low. Division of grief.",
    unlocked: false,
    chapterRef: { chapter: 7, teaser: "the shift Carver did not walk away from" },
  },
  {
    id: "titans",
    title: "Obsidian Titans",
    body: "Kilometer-scale canopy. Trunks four to five meters across. Bark like cooled lava. Pale inner wood where the skin cracks.",
    unlocked: false,
    chapterRef: { chapter: 5, teaser: "first walk under a kilometer of canopy" },
  },
  {
    id: "ferns",
    title: "Lumina Ferns",
    body: "Blue-green understory. Synchronized pulse ~4.7 seconds. Matches planetary EM baseline within measurement error.",
    unlocked: false,
    stages: [
      {
        body: "Storm observation: the pulse does not falter under ion rain — it stops. Fern beds black out the instant a cell crosses the treeline and resume in phase with the lattice, not with each other. The light was never theirs. They are indicators on a planetary circuit.",
        source: "Field observation — ion storm blackout",
      },
    ],
    chapterRef: { chapter: 6, teaser: "the night the understory kept time" },
  },
  {
    id: "prismhoof",
    title: "Prismhoof",
    body: "Herd fauna. Crystaline antler lattice refracts red-star light. Non-hostile unless cornered.",
    unlocked: false,
    stages: [
      {
        body: "The antler lattice is shed and regrown by season; discarded laminae — prism shards — hold their refractive grade for months and grind finer than anything in colony stores. The herd tolerates a slow walker at two lengths. What it will not tolerate is a straight line. Approach on arcs.",
        source: "Herd observation — extended contact",
      },
    ],
  },
  {
    id: "shadowfang",
    title: "Shadowfang",
    body: "Apex pack predator. Flanking, pattern learning, copper eyeshine. Coordinates with larger threats under stress.",
    unlocked: false,
    stages: [
      {
        body: "Confirmed: the pack does not patrol — it solves. Repeated transits average into an intercept solution, and the pack waits on the solution, not the trail. Copper eyeshine at a crossing you have not reached yet is not a sighting. It is your own schedule, read back to you.",
        source: "Route-learning confirmed in the field",
      },
    ],
    chapterRef: { chapter: 8, teaser: "a hunt that went both ways" },
  },
  {
    id: "ruins",
    title: "Pre-human ruins",
    body: "Dark alloy, ambient temperature match to certain neural interfaces. Star maps. One word: REMEMBER.",
    unlocked: false,
    stages: [
      {
        body: "Chamber interior: the alloy holds ambient temperature exactly. Not passive — regulating. The star maps chart systems no human survey has named, and the one legible word is an imperative with no addressee. The instruction predates its only readers. Someone expected us. Or expected someone.",
        source: "Chamber survey — interior catalog",
      },
    ],
    chapterRef: { chapter: 12, teaser: "the word under the Titans" },
  },
  {
    id: "seal",
    title: "Chamber seal",
    body: "No seam, no mechanism, no response to a hand. The face answers a bearing the EM lattice already carries. Trace the gradient out from the colony foundations — Thornhill logs what pulls on it.",
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
    stages: [
      {
        body: "Command channel: the published drift figure is two millihertz a night. True aggregate is eight and climbing since storm season. Cascade lock-in fails past forty. The night Carver died, the west collar read forty-three. Thornhill keeps both logs. Only one lets the colony sleep.",
        source: "Thornhill — command channel",
      },
    ],
    chapterRef: { chapter: 4, teaser: "the machines that keep a colony invisible" },
  },
  {
    id: "verne",
    title: "The Verne",
    body: "Ark. Ballasted down under the islands, systems cold by choice — a ship that is not transmitting is not dead; she is holding her breath. Berger cut one plate off her forward frame before she went under and keeps it where the sun still finds it.",
    unlocked: false,
  },
  {
    id: "grid",
    title: "EM lattice",
    body: "Planetary electromagnetic grid under the foundations. The forest keeps time with it. So does the chamber.",
    unlocked: false,
    stages: [
      {
        body: "The lattice is not infrastructure — it is a clock. Fern pulse, chamber resonance, and nightly collar drift all beat against the same 4.7-second base. The colony did not build on silent ground. It built inside an instrument that is still being played.",
        source: "Thornhill — lattice survey",
      },
    ],
  },
  {
    id: "ridge7",
    title: "Ridge-7",
    body: "Western basalt spine. Clear sightline toward the far continent. Expedition caches left by Survey Team B before the quiet protocol.",
    unlocked: false,
    stages: [
      {
        body: "Survey Team B's cache trail runs alpha, bravo, ridge, coast — four logs, one expedition. They went out under an open sky and came back refusing to use it. Read the logs in order. The ridge remembers them better than the gate ledger does.",
        source: "Cache log recovery",
      },
    ],
  },
  {
    id: "hale-camp",
    title: "Hale camp",
    body: "Cold expedition camp on the Ridge-7 flank. Weathered gear, seasons old. Every equipment tag reads HALE. Boot tracks leave the camp south, toward the Titans. No return trail. No other record.",
    unlocked: false,
  },
  {
    id: "weather",
    title: "Ion rain cells",
    body: "Storm fronts carry charged particulates. Comms degrade. Ferns go dark. Shadowfangs hunt in the noise.",
    unlocked: false,
    stages: [
      {
        body: "Survived cell, logged: comms degrade before the rain falls; fern beds black out at the front line; fang activity climbs with the noise floor. Berger's lead indicators hold — ark metal first, then ozone like burnt citrus. Shelter is a decision made twenty minutes early or not at all.",
        source: "Storm survival log",
      },
    ],
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
    stages: [
      {
        body: "The carrier answers analysis pings with valid handshakes and nothing else — a door held open by someone who will not speak first. The Office of the Voice logs every exchange. Two colonies, each waiting for the other to break a silence both survived by keeping.",
        source: "Office of the Voice — carrier log",
      },
    ],
    chapterRef: { chapter: 16, teaser: "the far shore answers" },
  },
  {
    id: "quiet",
    title: "Quiet protocol",
    body: "No unfiltered broadcasts. No naked ZPE. We hid and lived. The covenant is silence until something answers correctly.",
    unlocked: false,
    book2: true,
    chapterRef: { chapter: 15, teaser: "the doctrine gets its name" },
  },
  {
    id: "broadcast",
    title: "Open carrier",
    body: "An uncollared transmission clears the atmosphere in minutes and does not stop. The star maps went out addressed to whatever kept them. Nothing answered on the first pass.",
    unlocked: false,
  },
  {
    id: "ava",
    title: "Ava interface",
    body: "Theo's neural suite. Half partner, half ghost of Promethei Terra. Field Ops routes low-band queries through her filters.",
    unlocked: false,
    chapterRef: { chapter: 2, teaser: "what came home from Promethei Terra" },
  },
  {
    id: "command-dome",
    title: "Command dome",
    body: "Ops floor under the central prefab. Mission board, collar telemetry, and the only coffee that tastes like Earth regret.",
    unlocked: false,
  },
  {
    id: "route-learning",
    title: "Route learning",
    body: "Shadowfang packs do not follow an operative. They chart one. Repeated transits average into an intercept solution; the pack waits on the solution, not the trail. Vary route. Vary timing. A pattern is a rendezvous you did not agree to.",
    unlocked: false,
  },
  {
    id: "pulse-rifle",
    title: "Pulse rifle",
    body: "Coil-driven EM emitter, shoulder class. One trigger pull dumps a charged cell as a coherent bolt — and as an unfiltered spike on every band the lattice carries. The planet does not distinguish a weapon from a beacon. Every discharge is a small broadcast, and everything out there that reads the noise floor hears it. Cells recharge on their own. Silence does not.",
    unlocked: false,
  },
];

export const NPCS: NpcDef[] = [
  {
    id: "thornhill",
    name: "Dr. Thornhill",
    role: "ZPE systems",
    ...site("thornhill"),
    color: "#6a90a8",
    dialogueId: "dlg-thornhill",
    tip: "Ask about collars",
  },
  {
    id: "castillo",
    name: "June Castillo",
    role: "Perimeter med",
    ...site("castillo"),
    color: "#a87868",
    dialogueId: "dlg-castillo",
    tip: "Vitals & Carver",
  },
  {
    id: "voss",
    name: "Adele Voss",
    role: "Contracts / Gate",
    ...site("voss"),
    color: "#8a7a60",
    dialogueId: "dlg-voss",
    tip: "Ridge-7 clearance",
  },
  {
    id: "berger",
    name: "Berger",
    role: "Ark engineer",
    ...site("berger"),
    color: "#5a7068",
    dialogueId: "dlg-berger",
    tip: "Storm protocol",
  },
  {
    id: "tomas",
    name: "Tomas",
    role: "Office of the Voice",
    ...site("tomas"),
    color: "#7a6a90",
    dialogueId: "dlg-tomas",
    tip: "Quiet protocol",
    book2: true,
  },
];

/**
 * Tree convention since Phase 5: every tree starts at a short "hub" beat that
 * reads the same to a stranger and a regular. The full first-meeting monologue
 * (the pre-Phase-5 intro text, preserved verbatim) sits behind a `once:`
 * "met-<npc>" choice, so it plays exactly once and the hub decongests on every
 * later visit. Command branches gate on the "cmd-access" flag (seeded by the
 * store when the operative is Theo). Tier-1 trades carry their full
 * cost/payoff on the initiating choice; the target node is the flavor receipt.
 *
 * Tier-2 trades chain instead, because a choice takes one condition and a
 * `once` flag is raised the moment the choice is TAKEN: the hub choice gates
 * only on the tier-1 once-flag (no `once` of its own — entering the offer must
 * never lock the trade), the priced choice inside the chain gates on the item
 * and carries the tier-2 once-flag plus the full effect, and every chain node
 * keeps a "!tier2-flag" / "tier2-flag" fallback pair so no reachable state
 * renders zero choices. Multi-cost trades gate one item per hop and take
 * everything on the final choice, where every gate has provably passed —
 * `take:` floors at 0, so a take must never run against an unchecked pocket.
 */
export const DIALOGUES: Record<string, DialogueTree> = {
  "dlg-thornhill": {
    id: "dlg-thornhill",
    npcId: "thornhill",
    start: "hub",
    nodes: {
      hub: {
        speaker: "Dr. Thornhill",
        text: "Mind the cabling. Drift log is open — talk while I write.",
        choices: [
          { label: "Dr. Thornhill? ZPE systems?", once: "met-thornhill", next: "first" },
          { label: "Walk me through the collars.", next: "collars" },
          { label: "Any EM spike south?", next: "south" },
          { label: "About Carver.", if: "met-thornhill", next: "carver" },
          {
            label: "Command channel, Doctor. The real drift numbers.",
            if: "cmd-access",
            once: "thornhill-cmd",
            next: "drift-real",
          },
          {
            label: "I recovered a collar component.",
            if: "item:collar-component>=1",
            once: "thornhill-component",
            next: "component",
            effect: "take:collar-component:1|codex:collars:2|flag:collar-evidence",
          },
          {
            label: "A fern spore for a filter pass.",
            if: "item:fern-spore>=1",
            once: "trade-thornhill-filter",
            next: "trade-filter",
            effect: "take:fern-spore:1|upgrade:scan:0.15",
          },
          {
            label: "About a deeper filter pass.",
            if: "trade-thornhill-filter",
            next: "filter-2",
          },
          { label: "I'll let you work.", next: "end" },
        ],
      },
      first: {
        speaker: "Dr. Thornhill",
        text: "Collar drift is two millihertz overnight. Again. Carver would have recalibrated by hand before the shift change.",
        choices: [
          { label: "Walk me through the collars.", next: "collars" },
          { label: "Who was Carver?", next: "carver" },
          { label: "I'll let you work.", next: "end" },
        ],
      },
      collars: {
        speaker: "Dr. Thornhill",
        text: "Four ZPE cores under modulation collars. They flatten our signature into planetary noise. When they drift, the forest hears us.",
        choices: [
          { label: "I'll inspect the nearest collar.", next: "end", effect: "codex:collars" },
          { label: "Why not shut them down?", next: "shutdown" },
          { label: "How much drift before it matters?", next: "threshold" },
        ],
      },
      shutdown: {
        speaker: "Dr. Thornhill",
        text: "Cold cores kill us slow. Bare signatures kill us fast. Choose your speed.",
        choices: [{ label: "Understood.", next: "end", effect: "codex:collars" }],
      },
      threshold: {
        speaker: "Dr. Thornhill",
        text: "Lock-in holds to forty millihertz aggregate. Past that the cascade window opens and stays open. We have never crossed five. Officially.",
        choices: [
          { label: "Officially?", next: "official" },
          { label: "Keep it under forty, Doctor.", next: "end", effect: "codex:collars" },
        ],
      },
      official: {
        speaker: "Dr. Thornhill",
        text: "The published log is the one the colony can sleep on. Leave it there.",
        choices: [
          { label: "Leaving it.", next: "end", effect: "codex:collars" },
          {
            label: "Command override. The whole log.",
            if: "cmd-access",
            once: "thornhill-cmd",
            next: "drift-real",
          },
        ],
      },
      "drift-real": {
        speaker: "Dr. Thornhill",
        text: "Ava flagged your channel the day you landed, Colonel — I assumed this conversation was coming. Published drift is two millihertz a night. True aggregate is eight and climbing since storm season. Lock-in fails at forty.",
        choices: [
          { label: "And the night Carver died?", next: "drift-real-2" },
          {
            label: "Understood. It stays with me.",
            next: "end",
            effect: "codex:collars:2|flag:knows-drift",
          },
        ],
      },
      "drift-real-2": {
        speaker: "Dr. Thornhill",
        text: "Forty-three. The west collar read forty-three, and he held it anyway. A colony that counts millihertz stops planting, Colonel. Fear is a signature too. It drifts.",
        choices: [
          {
            label: "Your log, your call. For now.",
            next: "end",
            effect: "codex:collars:2|flag:knows-drift",
          },
        ],
      },
      south: {
        speaker: "Dr. Thornhill",
        text: "Something under the Titans is pulling on the lattice. Same band as certain neural-interface alloys from Earth.",
        choices: [
          {
            label: "I'll recon the ruin.",
            next: "end",
            effect: "hint:ruins|reveal:ruins",
          },
          { label: "What is the lattice, exactly?", next: "lattice" },
          { label: "Keep the cores quiet.", next: "end" },
        ],
      },
      lattice: {
        speaker: "Dr. Thornhill",
        text: "A planetary electromagnetic grid, older than the foundations we poured on it. The forest keeps its clocks by it. We built inside a metronome, and some nights I think it counts us.",
        choices: [{ label: "Logging it.", next: "end", effect: "codex:grid" }],
      },
      carver: {
        speaker: "Dr. Thornhill",
        text: "He signed the retrofit off with me. When the west collar went bad he was closer. That is the whole story, and it is not.",
        choices: [
          { label: "The south marker is his?", next: "carver-2" },
          { label: "Understood.", next: "end" },
        ],
      },
      "carver-2": {
        speaker: "Dr. Thornhill",
        text: "South field. Castillo keeps the line trimmed; I keep the drift low. Division of grief.",
        choices: [
          { label: "I'll walk the line he held.", next: "end", effect: "codex:carver" },
        ],
      },
      component: {
        speaker: "Dr. Thornhill",
        text: "Where did you— no. Don't tell me. Give it here.",
        choices: [{ label: "What is it?", next: "component-2" }],
      },
      "component-2": {
        speaker: "Dr. Thornhill",
        text: "West collar laminate, pre-retrofit stock. This piece failed under Carver's hands. I'll log it recovered. You log what it cost.",
        choices: [{ label: "Logged.", next: "end" }],
      },
      "trade-filter": {
        speaker: "Dr. Thornhill",
        text: "Live spores hold the lattice baseline better than any reference crystal we shipped from Earth. Filter's recalibrated — your scanner now reads the world the way the world keeps time.",
        choices: [{ label: "Appreciated, Doctor.", next: "end" }],
      },
      "filter-2": {
        speaker: "Dr. Thornhill",
        text: "The first pass taught your filter to hear the lattice. A second pass teaches it to subtract everything that isn't. I need two live spores — same bed, same night, still in phase. The pair is the measurement.",
        choices: [
          {
            label: "Two spores, still pulsing.",
            if: "item:fern-spore>=2",
            once: "trade-thornhill-filter-2",
            next: "trade-filter-2",
            effect: "take:fern-spore:2|upgrade:scan:0.15",
          },
          {
            label: "I'll walk the treeline for the pair.",
            if: "!trade-thornhill-filter-2",
            next: "end",
          },
          {
            label: "Just confirming the calibration holds.",
            if: "trade-thornhill-filter-2",
            next: "filter-2-holds",
          },
        ],
      },
      "trade-filter-2": {
        speaker: "Dr. Thornhill",
        text: "In phase. Good. Differencing them now — there. Your scanner has stopped listening to itself. What's left is the planet.",
        choices: [{ label: "Appreciated, Doctor.", next: "end" }],
      },
      "filter-2-holds": {
        speaker: "Dr. Thornhill",
        text: "It holds. A living reference doesn't drift — it corrects you. Carver would have appreciated the economy of that.",
        choices: [{ label: "So do I.", next: "end" }],
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
    start: "hub",
    nodes: {
      hub: {
        speaker: "June Castillo",
        text: "Sit down if you're bleeding. Talk fast if you're not.",
        choices: [
          { label: "Castillo? Perimeter med?", once: "met-castillo", next: "first" },
          { label: "How's the colony holding?", next: "colony" },
          { label: "Tell me about Carver.", next: "carver" },
          { label: "I need a stim pack.", once: "stim-issued", next: "heal", effect: "heal" },
          { label: "Another stim.", if: "stim-issued", next: "rationed" },
          {
            label: "One fern spore for a dose.",
            if: "item:fern-spore>=1",
            next: "spore-trade",
            effect: "take:fern-spore:1|heal|flag:castillo-spores",
          },
          {
            label: "What do you make of these quills?",
            if: "item:fang-quill>=1",
            once: "castillo-quills",
            next: "quills",
          },
          {
            label: "You've seen my file. Promethei Terra.",
            if: "cmd-access",
            once: "castillo-promethei",
            next: "promethei",
          },
          { label: "Stay sharp.", next: "end" },
        ],
      },
      first: {
        speaker: "June Castillo",
        text: "You're upright. Good. Half the perimeter detail comes back with dust-burn and excuses.",
        choices: [
          { label: "How's the colony holding?", next: "colony" },
          { label: "Tell me about Carver.", next: "carver" },
          { label: "Just checking in.", next: "end" },
        ],
      },
      colony: {
        speaker: "June Castillo",
        text: "We're not dying. That's the high bar. Kids still plant cherry starts by the Kaguyahime memorial.",
        choices: [
          { label: "Keep them safe.", next: "end" },
          { label: "About Carver…", next: "carver" },
          { label: "The kids?", next: "kids" },
        ],
      },
      kids: {
        speaker: "June Castillo",
        text: "Born here, or carried here small enough to sleep through the landing. They think amber is the only color a sky comes in. Keep it that way. Bring your reports home — leave the rest at the treeline.",
        choices: [{ label: "Copy that.", next: "end" }],
      },
      carver: {
        speaker: "June Castillo",
        text: "John Carver died keeping a collar from cascading. The south marker is his. Don't salute it if you won't walk the line he held.",
        choices: [
          { label: "I walk it.", next: "end", effect: "codex:new-eden|codex:carver" },
        ],
      },
      heal: {
        speaker: "June Castillo",
        text: "One dose. The forest already wants your pattern — don't hand it your vitals too. And that's the free one, operative. Med stock is rationed between supply runs; after the next storm cell clears, come argue with me again.",
        choices: [{ label: "Understood.", next: "end" }],
      },
      rationed: {
        speaker: "June Castillo",
        text: "Stock's rationed; charity was a one-dose program. Bring me live fern spores — the antiseptic fraction titrates out clean and I can stretch it. One spore, one dose. The forest can pay for what the forest does.",
        choices: [
          { label: "I'll gather spores.", next: "end" },
          {
            label: "Take one now.",
            if: "item:fern-spore>=1",
            next: "spore-trade",
            effect: "take:fern-spore:1|heal|flag:castillo-spores",
          },
        ],
      },
      "spore-trade": {
        speaker: "June Castillo",
        text: "Good spores — still holding their pulse. Titrating… there. Vitals green. The forest feeds you back, if you ask it right.",
        choices: [{ label: "Thanks, doc.", next: "end" }],
      },
      quills: {
        speaker: "June Castillo",
        text: "Shadowfang dorsals. You took one head-on — either you're good or you're overdue. Keep three intact for Voss; her armorer has been begging laminate stock off med for a month.",
        choices: [{ label: "Noted.", next: "end" }],
      },
      promethei: {
        speaker: "June Castillo",
        text: "…Colonel. Triage two, south ridge, Promethei Terra. I remember the arm coming in, and I remember it not slowing you down. Don't make me patch the rest of you to match.",
        choices: [
          { label: "The arm was the cheap part.", next: "promethei-2" },
          { label: "Long time ago, Castillo.", next: "end" },
        ],
      },
      "promethei-2": {
        speaker: "June Castillo",
        text: "That's what worries me. Cheap parts get spent.",
        choices: [{ label: "Noted, doc.", next: "end" }],
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
    start: "hub",
    nodes: {
      hub: {
        speaker: "Adele Voss",
        text: "The log is open. State your business.",
        choices: [
          { label: "Voss? Contracts and gate?", once: "met-voss", next: "first" },
          { label: "Clear me for Ridge-7.", next: "ridge" },
          { label: "What is Ridge-7?", next: "what" },
          {
            label: "Colonel Daniel. Skip the runaround.",
            if: "cmd-access",
            once: "voss-cmd",
            next: "ridge-cmd",
          },
          { label: "Who was Survey Team B?", if: "met-voss", next: "survey-b" },
          {
            label: "Three fang quills for the armorer.",
            if: "item:fang-quill>=3",
            once: "trade-voss-combat",
            next: "trade-combat",
            effect: "take:fang-quill:3|upgrade:combat:0.1",
          },
          {
            label: "The armorer's second requisition.",
            if: "trade-voss-combat",
            next: "quills-2",
          },
          {
            label: "Surplus quills. Two, flat rate.",
            if: "item:fang-quill>=2",
            next: "quill-buyback",
            effect: "take:fang-quill:2|heal",
          },
          { label: "Why the ledger obsession?", if: "met-voss", next: "records" },
          { label: "Just checking in.", next: "end" },
        ],
      },
      first: {
        speaker: "Adele Voss",
        text: "Gate records don't care about bravery. They care about who left, who returned, and who signed the risk waiver.",
        choices: [
          { label: "Clear me for Ridge-7.", next: "ridge" },
          { label: "What is Ridge-7?", next: "what" },
          { label: "Fair enough.", next: "end" },
        ],
      },
      what: {
        speaker: "Adele Voss",
        text: "Western basalt spine. Survey B planted caches and a mast. Storms hit the ridge first.",
        choices: [
          {
            label: "Authorize the trek.",
            next: "ridge",
            effect: "codex:ridge7|reveal:ridge7",
          },
          { label: "I'll stick to forest.", next: "end" },
        ],
      },
      ridge: {
        speaker: "Adele Voss",
        text: "Authorized. Plant the expedition beacon at the overlook. Don't hero the ridge at night.",
        choices: [
          {
            label: "Copy. Heading west.",
            next: "end",
            effect: "codex:ridge7|hint:ridge7|reveal:ridge7",
          },
        ],
      },
      "ridge-cmd": {
        speaker: "Adele Voss",
        text: "…Colonel. Your waiver has been on file since you made landfall — command privilege, countersigned above my pay grade and most of the weather's. Ridge-7 is yours. Plant the beacon at the overlook. And Colonel: the ridge does not read rank.",
        choices: [
          {
            label: "Noted. Heading west.",
            next: "end",
            effect: "codex:ridge7|hint:ridge7|reveal:ridge7",
          },
        ],
      },
      "survey-b": {
        speaker: "Adele Voss",
        text: "Eight names on the outbound log, before my time. Cache trail runs alpha, bravo, the ridge, the coast. Their return entry is one line: ALL IN. NO FURTHER TRANSMISSIONS. Nobody has ever amended it.",
        choices: [
          { label: "They all came back?", next: "survey-b-2" },
          { label: "I'll read their caches.", next: "end" },
        ],
      },
      "survey-b-2": {
        speaker: "Adele Voss",
        text: "All eight. Walking, dark, three weeks overdue, and not one of them filed so much as a weather note afterward. Recover the caches and I can finally amend the record. That's not sentiment — open files rot.",
        choices: [
          { label: "I'll close the file.", next: "end", effect: "flag:voss-surveyb" },
        ],
      },
      "trade-combat": {
        speaker: "Adele Voss",
        text: "Quills to the armorer, plates to the press. Collect them on your way out — hard plates re-laminated with fang laminate. There's a poem in that. The log says I didn't say so.",
        choices: [{ label: "Appreciated.", next: "end" }],
      },
      "quills-2": {
        speaker: "Adele Voss",
        text: "Standing requisition: five quills, intact, no splits. The first plates tested out and now half the perimeter detail wants the laminate. I don't run waiting lists. I run stock.",
        choices: [
          {
            label: "Five quills, intact, on the counter.",
            if: "item:fang-quill>=5",
            once: "trade-voss-combat-2",
            next: "trade-combat-2",
            effect: "take:fang-quill:5|upgrade:combat:0.15",
          },
          {
            label: "I'll fill the requisition.",
            if: "!trade-voss-combat-2",
            next: "end",
          },
          {
            label: "Requisition's filled. Logging my exit.",
            if: "trade-voss-combat-2",
            next: "end",
          },
        ],
      },
      "trade-combat-2": {
        speaker: "Adele Voss",
        text: "Counted, logged, closed. Full overlay this run — plates, joints, the neck seam everyone forgets until a fang doesn't. The ledger now lists you as expensive to lose. Stay that way.",
        choices: [{ label: "Every column open.", next: "end" }],
      },
      "quill-buyback": {
        speaker: "Adele Voss",
        text: "Flat rate, no haggling: two quills, one med chit. Laminate stock never sits — the armorer clears it faster than I can log it. Chit's stamped; Castillo honors it on the spot. Spend it before you need it.",
        choices: [{ label: "Pleasure doing commerce.", next: "end" }],
      },
      records: {
        speaker: "Adele Voss",
        text: "Because memory dies and the ledger doesn't. Every name that ever crossed this gate is in it, and every one of them comes back — one column or the other.",
        choices: [
          { label: "Which column am I in?", next: "records-2" },
          { label: "Fair.", next: "end" },
        ],
      },
      "records-2": {
        speaker: "Adele Voss",
        text: "Open entry. Keep it that way.",
        choices: [{ label: "Plan to.", next: "end" }],
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
    start: "hub",
    nodes: {
      hub: {
        speaker: "Berger",
        text: "Hear that? …No? Good. Means you've still got time.",
        choices: [
          { label: "Berger? The ark engineer?", once: "met-berger", next: "first" },
          { label: "Storm protocol?", next: "storm" },
          { label: "How's the Verne hull?", next: "verne" },
          { label: "That hull plate by your bench —", if: "met-berger", next: "plate" },
          {
            label: "One prism shard for a servo tune.",
            if: "item:prism-shard>=1",
            once: "trade-berger-servo",
            next: "trade-servo",
            effect: "take:prism-shard:1|upgrade:stamina:0.1",
          },
          {
            label: "That servo tune. Can you go deeper?",
            if: "trade-berger-servo",
            next: "servo-2",
          },
          { label: "Keep an ear out.", next: "end" },
        ],
      },
      first: {
        speaker: "Berger",
        text: "Ark metal sings when the ion front is twenty minutes out. You learn to hear it or you learn the hard way.",
        choices: [
          { label: "Storm protocol?", next: "storm" },
          { label: "How's the Verne hull?", next: "verne" },
          { label: "Good ear.", next: "end" },
        ],
      },
      storm: {
        speaker: "Berger",
        text: "When the sky goes copper and the ferns black out, get off high ground. Fangs hunt the noise. Towers are islands.",
        choices: [
          { label: "I'll weather one.", next: "end", effect: "codex:weather|hint:storm" },
          { label: "How do you hear it coming?", next: "ozone" },
        ],
      },
      ozone: {
        speaker: "Berger",
        text: "Front pushes charge ahead of itself. Ark metal picks it up first, then your fillings, then the ferns go dark. By the time you smell burnt citrus you've already spent half your lead.",
        choices: [
          { label: "I'll trust the metal.", next: "end", effect: "codex:weather" },
        ],
      },
      verne: {
        speaker: "Berger",
        text: "She's quiet under the islands now. We hid and lived. That was the whole strategy.",
        choices: [
          { label: "Hard lesson.", next: "end" },
          { label: "Under the islands — intact?", next: "islands" },
        ],
      },
      islands: {
        speaker: "Berger",
        text: "Intact where it counts. She ballasted down easy and went cold by choice. A ship that isn't transmitting isn't dead — she's holding her breath. Same as the colony. Silence is just another hull. You keep it patched.",
        choices: [
          { label: "And if the hull cracks?", next: "doubt" },
          { label: "Hard way to keep a ship.", next: "end", effect: "codex:verne" },
        ],
      },
      doubt: {
        speaker: "Berger",
        text: "Then you learn what's outside. I re-rivet the quiet every day, same as I did her frames. Ask Tomas for the theology; I just do the maintenance.",
        choices: [{ label: "Maintenance it is.", next: "end" }],
      },
      plate: {
        speaker: "Berger",
        text: "Frame seven, forward. Cut it off her myself before ballast-down. A ship that size, you keep one piece where the sun still finds it. Don't call it sentiment — call it a maintenance schedule for remembering.",
        choices: [{ label: "Maintenance. Sure.", next: "end", effect: "codex:verne" }],
      },
      "trade-servo": {
        speaker: "Berger",
        text: "Prism lattice grinds finer than anything in stores. Servo races have never run this smooth — suit'll carry you another klick before it complains. Don't waste the klick.",
        choices: [{ label: "Won't waste it.", next: "end" }],
      },
      "servo-2": {
        speaker: "Berger",
        text: "Deep tune's a rebuild, not a polish. Two prism shards for the races, and one collar component for the governor — retrofit laminate holds a tolerance the colony printers can't touch. Bring me all three pieces.",
        choices: [
          {
            label: "Shards I have. Two of them.",
            if: "item:prism-shard>=2",
            next: "servo-2-gov",
          },
          {
            label: "I'll source the pieces.",
            if: "!trade-berger-servo-2",
            next: "end",
          },
          {
            label: "The rebuild's still running smooth.",
            if: "trade-berger-servo-2",
            next: "end",
          },
        ],
      },
      "servo-2-gov": {
        speaker: "Berger",
        text: "And the governor piece? No component, no rebuild — I'm not machining that tolerance out of raw stock, and I'm not asking Thornhill twice.",
        choices: [
          {
            label: "One collar component. Take all three.",
            if: "item:collar-component>=1",
            once: "trade-berger-servo-2",
            next: "trade-servo-2",
            effect:
              "take:prism-shard:2|take:collar-component:1|upgrade:stamina:0.15",
          },
          {
            label: "The west collar sheds them. Back soon.",
            if: "!trade-berger-servo-2",
            next: "end",
          },
          {
            label: "Never mind — the governor's already seated.",
            if: "trade-berger-servo-2",
            next: "end",
          },
        ],
      },
      "trade-servo-2": {
        speaker: "Berger",
        text: "Races ground, governor seated, torque like she just rolled off the yard. Suit'll stop arguing with you around the twentieth klick now instead of the tenth. Go wear it out.",
        choices: [{ label: "Twenty klicks it is.", next: "end" }],
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
    start: "hub",
    nodes: {
      hub: {
        speaker: "Tomas",
        text: "You walk loudly, operative, for someone living under a covenant of quiet.",
        choices: [
          { label: "Tomas. Office of the Voice.", once: "met-tomas", next: "first" },
          { label: "Explain quiet protocol.", next: "quiet" },
          { label: "Kaguyahime?", next: "kaguya" },
          { label: "What does the Voice listen for?", if: "met-tomas", next: "listen" },
          { label: "The chamber's word. REMEMBER.", if: "met-tomas", next: "remember" },
          { label: "I should go.", next: "end" },
        ],
      },
      first: {
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
        choices: [{ label: "Understood.", next: "end", effect: "codex:quiet" }],
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
          { label: "The cherry memorials?", next: "cherry" },
        ],
      },
      cherry: {
        speaker: "Tomas",
        text: "Grown from stock the Kaguyahime carried out of Earth's orchards. They plant theirs facing our vector; we plant ours facing theirs. Two shores, promising one another they exist, in a language nothing else can read.",
        choices: [{ label: "Flowers as doctrine.", next: "end" }],
      },
      listen: {
        speaker: "Tomas",
        text: "Patterns with intent. The lattice hums and the ferns keep its time — that is the planet talking to itself. We listen for anything that talks to us.",
        choices: [
          { label: "Has anything?", next: "listen-2" },
          { label: "Keep listening.", next: "end" },
        ],
      },
      "listen-2": {
        speaker: "Tomas",
        text: "Once. Before the doctrine had a name. Ask the gate ledger about Survey Team B — then ask why their final entry is a promise not to speak.",
        choices: [
          { label: "I'll read their caches.", next: "end", effect: "flag:tomas-surveyb" },
        ],
      },
      remember: {
        speaker: "Tomas",
        text: "An imperative addressed to no one — or to any audience at all. The Voice files it as the oldest transmission on this world. We are careful not to be the ones who answer it.",
        choices: [
          { label: "Careful how?", next: "quiet" },
          { label: "Noted.", next: "end" },
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
  { id: "cache-a", label: "Cache Alpha", ...site("cache-a"), kind: "cache" },
  { id: "cache-b", label: "Cache Bravo", ...site("cache-b"), kind: "cache" },
  { id: "cache-r", label: "Ridge cache", ...site("cache-r"), kind: "cache" },
  { id: "cache-c", label: "Coast cache", ...site("cache-c"), kind: "cache", book2: true },
  { id: "sensor", label: "Sensor mast", x: 12, z: 58, kind: "poi" },
  { id: "ruin", label: "Ruin approach", ...site("ruin"), kind: "ruin" },
  { id: "ridge7", label: "Ridge-7", x: -110, z: 55, kind: "ridge" },
  {
    id: "coast",
    label: "Kaguyahime memorial",
    ...site("coast-memorial"),
    kind: "coast",
    book2: true,
  },
  { id: "npc-t", label: "Thornhill", ...site("thornhill"), kind: "npc" },
  { id: "npc-c", label: "Castillo", ...site("castillo"), kind: "npc" },
];

/**
 * Named survey grids — the HUD splashes a title card on FIRST entry into each
 * circle (flag "region-<id>", persisted free by raiseFlag). Circles are
 * deliberately sparse and mostly disjoint; where two touch, the HUD shows
 * whichever contains the operative first and the other lands on a later poll.
 * Grid numbers are survey-ledger fiction; Ridge-7 sits in grid seven on
 * purpose. The book2 shore respects passesCeiling like every other pin.
 */
export const REGIONS: RegionDef[] = [
  {
    id: "plateau",
    name: "GRID 1 — COLONY PLATEAU",
    sub: "surveyed — New Eden settlement ground",
    x: 0,
    z: 12,
    r: 24,
  },
  {
    id: "south-gate",
    name: "GRID 2 — SOUTH GATE LINE",
    sub: "perimeter — light towers hold to here",
    x: 0,
    z: 44,
    r: 12,
  },
  {
    id: "titans",
    name: "GRID 3 — TITANS TREELINE",
    sub: "partial survey — canopy floor unmapped",
    x: 0,
    z: 82,
    r: 24,
  },
  {
    id: "herd-plains",
    name: "GRID 4 — HERD PLAINS",
    sub: "open range — approach on arcs",
    x: -55,
    z: 95,
    r: 26,
  },
  {
    id: "ruin-approach",
    name: "GRID 5 — RUIN APPROACH",
    sub: "anomaly perimeter — catalog and withdraw",
    ...site("ruin"),
    r: 26,
  },
  {
    id: "kaguyahime-shore",
    name: "GRID 6 — KAGUYAHIME SHORE",
    sub: "receive-only — far-continent vector",
    ...site("coast-memorial"),
    r: 28,
    book2: true,
  },
  {
    id: "ridge7-approach",
    name: "GRID 7 — RIDGE-7 APPROACH",
    sub: "unsurveyed — expedition waiver on file",
    x: -112,
    z: 56,
    r: 30,
  },
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
    ...site("gen-west"),
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
    ...site("ruin"),
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
    ...site("coast-memorial"),
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
  // On the pad south of the storage building, facing the dome. The obvious
  // (2, 20) sat INSIDE the 9 m storage box at (4, 22) — a deep-linked player
  // spawned into an unlit interior and saw a wall of black.
  colony: { x: -4, z: 30, yaw: 0 },
  ridge7: { x: -100, z: 50, yaw: -Math.PI / 2 },
  ruins: { x: 18, z: 140, yaw: Math.PI },
  coast: { x: 20, z: 185, yaw: Math.PI },
  treeline: { x: 0, z: 70, yaw: Math.PI },
};

/**
 * Chapter scene links — the novel site's per-chapter "Visit this scene" hook
 * (`?chapter=N`, or `chapter` on a fieldops:deeplink message). Each preset
 * stages a spawn for the next deploy, pins the clock and the sky to the
 * chapter's hour and weather, and queues `note` as the arrival ticker line.
 *
 * Rules the store enforces (applyDeepLink):
 * - `ceiling` only ever RAISES the reader's spoiler ceiling toward the
 *   preset — a chapter link proves the reader reached that page, but it never
 *   lowers a ceiling they already opened.
 * - QA pins (`?tod`, `?wx`) and an explicit `?spawn` in the same URL win.
 *
 * `tod` is the 0..1 world clock (night is < 0.25 or > 0.78 — see isNight);
 * notes reuse the codex chapterRef teasers verbatim where one exists, so the
 * link, the codex funnel, and the book page all speak the same line.
 */
export const CHAPTER_SCENES: Record<
  string,
  {
    spawn: SpawnPoint;
    tod: number;
    wx: WeatherKind;
    ceiling: SpoilerCeiling;
    note: string;
  }
> = {
  "1": {
    spawn: "colony",
    tod: 0.27,
    wx: "clear",
    ceiling: "book1",
    note: "CH. 1 — the first amber dawn over a crimson sea",
  },
  "2": {
    spawn: "colony",
    tod: 0.45,
    wx: "haze",
    ceiling: "book1",
    note: "CH. 2 — what came home from Promethei Terra",
  },
  "3": {
    spawn: "colony",
    tod: 0.5,
    wx: "clear",
    ceiling: "book1",
    note: "CH. 3 — how the plateau was chosen, and what it cost",
  },
  "4": {
    spawn: "colony",
    tod: 0.74,
    wx: "haze",
    ceiling: "book1",
    note: "CH. 4 — the machines that keep a colony invisible",
  },
  "5": {
    spawn: "treeline",
    tod: 0.5,
    wx: "haze",
    ceiling: "book1",
    note: "CH. 5 — first walk under a kilometer of canopy",
  },
  "6": {
    spawn: "treeline",
    tod: 0.85,
    wx: "clear",
    ceiling: "book1",
    note: "CH. 6 — the night the understory kept time",
  },
  "7": {
    spawn: "south-gate",
    tod: 0.7,
    wx: "haze",
    ceiling: "book1",
    note: "CH. 7 — the shift Carver did not walk away from",
  },
  "8": {
    spawn: "treeline",
    tod: 0.82,
    wx: "haze",
    ceiling: "book1",
    note: "CH. 8 — a hunt that went both ways",
  },
  "9": {
    spawn: "ridge7",
    tod: 0.45,
    wx: "clear",
    ceiling: "book1",
    note: "CH. 9 — west along the basalt spine",
  },
  "10": {
    spawn: "ridge7",
    tod: 0.6,
    wx: "storm",
    ceiling: "book1",
    note: "CH. 10 — the sky goes copper",
  },
  "11": {
    spawn: "treeline",
    tod: 0.55,
    wx: "rain",
    ceiling: "book1",
    note: "CH. 11 — the long walk back through the rain",
  },
  "12": {
    spawn: "ruins",
    tod: 0.5,
    wx: "haze",
    ceiling: "book1",
    note: "CH. 12 — the word under the Titans",
  },
  "13": {
    spawn: "colony",
    tod: 0.88,
    wx: "clear",
    ceiling: "book1",
    note: "CH. 13 — what the lattice counts after dark",
  },
  "14": {
    spawn: "colony",
    tod: 0.62,
    wx: "haze",
    ceiling: "book1",
    note: "CH. 14 — the ops floor holds its breath",
  },
  "15": {
    spawn: "coast",
    tod: 0.74,
    wx: "haze",
    ceiling: "book2early",
    note: "CH. 15 — the doctrine gets its name",
  },
  "16": {
    spawn: "coast",
    tod: 0.75,
    wx: "clear",
    ceiling: "book2early",
    note: "CH. 16 — the far shore answers",
  },
};

export const WORLD = {
  colonyCenter: [0, 0, 8] as const,
  southGate: [0, 0, 42] as const,
  treelineZ: 68,
  ruinPos: sitePos("ruin"),
  herdPos: [-55, 0, 95] as const,
  ridgeOverlook: sitePos("ridge-beacon"),
  coastMemorial: sitePos("coast-memorial"),
  domeHatch: sitePos("dome-command"),
  bounds: 260,
  fernPulse: 4.7,
  dayLengthSec: 480,
};

/**
 * Survey Team B's cache logs — a serialized found-document story, one fragment
 * per cache, keyed by the cache's entity id. Read in order (alpha, bravo,
 * ridge, coast) they explain why the expedition went silent; the coast
 * fragment carries the reveal and ships behind the same book2 gate as its
 * cache. Canon: canon/CANON.md § Survey Team B.
 */
export const CACHE_LOGS: Record<string, { title: string; body: string }> = {
  "cache-a": {
    title: "Survey B — log 1 of 4",
    body: "Outbound, day one. Eight of us, full kit, relay mast in three loads. Treeline crossed at amber-high. The fern beds pulse together — I timed it myself: 4.7 seconds, steady as a ship's clock. Ferrandiz says the forest is listening politely. We laughed. Cache placed per doctrine, a quarter of everything, buried dry. If you are reading this, we are ahead of you. Follow the masts. — S. Okafor, lead",
  },
  "cache-b": {
    title: "Survey B — log 2 of 4",
    body: "Day four. The herd moved around us in arcs all morning — never closer, never farther. Ferrandiz swears the same three fangs have crossed our back-trail at the same hour, two days running. Same hour. We vary the route; they vary with us, one day behind. Instruments drift near the big trees — something under the floor pulls the needles. Cache placed. Moving west for the ridge, faster than planned. — S.O.",
  },
  "cache-r": {
    title: "Survey B — log 3 of 4",
    body: "Day nine. Ridge-7. Mast up at first light, and the far continent answered our test tone with clean carrier. Kaguyahime is alive. Eight people wept on a basalt spine and I am not sorry. Tomorrow we take the relay down the south face to the water and open a proper channel — voice, not tones. History, if the weather holds. Cache placed at the overlook. Wish us luck. — S.O.",
  },
  "cache-c": {
    title: "Survey B — final log",
    body: "We opened the channel at dawn. Kaguyahime answered — and then something else did, on the same band, underneath. It repeated our own handshake back to us with fourteen seconds missing. Ferrandiz ran the gap twice: nothing lost, something removed. We cut power, buried the relay under this cache, and we are walking home dark. All in. No further transmissions. If you found this: do not open the channel. Do not answer the quiet. — S. Okafor, last entry",
  },
};

/**
 * Fixed-site lore, keyed by interactable entity id. `codex` names the entry
 * unlocked on first read. Hale content deliberately asserts nothing beyond a
 * name on equipment tags and a direction of travel — see canon/CANON.md § Hale.
 */
export const SITE_LOGS: Record<
  string,
  { title: string; body: string; codex?: string }
> = {
  "carver-marker": {
    title: "South field marker",
    body: "JOHN CARVER. ZPE RETROFIT. HE HELD THE COLLAR. A hand-cut basalt slab, edges worked smooth by weather and by visitors. Someone keeps the line to the gate trimmed. Someone else leaves fresh solder wire twisted at the base — engineer's flowers. The colony does not salute the marker. The colony walks the line the marker holds.",
    codex: "carver",
  },
  "verne-plate": {
    title: "Verne hull plate",
    body: "A meter of ark hull, frame seven forward, mounted where the sun crosses it. Scoured to bare metal by the long dark and one atmosphere entry — except one corner: original paint, hand-caulked against the weather, stencil letters half surviving. VERN—. Berger's bench faces the plate. The bench, not the colony.",
    codex: "verne",
  },
  "hale-camp": {
    title: "Cold camp — Ridge-7",
    body: "One shelter frame, collapsed with its guylines still cleated — struck in a hurry, or never struck at all. Ration foils gone brittle, seasons old. A survey tripod with no instrument on it. Every equipment tag is stamped the same way: HALE. No log. No marker. No remains. Boot tracks leave the camp south, off the ridge, toward the Titans. Nothing tracks back.",
    codex: "hale-camp",
  },
};

/**
 * Firewatch-style comms layer. Theo hears Ava (dry, protective, half a ghost
 * of Promethei Terra); every other operative hears the colony net (pure
 * procedure). One entry per trigger; the store owns when triggers fire.
 */
export const AVA_LINES: { trigger: AvaTrigger; ava: string; net: string }[] = [
  {
    trigger: "treeline",
    ava: "Treeline. The ferns will read you before the fangs do. Walk like you're a rumor.",
    net: "PERIM — treeline crossed. Log route and ETA.",
  },
  {
    trigger: "tracked",
    ava: "Two contacts folding in behind your last three waypoints. They're not following you, Theo — they're finishing your sentence. Change the ending.",
    net: "THREAT — pattern shadow on operative route. Vary transit. Break pattern.",
  },
  {
    trigger: "storm-in",
    ava: "Ion cell inbound. I lose fidelity in the noise — which I hate — and the fangs gain it. Walls, Theo. Find some.",
    net: "WX — ion cell inbound. Seek hard shelter. Comms degradation expected.",
  },
  {
    trigger: "ruin-near",
    ava: "That alloy is running at the same temperature I am. I have opinions about that. None of them are 'go closer.' You're going closer.",
    net: "NAV — anomaly perimeter. Catalog and withdraw. No transmission.",
  },
  {
    trigger: "nightfall",
    ava: "Nightfall. The lattice gets loud and everything that hunts goes quiet. Survey window's open. So is everything else's.",
    net: "OPS — dark cycle begins. Bioluminescence at peak. Predator activity elevated.",
  },
  {
    trigger: "first-kill",
    ava: "It's down. Log the specimen and keep your hands steady — the first one is supposed to cost something. Promethei taught us what it costs when it stops costing.",
    net: "CONTACT — hostile neutralized. Recover specimen material. Report expenditure.",
  },
  {
    trigger: "ambush-seen",
    ava: "Eyeshine at your usual crossing — ahead of you, not behind. They solved your route, Theo. Be flattered somewhere else.",
    net: "THREAT — ambush posture at learned position. Reroute. Do not engage on their ground.",
  },
  {
    trigger: "coast",
    ava: "The memorial faces the far shore. They planted trees at each other through all the quiet years. I keep an archive of everything I'm not allowed to say to that carrier. It rhymes.",
    net: "NAV — coast memorial. Log and observe. Carrier band is receive-only.",
  },
  {
    trigger: "broadcast",
    ava: "If you open this carrier, everything that has ever listened learns our name in one pass. I'll transmit clean — that's my job. Objecting first is also my job.",
    net: "ALERT — uncollared transmission requested. Doctrine conflict. Confirm authorization.",
  },
];
