# 2121 EXODUS — Canon Bible for Field Ops: Lupus Stella

**Purpose.** The novel manuscripts are deliberately not in this repo. Without a
bible, the game will drift from the books — the exact failure that destroys
trust with the readers most likely to evangelize the series. This file is the
contract between the game and the fiction.

**How to use it.** Every writing session (human or AI-assisted) loads this file
as mandatory context before touching authored strings in `src/game/data.ts` or
the content modules under `src/game/content/`. `npm run canon:lint` fails the
build if the game uses a canon term that has no entry here.

**Status vocabulary**

| Status | Meaning |
|---|---|
| `VERIFIED` | Confirmed against the manuscript. Cite chapter. The game must not contradict it. |
| `GAME-ASSERTED` | Invented by or first stated in the game. Not yet in a book. Safe to keep, but see *Feedback to manuscript*. |
| `NEEDS-CHECK` | The game asserts it; nobody has confirmed it against the manuscript. **Resolve before the next content drop.** |

**Ceiling vocabulary** — what the game may reveal at each spoiler tier
(`src/game/types.ts` `SpoilerCeiling`):

| Tier | Reveals |
|---|---|
| `book1` | New Eden, the forest and the Titans, the ruin and REMEMBER. Default for fresh visitors. |
| `book2early` | Adds the Kaguyahime carrier, the quiet protocol as doctrine, the Office of the Voice. |
| `book2late` | *(reserved — unlocks at Book II launch)* |
| `book3` | *(reserved)* |

---

## Places

### Lupus Stella (Wolf 1061c)
- **Status:** NEEDS-CHECK
- **Game asserts:** Habitable. 1.15 g. A 28-hour day. Crimson seas under an amber sky. The ecosystem is aggressive, not dormant.
- **Ceiling:** `book1`
- **Notes:** The 28-hour figure drives `WORLD.dayLengthSec` and the HUD clock (`timeLabel`). If the manuscript states a different day length, the game clock and every "Day 247" reference must move with it.

### New Eden Colony
- **Status:** NEEDS-CHECK
- **Game asserts:** Plateau settlement. Prefab domes, four ZPE generators under modulation collars, light towers, a south field marker for John Carver.
- **Ceiling:** `book1`
- **Open question:** Colony population? The game implies a few dozen but never states a number — safer to keep it unstated than to guess.

### The Obsidian Titans
- **Status:** NEEDS-CHECK
- **Game asserts:** Kilometre-scale canopy. Trunks four to five metres across. Bark like cooled lava, pale inner wood where the skin cracks.
- **Ceiling:** `book1`

### Ridge-7
- **Status:** GAME-ASSERTED
- **Game asserts:** Western basalt spine with a clear sightline toward the far continent. Expedition caches left by Survey Team B before the quiet protocol.
- **Ceiling:** `book1`
- **Feedback to manuscript:** Ridge-7, Survey Team B, and the expedition-cache trail originate here. If Book II wants them, this is the source of truth.

### Kaguyahime
- **Status:** NEEDS-CHECK
- **Game asserts:** Far-continent Japanese ark colony, far south across crimson water. Cherry memorials at New Eden face their vector. Their carrier was silent under the quiet protocol and now answers analysis pings. The cherry stock came out of Earth's orchards; each colony plants facing the other's vector (Tomas, Phase 5, GAME-ASSERTED).
- **Ceiling:** `book2early`
- **Phase 5 addition (GAME-ASSERTED):** Before the doctrine existed, their carrier answered Survey Team B's Ridge-7 test tones with clean carrier, and their reply at the coast was underlaid by a third signal — see *Survey Team B*.

### The pre-human ruin / the chamber
- **Status:** NEEDS-CHECK
- **Game asserts:** Dark alloy at ambient temperature matching certain neural interfaces. Star maps. One word: REMEMBER.
- **Ceiling:** `book1`
- **Note:** This is the game's climax and the novel's central image. Any change to what the chamber says or shows is a canon-level decision, not a content tweak.

---

## People

