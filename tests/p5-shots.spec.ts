import { test } from "@playwright/test";
import { deployToSurface, hudText, settle, teleport } from "./helpers";

/**
 * Phase 5 visual verification, run by hand — not part of the CI suite.
 * `npx playwright test tests/p5-shots.spec.ts`
 */

test("dialogue with Thornhill (memory + trades)", async ({ page }) => {
  await deployToSurface(page, {
    operative: "theo",
    spawn: "colony",
    tod: "0.5",
    wx: "clear",
    quality: "low",
  });
  await page.mouse.click(640, 360);
  await settle(page, 1500);
  // Thornhill's anchor is (-18, 14).
  await teleport(page, -15, 16, Math.PI * 1.4);
  await settle(page, 1500);
  await page.keyboard.press("KeyE");
  await settle(page, 1500);
  await page.screenshot({ path: "/tmp/shots/p5-dialogue.png" });
  const text = await hudText(page);
  console.log(
    "DIALOGUE_CHOICES",
    text
      .split("\n")
      .filter((l) => l.trim().length > 3)
      .slice(0, 20)
      .join(" | "),
  );
});

test("codex panel with chapter refs", async ({ page }) => {
  await deployToSurface(page, {
    operative: "survey",
    spawn: "treeline",
    tod: "0.5",
    wx: "clear",
    quality: "low",
  });
  await page.mouse.click(640, 360);
  await settle(page, 1000);
  // Scan the fern bed so at least one non-default codex entry is unlocked.
  await page.keyboard.down("KeyQ");
  await page.waitForTimeout(4000);
  await page.keyboard.up("KeyQ");
  await settle(page, 800);
  await page.keyboard.press("KeyC");
  await settle(page, 800);
  await page.screenshot({ path: "/tmp/shots/p5-codex.png" });
});

test("photo mode panel", async ({ page }) => {
  await deployToSurface(page, {
    operative: "marine",
    spawn: "treeline",
    tod: "0.55",
    wx: "clear",
    quality: "low",
  });
  await page.mouse.click(640, 360);
  await settle(page, 1500);
  await page.keyboard.press("KeyP");
  await settle(page, 3000);
  await page.screenshot({ path: "/tmp/shots/p5-photo.png" });
});
