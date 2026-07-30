import { test } from "@playwright/test";
import { deployToSurface, settle, teleport } from "./helpers";

/**
 * Wave C visual verification, run by hand — not part of the CI suite.
 * All at quality=high: the fidelity work lands there.
 */

test("avatar rear view — cyber arm must be on the viewer's LEFT", async ({
  page,
}) => {
  await deployToSurface(page, {
    operative: "theo",
    spawn: "colony",
    tod: "0.5",
    wx: "clear",
    quality: "high",
  });
  await page.mouse.click(640, 360);
  await settle(page, 1500);
  await page.keyboard.press("KeyP"); // photo mode, HUD off
  await settle(page, 4000);
  await page.screenshot({ path: "/tmp/shots/p8-arm.png" });
});

test("colony noon — soft shadows and grade", async ({ page }) => {
  await deployToSurface(page, {
    operative: "marine",
    spawn: "colony",
    tod: "0.5",
    wx: "clear",
    quality: "high",
  });
  await page.mouse.click(640, 360);
  await settle(page, 6000);
  await page.screenshot({ path: "/tmp/shots/p8-colony.png" });
});

test("treeline — softened canopies", async ({ page }) => {
  await deployToSurface(page, {
    operative: "marine",
    spawn: "treeline",
    tod: "0.5",
    wx: "clear",
    quality: "high",
  });
  await page.mouse.click(640, 360);
  await settle(page, 6000);
  await page.screenshot({ path: "/tmp/shots/p8-treeline.png" });
});

test("dusk — god rays and horizon", async ({ page }) => {
  await deployToSurface(page, {
    operative: "marine",
    spawn: "ridge7",
    tod: "0.74",
    wx: "clear",
    quality: "high",
  });
  await page.mouse.click(640, 360);
  await teleport(page, -100, 50, Math.PI * 0.5);
  await settle(page, 6000);
  await page.screenshot({ path: "/tmp/shots/p8-dusk.png" });
});