### Theo Daniel — COL (Ret.), callsign DANIEL
- **Status:** NEEDS-CHECK
- **Game asserts:** USSF. Promethei Terra. Cybernetic left arm. Command authority; colony staff open up faster under his callsign (this is now mechanical — `commandBonus` gates dialogue branches).
- **Ceiling:** `book1`

### Ava
- **Status:** NEEDS-CHECK
- **Game asserts:** Theo's neural interface suite. "Half partner, half ghost of Promethei Terra." Field Ops routes low-band queries through her filters.
- **Ceiling:** `book1`
- **Open question:** How much personality/agency does Ava have in the books? The game's Ava comms layer puts words in her mouth — this needs the tightest manuscript alignment of anything here.
- **Phase 5 note:** `AVA_LINES` in `src/game/data.ts` now carries nine first-person Ava lines (one per comms trigger) — the largest single body of invented Ava dialogue in the project. Register used: dry, protective, half-ghost; she claims temperature kinship with the ruin alloy and keeps "an archive of everything I'm not allowed to say" to the Kaguyahime carrier. Every line is GAME-ASSERTED and individually replaceable.

### John Carver
- **Status:** NEEDS-CHECK
- **Game asserts:** Died keeping a collar from cascading. The south field marker is his.
- **Ceiling:** `book1`
- **Phase 5 additions (GAME-ASSERTED):** It was the *west* collar; he co-signed the retrofit with Thornhill; the marker epitaph reads "JOHN CARVER. ZPE RETROFIT. HE HELD THE COLLAR." Castillo trims the line to the gate, Thornhill keeps the drift low, and someone leaves solder wire at the base. A dedicated `carver` codex entry now exists (`carver-marker` site).

### Dr. Thornhill — ZPE systems
- **Status:** GAME-ASSERTED
- **Game asserts:** Designed the modulation-collar retrofit. Tracks nightly collar drift in millihertz. Carver signed the retrofit off with him.
- **Ceiling:** `book1`
- **Phase 5 addition (GAME-ASSERTED, command branch):** He keeps two logs. Published drift is 2 mHz/night; true aggregate is 8 mHz and climbing since storm season; cascade lock-in fails past 40 mHz; the night Carver died the west collar read 43. His stated reason for the double ledger: "a colony that counts millihertz stops planting." These numbers are load-bearing in the `collars` codex stage 2 — if the books quantify drift differently, both the dialogue and the codex stage must move.

### June Castillo — perimeter med
- **Status:** GAME-ASSERTED · **Ceiling:** `book1`
- **Phase 5 additions (GAME-ASSERTED):** Served triage ("triage two, south ridge") at Promethei Terra and treated Theo's arm — this makes her a canon-adjacent invention; check against any named Promethei medical staff. Rations stim doses between supply runs; titrates an antiseptic fraction from Lumina Fern spores.

### Adele Voss — contracts / gate
- **Status:** GAME-ASSERTED · **Ceiling:** `book1`
- **Phase 5 additions (GAME-ASSERTED):** Keeps the gate ledger holding Survey Team B's unamended closing entry ("ALL IN. NO FURTHER TRANSMISSIONS."). Brokers fang-quill laminate to the colony armorer. Holds a standing command waiver for Theo, on file since landfall.

### Berger — ark engineer
- **Status:** GAME-ASSERTED
- **Game asserts:** Knows the *Verne*'s hull. Reads incoming ion fronts by the sound of ark metal.
- **Ceiling:** `book1`
- **Phase 5 additions (GAME-ASSERTED):** Cut a plate from the *Verne*'s frame seven forward before ballast-down and keeps it mounted by his bench (the `verne-plate` site). Doctrine stance: "silence is just another hull — you keep it patched."

### Tomas — Office of the Voice
- **Status:** NEEDS-CHECK · **Ceiling:** `book2early`
- **Phase 5 note:** Tomas now points players toward Survey Team B ("before the doctrine had a name") and speaks of the chamber word as "the oldest transmission on this world." Both are GAME-ASSERTED framings, not book facts.

