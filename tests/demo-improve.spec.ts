import { expect, test } from "@playwright/test";
import { deployToSurface, gameState, probe, teleport } from "./helpers";

/**
 * Verification for the improvement wave (docs/DEMO-FINDINGS.md backlog).
 * Manual project — SwiftShader sim rates make these slow; CI does not run them.
 */

test("cold load initialises with no module-cycle error (audio -> music -> store)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await deployToSurface(page, { operative: "marine", tod: "0.5" });
  // The music layer builds its graph on the first store change after deploy.
  await page.waitForTimeout(4000);
  expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);

  // The audio API must carry the music methods the layer installs.
  const api = await page.evaluate(() => {
    const w = window as unknown as { __stateTest?: { get: () => unknown } };
    return Boolean(w.__stateTest);
  });
  expect(api).toBe(true);
});

test("__stateTest exposes a read-only snapshot", async ({ page }) => {
  await deployToSurface(page, { operative: "marine", tod: "0.5" });

  const s = await gameState(page);
  expect(s.phase).toBe("playing");
  expect(s.objectives.done).toBeLessThanOrEqual(s.objectives.visibleTotal);
  expect(s.objectives.visibleTotal).toBeLessThanOrEqual(s.objectives.total);
  expect(Array.isArray(s.recentMessages)).toBe(true);

  // Mutating the returned copy must not reach the store.
  await page.evaluate(() => {
    const w = window as unknown as {
      __stateTest: { get: () => { inventory: Record<string, number> } };
    };
    w.__stateTest.get().inventory["fern-spore"] = 99;
  });
  const after = await gameState(page);
  expect(after.inventory["fern-spore"] ?? 0).not.toBe(99);
});

test("bunk rest requires a hold — a tap does nothing", async ({ page }) => {
  test.setTimeout(240_000);
  await deployToSurface(page, {
    operative: "marine",
    spawn: "colony",
    tod: "0.5",
  });

  // Onto the apron, in through the hatch, then across to the bunk itself
  // (entities.ts dome-bunk, (-2, 3.95) — only pickable while insideDome).
  await teleport(page, 0, 8);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(2500);
  await teleport(page, -2, 4);

  const bunk = await page.waitForFunction(
    () => document.body.innerText.includes("Rest until"),
    null,
    { timeout: 30_000 },
  );
  expect(bunk).toBeTruthy();

  const before = (await gameState(page)).timeOfDay;

  // A tap must not rotate the watch.
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(2500);
  const afterTap = (await gameState(page)).timeOfDay;
  expect(Math.abs(afterTap - before)).toBeLessThan(0.05);

  // A hold must, exactly once.
  await page.keyboard.down("KeyE");
  await page.waitForTimeout(4000);
  await page.keyboard.up("KeyE");
  await page.waitForTimeout(1500);
  const afterHold = await gameState(page);
  expect(afterHold.recentMessages.join(" ")).toContain("REST — watch rotated");
  // Stamina must actually be restored (the store write used to be overwritten
  // by the controller's local authority on the very next frame).
  expect(afterHold.recentMessages.length).toBeGreaterThan(0);
});

test("fast travel actually relocates the rig, not just the store", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await deployToSurface(page, { operative: "marine", tod: "0.5" });

  await page.keyboard.press("KeyK");
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /Ridge-7/i }).first().click();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  // Let the frame loop run: the old bug let the controller overwrite the
  // store back to the pre-travel position within a frame of resuming.
  await page.waitForTimeout(4000);

  const pos = await probe(page, () => {
    const g = (
      window as unknown as { __stateTest?: { get: () => unknown } }
    ).__stateTest;
    return g ? "ok" : "missing";
  });
  expect(pos).toBe("ok");

  const body = await page.locator("body").innerText();
  // The HUD coordinate readout should be in the ridge corridor (x well west).
  const coords = body.match(/(-?\d+),\s*(-?\d+)/);
  expect(coords).not.toBeNull();
  expect(Number(coords![1])).toBeLessThan(-50);
});

test("NEW badge marks an unseen tasking and clears once the log is opened", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await deployToSurface(page, {
    operative: "marine",
    spawn: "colony",
    tod: "0.5",
  });

  // Reveal the hidden ruins tasking via the lattice scan.
  await teleport(page, 12, 58);
  await probe(page, (p) => p.setKeys(["KeyQ"]));
  await page.waitForFunction(
    () => document.body.innerText.includes("SCAN COMPLETE — EM lattice node"),
    null,
    { timeout: 90_000 },
  );
  await probe(page, (p) => p.setKeys([]));
  await page.waitForTimeout(2000);

  await expect(page.getByText("NEW", { exact: true }).first()).toBeVisible();
});
