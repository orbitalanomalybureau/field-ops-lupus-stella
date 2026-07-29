#!/usr/bin/env node
/**
 * Bundle-size gate.
 *
 * Budgets are pinned to measured reality with headroom, not to round numbers —
 * see docs/ROADMAP.md Appendix A for the baseline this was set from. The point
 * is to make bundle growth a deliberate decision (raise the number in a commit)
 * instead of something that happens silently over twenty PRs.
 *
 * Usage:  node scripts/check-bundle-budget.mjs [--json]
 * Assumes `vite build` has already run.
 */
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const KB = 1024;

/** Budgets in gzipped kilobytes. */
const BUDGETS = [
  {
    name: "entry",
    // The menu-path payload: everything before the player deploys to surface.
    match: (f) => /^index-.*\.js$/.test(f),
    maxKb: 115,
  },
  {
    name: "world (lazy three/R3F chunk)",
    match: (f) => /GameCanvas-.*\.js$/.test(f),
    maxKb: 300,
  },
  {
    name: "total client JS",
    match: (f) => f.endsWith(".js"),
    // Raised from 460 when N8AO landed: ambient occlusion costs ~87 KB gz and
    // only the "high" tier ever runs it. It rides in the lazy world chunk, so
    // the menu path is unaffected and phones pay nothing at runtime — but they
    // still download it. Lazy-loading the pass per tier would win that back.
    maxKb: 520,
  },
  {
    name: "total CSS",
    match: (f) => f.endsWith(".css"),
    maxKb: 12,
  },
];

const CANDIDATE_DIRS = [
  ".vercel/output/static/assets",
  "dist/client/assets",
  ".output/public/assets",
];

const assetDir = CANDIDATE_DIRS.find((d) => existsSync(d));
if (!assetDir) {
  console.error(
    `[budget] No build output found. Looked in:\n  ${CANDIDATE_DIRS.join("\n  ")}\nRun \`npm run build\` first.`,
  );
  process.exit(1);
}

const files = readdirSync(assetDir).filter((f) =>
  statSync(join(assetDir, f)).isFile(),
);

const gzKb = (file) =>
  gzipSync(readFileSync(join(assetDir, file)), { level: 9 }).length / KB;

const sizes = new Map(files.map((f) => [f, gzKb(f)]));

const results = BUDGETS.map((budget) => {
  const matched = files.filter(budget.match);
  const actualKb = matched.reduce((sum, f) => sum + sizes.get(f), 0);
  return {
    name: budget.name,
    actualKb: Number(actualKb.toFixed(1)),
    maxKb: budget.maxKb,
    files: matched.length,
    pass: actualKb <= budget.maxKb,
  };
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ assetDir, results }, null, 2));
} else {
  console.log(`[budget] ${assetDir}`);
  for (const r of results) {
    const pct = Math.round((r.actualKb / r.maxKb) * 100);
    console.log(
      `  ${r.pass ? "PASS" : "FAIL"}  ${r.name.padEnd(30)} ${String(r.actualKb).padStart(7)} KB gz / ${r.maxKb} KB  (${pct}%, ${r.files} file${r.files === 1 ? "" : "s"})`,
    );
  }
}

const failures = results.filter((r) => !r.pass);
if (failures.length) {
  console.error(
    `\n[budget] ${failures.length} budget(s) exceeded. Either trim the bundle or raise the number in scripts/check-bundle-budget.mjs — deliberately, in its own commit.`,
  );
  process.exit(1);
}