### Hale
- **Status:** NEEDS-CHECK
- **Game asserts:** "Hale's people" are named in the chamber reveal. The game now places a Hale expedition camp on Ridge-7 to pay the name off.
- **Ceiling:** `book1`
- **Open question:** Who is Hale, and is the expedition camp compatible with the books? **Highest-priority NEEDS-CHECK in this file** — the game currently invents around a name it does not understand.
- **Phase 5 floor (deliberate):** The `hale-camp` site text and `hale-camp` codex entry assert *only*: weathered gear seasons old, the name HALE on every equipment tag, and boot tracks leaving south toward the Titans with no return trail. No identity, no head-count, no fate, no dates. Any expansion of Hale content must clear this entry first.

### Survey Team B
- **Status:** GAME-ASSERTED
- **Game asserts:** Eight-member expedition, pre-quiet-protocol, led by S. Okafor (one other member named: Ferrandiz). Left the four-cache trail (alpha, bravo, ridge, coast) with serialized logs (`CACHE_LOGS` in `src/game/data.ts`). On Ridge-7 their relay reached Kaguyahime with test tones. At the coast they opened a voice channel; Kaguyahime answered, and something else answered underneath — their own handshake repeated back with fourteen seconds missing ("nothing lost, something removed"). They cut power, buried the relay, and walked home dark, three weeks overdue, all eight alive. Gate ledger closes with "ALL IN. NO FURTHER TRANSMISSIONS," never amended.
- **Ceiling:** Logs 1–3 are `book1`; the coast log (the contact reveal) ships behind the same `book2` gate as its cache.
- **Feedback to manuscript:** The game strongly implies this contact preceded and shaped the quiet protocol. If Book II gives the doctrine a different origin, the coast log and Tomas's "before the doctrine had a name" line must be rewritten together. Okafor and Ferrandiz are game inventions available to the books.

---

## Technology and doctrine

### ZPE generators and modulation collars
- **Status:** NEEDS-CHECK
- **Game asserts:** Four cores under collars that flatten the colony's signature into planetary noise. They drift a few millihertz a night. Cold cores kill slowly; bare signatures kill fast.
- **Ceiling:** `book1`

### The quiet protocol
- **Status:** NEEDS-CHECK
- **Game asserts:** No unfiltered broadcasts, no naked ZPE. "We hid and lived." The covenant is silence until something answers correctly.
- **Ceiling:** `book2early`
- **Note:** The game's ending choice (broadcast vs. silence) dramatizes this doctrine. Whether a player may canonically violate it is a **story decision for the author**, not a design one — the game treats both endings as player fiction, not canon.
- **Phase 5 note (GAME-ASSERTED origin implication):** The Survey Team B coast log implies the doctrine crystallized after their contact event ("before the doctrine had a name" — Tomas). This is the game's invented origin story for the protocol; see *Survey Team B* for the rewrite trigger.

### The EM lattice
- **Status:** GAME-ASSERTED
- **Game asserts:** A planetary electromagnetic grid beneath the foundations. The forest keeps time with it; so does the chamber.
- **Ceiling:** `book1`
- **Feedback to manuscript:** The lattice as a *timekeeping* system, and the fern pulse locking to it, originate here.

### The *Verne*
- **Status:** NEEDS-CHECK
- **Game asserts:** An ark, now quiet "under the islands."
- **Ceiling:** `book1`
- **Phase 5 additions (GAME-ASSERTED):** Ballast-down was deliberate — "she ballasted down easy and went cold by choice"; the game frames her as holding her breath, not dead. Berger's memorial hull plate (frame seven forward) is the `verne-plate` site and the `verne` codex entry. If the books sink, strand, or destroy the *Verne* instead, all three must change together.

### Promethei Terra
- **Status:** NEEDS-CHECK · **Ceiling:** `book1`

### The Devourers
- **Status:** NEEDS-CHECK
- **Game asserts:** Named in the chamber reveal text.
- **Ceiling:** `book1`
- **Open question:** How much may the game say? Currently it says very little, which is correct — restraint here is a feature.

---

## Flora and fauna

