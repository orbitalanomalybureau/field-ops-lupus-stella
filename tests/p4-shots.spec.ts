import { test } from "@playwright/test";
import { deployToSurface, settle, teleport } from "./helpers";

/**
 * Phase 4 visual verification, run by hand — not part of the CI suite.
 * `npx playwright test tests/p4-shots.spec.ts`
 */

test("avatar close-up", async ({ page }) => {
  // Photo mode hides the HUD; the chase camera frames the operative.
  await deployToSurface(page, {
    operative: "theo",
    spawn: "colony",
    tod: "0.5",
    wx: "clear",
    quality: "high",
  });
  await page.mouse.click(640, 360);
  await settle(page, 2000);
  await page.keyboard.press("KeyP");
  await settle(page, 4000);
  await page.screenshot({ path: "/tmp/shots/p4-avatar.png" });
});

test("npc in colony", async ({ page }) => {
  await deployToSurface(page, {
    operative: "marine",
    spawn: "colony",
    tod: "0.5",
    wx: "clear",
    quality: "high",
  });
  await page.mouse.click(640, 360);
  // Thornhill's registry home is (-18, 14); stand south-east of it looking NW.
  await teleport(page, -12, 20, Math.PI * 0.75);
  await settle(page, 5000);
  await page.screenshot({ path: "/tmp/shots/p4-npc.png" });
});

test("herd at the field", async ({ page }) => {
  await deployToSurface(page, {
    operative: "marine",
    spawn: "treeline",
    tod: "0.5",
    wx: "clear",
    quality: "high",
  });
  await page.mouse.click(640, 360);
  await teleport(page, -45, 88, Math.PI * 1.25);
  await settle(page, 5000);
  await page.screenshot({ path: "/tmp/shots/p4-herd.png" });
});

test("storm at the colony", async ({ page }) => {
  await deployToSurface(page, {
    operative: "marine",
    spawn: "colony",
    tod: "0.45",
    wx: "storm",
    quality: "high",
  });
  await settle(page, 7000);
  await page.screenshot({ path: "/tmp/shots/p4-storm.png" });
});
