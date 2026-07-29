import { test } from "@playwright/test";
import { deployToSurface, settle, teleport } from "./helpers";

/**
 * Wave B visual verification, run by hand — not part of the CI suite.
 * `FIELDOPS_BASE_URL=... npx playwright test tests/p7-shots.spec.ts`
 */

test("aim: shoulder camera and reticle", async ({ page }) => {
  await deployToSurface(page, {
    operative: "marine",
    spawn: "treeline",
    tod: "0.5",
    wx: "clear",
    quality: "high",
  });
  await page.mouse.click(640, 360); // pointer lock
  await settle(page, 1500);
  await teleport(page, 30, 110, Math.PI * 0.9);
  await settle(page, 1000);

  // Pointer lock never grants in headless Chromium, so raise the rifle via
  // the QA seam (the touch-toggle path) and fire on the keyboard binding.
  await page.evaluate(() => window.__controlsTest?.setAim(true));
  await settle(page, 2000);
  await page.screenshot({ path: "/tmp/shots/p7-aim.png" });

  await page.keyboard.press("KeyR");
  await page.waitForTimeout(150);
  await page.screenshot({ path: "/tmp/shots/p7-fire.png" });
  await page.evaluate(() => window.__controlsTest?.setAim(false));
});

test("region card on first entry", async ({ page }) => {
  await deployToSurface(page, {
    operative: "marine",
    spawn: "ridge7",
    tod: "0.5",
    wx: "clear",
    quality: "low",
  });
  await page.mouse.click(640, 360);
  await settle(page, 2500);
  await page.screenshot({ path: "/tmp/shots/p7-region.png" });
});

test("rest prompt in the dome", async ({ page }) => {
  await deployToSurface(page, {
    operative: "theo",
    spawn: "colony",
    tod: "0.5",
    wx: "clear",
    quality: "low",
  });
  await page.mouse.click(640, 360);
  await settle(page, 800);
  await teleport(page, 0, 10);
  await page.keyboard.press("KeyE"); // enter dome
  await settle(page, 1200);
  await teleport(page, 0, 6);
  await settle(page, 800);
  await page.screenshot({ path: "/tmp/shots/p7-rest.png" });
});