### Lumina Ferns
- **Status:** GAME-ASSERTED (pulse figure), NEEDS-CHECK (existence)
- **Game asserts:** Blue-green understory, synchronized pulse ≈ 4.7 s, matching the planetary EM baseline within measurement error. Brightest in deep night. Under ion rain the pulse does not falter — it stops, and resumes in phase with the lattice (codex stage 2).
- **Ceiling:** `book1`
- **Feedback to manuscript:** The 4.7-second figure originates here and is now load-bearing in gameplay (`WORLD.fernPulse`).
- **Phase 5 economy note (GAME-ASSERTED):** Live spores are collectible (`fern-spore` item). They hold the lattice baseline (Thornhill's calibration reference) and carry an antiseptic fraction (Castillo's titration).

### Prismhoof
- **Status:** NEEDS-CHECK
- **Game asserts:** Herd fauna. Crystalline antler lattice refracts red-star light. Non-hostile unless cornered.
- **Ceiling:** `book1`
- **Phase 5 economy note (GAME-ASSERTED):** The lattice is shed seasonally; discarded laminae are the `prism-shard` item (Berger uses them as fine abrasive for servo work). Codex stage 2 adds herd tolerance behavior: slow walkers at two lengths, never straight lines.

### Shadowfang
- **Status:** NEEDS-CHECK
- **Game asserts:** Apex pack predator. Flanking, copper eyeshine, coordinates with larger threats under stress — and **learns the routes a survey operative habitually takes**.
- **Ceiling:** `book1`
- **Feedback to manuscript:** Route-learning is the game's signature mechanic and its strongest candidate for promotion into the books.
- **Phase 5 economy note (GAME-ASSERTED):** Dorsal quills are recoverable from kills (`fang-quill` item); Voss brokers them to the armorer as plate laminate.

### Ion rain cells
- **Status:** NEEDS-CHECK
- **Game asserts:** Storm fronts carrying charged particulates. Comms degrade, ferns go dark, shadowfangs hunt in the noise. Ozone smells "like burnt citrus."
- **Ceiling:** `book1`

---

## Chapter references

Phase 5 adds `chapterRef: { chapter, teaser }` to ~10 codex entries — the
"Continue in 2121: EXODUS — Ch. N" purchase funnel. **Every chapter number is a
placeholder invented by the game** (Book I content uses 1–14, `book2` entries
use 15–18) and every teaser is written to reveal nothing beyond its own codex
entry. Before the funnel goes live against the real book, each number must be
aligned with the manuscript's actual chapter breaks. The numbers live only in
`INITIAL_CODEX` in `src/game/data.ts` — one file to correct.

## Open questions for the author

1. **Who is Hale?** The game name-drops "Hale's people" in its climax and now builds a Ridge-7 camp around it. Highest-risk invention in the project. Phase 5 held the agreed floor: tags and a direction of travel, nothing else.
2. **Is the 28-hour day correct?** It drives the clock, the day/night cycle length, and every in-fiction timestamp.
3. **How much of Ava's voice is the game allowed to write?** The Ava comms layer is the largest body of invented first-person dialogue for a canon character.
4. **Colony population and roster.** Four of the five NPCs are game inventions. If the books name colony staff, the game should use those names instead. (Phase 5 deliberately kept all population references uncounted — "every name that ever crossed this gate," no numbers.)
5. **May a player canonically break the quiet protocol?** Affects how the broadcast ending is framed — as a real possibility or an explicit what-if.
6. **What is the *Verne*'s status at Book I's end?** Berger implies it is intact and hidden.
7. **Did anything answer a human transmission before the events of the books?** The Survey Team B coast log asserts a pre-doctrine contact — a handshake returned "with fourteen seconds missing" — and implies it birthed the quiet protocol. Second-highest-risk invention after Hale; it is book2-gated, but it is load-bearing for the cache-log storyline.
8. **Was Castillo (or anyone on the colony roster) at Promethei Terra?** The game now says she triaged Theo's arm there. Cheap to cut if the books contradict it — one dialogue branch.

## Terms the linter tracks

Any string in the game's content that mentions one of these must have an entry
above. Add the term to `scripts/canon-lint.mjs` when you add an entry here.
