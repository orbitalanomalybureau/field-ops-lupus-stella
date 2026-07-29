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
- **Game asserts:** Far-continent Japanese ark colony, far south across crimson water. Cherry memorials at New Eden face their vector. Their carrier was silent under the quiet protocol and now answers analysis pings.
- **Ceiling:** `book2early`

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

### John Carver
- **Status:** NEEDS-CHECK
- **Game asserts:** Died keeping a collar from cascading. The south field marker is his.
- **Ceiling:** `book1`

### Dr. Thornhill — ZPE systems
- **Status:** GAME-ASSERTED
- **Game asserts:** Designed the modulation-collar retrofit. Tracks nightly collar drift in millihertz.
- **Ceiling:** `book1`

### June Castillo — perimeter med
- **Status:** GAME-ASSERTED · **Ceiling:** `book1`

### Adele Voss — contracts / gate
- **Status:** GAME-ASSERTED · **Ceiling:** `book1`

### Berger — ark engineer
- **Status:** GAME-ASSERTED
- **Game asserts:** Knows the *Verne*'s hull. Reads incoming ion fronts by the sound of ark metal.
- **Ceiling:** `book1`

### Tomas — Office of the Voice
- **Status:** NEEDS-CHECK · **Ceiling:** `book2early`

### Hale
- **Status:** NEEDS-CHECK
- **Game asserts:** "Hale's people" are named in the chamber reveal. The game now places a Hale expedition camp on Ridge-7 to pay the name off.
- **Ceiling:** `book1`
- **Open question:** Who is Hale, and is the expedition camp compatible with the books? **Highest-priority NEEDS-CHECK in this file** — the game currently invents around a name it does not understand.

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

### The EM lattice
- **Status:** GAME-ASSERTED
- **Game asserts:** A planetary electromagnetic grid beneath the foundations. The forest keeps time with it; so does the chamber.
- **Ceiling:** `book1`
- **Feedback to manuscript:** The lattice as a *timekeeping* system, and the fern pulse locking to it, originate here.

### The *Verne*
- **Status:** NEEDS-CHECK
- **Game asserts:** An ark, now quiet "under the islands."
- **Ceiling:** `book1`

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
- **Game asserts:** Blue-green understory, synchronized pulse ≈ 4.7 s, matching the planetary EM baseline within measurement error. Brightest in deep night.
- **Ceiling:** `book1`
- **Feedback to manuscript:** The 4.7-second figure originates here and is now load-bearing in gameplay (`WORLD.fernPulse`).

### Prismhoof
- **Status:** NEEDS-CHECK
- **Game asserts:** Herd fauna. Crystalline antler lattice refracts red-star light. Non-hostile unless cornered.
- **Ceiling:** `book1`

### Shadowfang
- **Status:** NEEDS-CHECK
- **Game asserts:** Apex pack predator. Flanking, copper eyeshine, coordinates with larger threats under stress — and **learns the routes a survey operative habitually takes**.
- **Ceiling:** `book1`
- **Feedback to manuscript:** Route-learning is the game's signature mechanic and its strongest candidate for promotion into the books.

### Ion rain cells
- **Status:** NEEDS-CHECK
- **Game asserts:** Storm fronts carrying charged particulates. Comms degrade, ferns go dark, shadowfangs hunt in the noise. Ozone smells "like burnt citrus."
- **Ceiling:** `book1`

---

## Open questions for the author

1. **Who is Hale?** The game name-drops "Hale's people" in its climax and now builds a Ridge-7 camp around it. Highest-risk invention in the project.
2. **Is the 28-hour day correct?** It drives the clock, the day/night cycle length, and every in-fiction timestamp.
3. **How much of Ava's voice is the game allowed to write?** The Ava comms layer is the largest body of invented first-person dialogue for a canon character.
4. **Colony population and roster.** Four of the five NPCs are game inventions. If the books name colony staff, the game should use those names instead.
5. **May a player canonically break the quiet protocol?** Affects how the broadcast ending is framed — as a real possibility or an explicit what-if.
6. **What is the *Verne*'s status at Book I's end?** Berger implies it is intact and hidden.

## Terms the linter tracks

Any string in the game's content that mentions one of these must have an entry
above. Add the term to `scripts/canon-lint.mjs` when you add an entry here.
