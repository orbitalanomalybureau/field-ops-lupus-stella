#!/usr/bin/env node
/**
 * Stamp the service worker with a build id and the real hashed asset graph.
 *
 * Run after `vite build`. Without this the SW ships with BUILD_ID "dev" and a
 * three-entry precache list, which is why the game was never actually playable
 * offline — the 1.4 MB of hashed JS was only cached if you had already
 * requested it.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIRS = [".vercel/output/static", "dist/client", ".output/public"];

const outDir = OUTPUT_DIRS.find((d) => existsSync(join(d, "sw.js")));
if (!outDir) {
  console.error(
    `[sw] No build output containing sw.js. Looked in:\n  ${OUTPUT_DIRS.join("\n  ")}\nRun \`npm run build\` first.`,
  );
  process.exit(1);
}

function walk(dir, base = "") {
  return readdirSync(dir).flatMap((entry) => {
    const abs = join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    return statSync(abs).isDirectory() ? walk(abs, rel) : [rel];
  });
}

const all = walk(outDir);

// Precache what the game needs to boot and render: the shell, the manifest,
// icons, and every hashed asset. Source maps and the SW itself are excluded.
const precache = all
  .filter((f) => !f.endsWith(".map") && f !== "sw.js")
  .filter((f) => f.startsWith("assets/") || f.startsWith("icons/") || f.endsWith(".webmanifest"))
  .map((f) => `/${f}`);

const shell = ["/", "/offline"];
const entries = Array.from(new Set([...shell, ...precache]));

const swPath = join(outDir, "sw.js");
const source = readFileSync(swPath, "utf8");

const buildId = createHash("sha256")
  .update(entries.join("\n"))
  .digest("hex")
  .slice(0, 12);

const stamped = source
  .replace(/const BUILD_ID = "[^"]*";/, `const BUILD_ID = ${JSON.stringify(buildId)};`)
  .replace(/const PRECACHE = \[[^\]]*\];/s, `const PRECACHE = ${JSON.stringify(entries)};`);

if (stamped === source) {
  console.error("[sw] Failed to stamp — BUILD_ID/PRECACHE markers not found in public/sw.js.");
  process.exit(1);
}

writeFileSync(swPath, stamped);

const bytes = entries.reduce((sum, e) => {
  const abs = join(outDir, e.replace(/^\//, ""));
  return existsSync(abs) && statSync(abs).isFile() ? sum + statSync(abs).size : sum;
}, 0);

console.log(
  `[sw] ${outDir}/sw.js stamped build ${buildId} · ${entries.length} precache entries · ${(bytes / 1024 / 1024).toFixed(2)} MB on disk`,
);
