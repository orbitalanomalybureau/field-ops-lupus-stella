#!/usr/bin/env node
/**
 * Canon drift guard.
 *
 * The novel manuscripts are not in this repo, so nothing structurally prevents
 * the game from inventing lore that contradicts the books. This checks the
 * cheap half of that problem: every canon proper noun the game puts on screen
 * must have an entry in canon/CANON.md, where its status (VERIFIED /
 * GAME-ASSERTED / NEEDS-CHECK) and spoiler ceiling are recorded.
 *
 * It cannot verify that what the game says is *true* — only that someone has
 * written down what the game is allowed to say. That is the whole point: it
 * turns silent drift into a failing build at the moment of writing.
 *
 * Usage:  node scripts/canon-lint.mjs [--list]
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CANON_PATH = "canon/CANON.md";

/**
 * Canon terms the game is expected to handle carefully. Keep in sync with the
 * headings in CANON.md — adding a term here without an entry there fails.
 */
const TRACKED_TERMS = [
  "Lupus Stella",
  "Wolf 1061c",
  "New Eden",
  "Obsidian Titans",
  "Ridge-7",
  "Kaguyahime",
  "Theo Daniel",
  "Ava",
  "Carver",
  "Thornhill",
  "Castillo",
  "Voss",
  "Berger",
  "Tomas",
  "Hale",
  "ZPE",
  "modulation collar",
  "quiet protocol",
  "EM lattice",
  "Verne",
  "Promethei Terra",
  "Devourers",
  "Lumina Fern",
  "Prismhoof",
  "Shadowfang",
  "Ion rain",
  "Office of the Voice",
  "Survey Team B",
  "REMEMBER",
];

/** Files whose string literals are player-facing narrative. */
const CONTENT_ROOTS = ["src/game/data.ts", "src/game/content"];

function collectFiles(target) {
  if (!existsSync(target)) return [];
  if (statSync(target).isFile()) return [target];
  return readdirSync(target)
    .flatMap((entry) => collectFiles(join(target, entry)))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
}

if (!existsSync(CANON_PATH)) {
  console.error(
    `[canon] ${CANON_PATH} is missing. The bible must exist before content ships — see docs/ROADMAP.md § Canon pipeline.`,
  );
  process.exit(1);
}

const canon = readFileSync(CANON_PATH, "utf8");
const canonLower = canon.toLowerCase();

const files = CONTENT_ROOTS.flatMap(collectFiles);
if (!files.length) {
  console.error(`[canon] No content files found in ${CONTENT_ROOTS.join(", ")}`);
  process.exit(1);
}

const corpus = files
  .map((f) => `${f}\n${readFileSync(f, "utf8")}`)
  .join("\n");

const used = TRACKED_TERMS.filter((term) =>
  corpus.toLowerCase().includes(term.toLowerCase()),
);
const undocumented = used.filter(
  (term) => !canonLower.includes(term.toLowerCase()),
);

if (process.argv.includes("--list")) {
  console.log(
    JSON.stringify(
      { files: files.length, tracked: TRACKED_TERMS.length, used, undocumented },
      null,
      2,
    ),
  );
}

const needsCheck = (canon.match(/\*\*Status:\*\* NEEDS-CHECK/g) ?? []).length;
const gameAsserted = (canon.match(/\*\*Status:\*\* GAME-ASSERTED/g) ?? []).length;

console.log(
  `[canon] ${files.length} content file(s) · ${used.length}/${TRACKED_TERMS.length} tracked terms in use · ${needsCheck} NEEDS-CHECK, ${gameAsserted} GAME-ASSERTED entries`,
);

if (undocumented.length) {
  console.error(
    `\n[canon] These terms appear in game content with no entry in ${CANON_PATH}:\n  ${undocumented.join("\n  ")}\n\nAdd an entry (status + ceiling + what the game may reveal) before shipping.`,
  );
  process.exit(1);
}

if (needsCheck > 0) {
  console.log(
    `[canon] Reminder: ${needsCheck} entries are still NEEDS-CHECK against the manuscripts. Not a failure — a standing to-do for the author.`,
  );
}
