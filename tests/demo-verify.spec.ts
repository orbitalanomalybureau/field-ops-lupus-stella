import { expect, test } from "@playwright/test";
import { deployToSurface, hudText, probe, teleport } from "./helpers";

/**
 * Post-fix verification for the demo-playthrough findings. One test per
 * confirmed defect, each driving the same repro the playtester filed. Runs in
 * the manual project (see playwright.config.ts) — SwiftShader sim rates make
 * these minutes-long, so CI does not inherit them.
 */

/** Poll the whole HUD/body text until it contains `needle`. */
async function waitForText(
  page: import("@playwright/test").Page,
  needle: string,
  timeout = 60_000,
) {
  await page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    needle,
    { timeout },
  );
}

test("BLOCKER: chamber re-opens after Continue exploring — endings stay reachable", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await deployToSurface(page, {
    operative: "marine",
    spawn: "colony",
    tod: "0.5",
  });

  // Reveal the ruins tasking at the EM lattice node, then breach the seal.
  await teleport(page, 12, 58);
  await probe(page, (p) => p.setKeys(["KeyQ"]));
  await waitForText(page, "SCAN COMPLETE — EM lattice node", 90_000);
  await probe(page, (p) => p.setKeys([]));

  await teleport(page, 18, 150);
  await page.keyboard.press("KeyE");
  await waitForText(page, "Continue exploring", 30_000);

  const breachesBefore = (await hudText(page)).split(
    "CHAMBER SEAL — BREACHED",
  ).length;

  await page.getByRole("button", { name: /Continue exploring/i }).click();
  await page.waitForTimeout(2000);

  // Walk off and come back: the door must still answer.
  await teleport(page, 18, 130);
  await teleport(page, 18, 150);
  await waitForText(page, "Return to the chamber", 30_000);
  await page.keyboard.press("KeyE");
  await waitForText(page, "Seal log & return", 30_000);

  // Re-entry must not replay openRuin's one-shots.
  const breachesAfter = (await hudText(page)).split(
    "CHAMBER SEAL — BREACHED",
  ).length;
  expect(breachesAfter).toBeLessThanOrEqual(breachesBefore);
  await expect(
    page.getByRole("button", { name: /Continue exploring/i }),
  ).toBeVisible();
});

test("perimeter objective no longer completes at spawn, still completes when walked", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await deployToSurface(page, { operative: "marine", tod: "0.5" });

  await page.waitForTimeout(4000);
  expect(await hudText(page)).not.toContain(
    "OBJECTIVE COMPLETE — Walk the south perimeter",
  );

  // Arm by leaving the gate radius, then return.
  await teleport(page, 0, 70);
  await teleport(page, 0, 44);
  await waitForText(page, "OBJECTIVE COMPLETE — Walk the south perimeter");
});

test("queued E no longer replays after Close; nameplate hides under the modal", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await deployToSurface(page, {
    operative: "marine",
    spawn: "colony",
    tod: "0.5",
  });

  await teleport(page, -18, 12);
  await page.keyboard.press("KeyE");
  await waitForText(page, "Close", 30_000);

  // Plates/barks hide during dialogue (0.25 s UI throttle).
  await page.waitForTimeout(1500);
  await expect(page.getByText("If the readout flickers")).toBeHidden();

  // Queue extra presses while the modal is open, then close.
  await page.keyboard.press("KeyE");
  await page.keyboard.press("KeyE");
  await page.getByRole("button", { name: /^Close$/ }).click();
  await page.waitForTimeout(2500);
  await expect(page.getByRole("button", { name: /^Close$/ })).toBeHidden();
});

test("Escape closes the codex before pausing", async ({ page }) => {
  test.setTimeout(180_000);
  await deployToSurface(page, { operative: "marine", tod: "0.5" });

  await page.keyboard.press("KeyC");
  await waitForText(page, "FIELD CODEX", 15_000);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(2000);
  const afterFirst = await hudText(page);
  expect(afterFirst).not.toContain("FIELD CODEX");
  expect(afterFirst).not.toContain("SYSTEMS HOLD");

  await page.keyboard.press("Escape");
  await waitForText(page, "SYSTEMS HOLD", 15_000);
});

test("day fern scan refuses loudly", async ({ page }) => {
  test.setTimeout(240_000);
  await deployToSurface(page, { operative: "survey", tod: "0.5" });

  await teleport(page, 4, 74);
  await probe(page, (p) => p.setKeys(["KeyQ"]));
  await waitForText(page, "spores inert by day", 90_000);
  await probe(page, (p) => p.setKeys([]));

  // Refused, not consumed: no completed scan, no specimen.
  const text = await hudText(page);
  expect(text).not.toContain("SCAN COMPLETE — Lumina");
  expect(text).not.toContain("vial sealed");
});

test("staged storm shows the WX alert on the ticker", async ({ page }) => {
  test.setTimeout(180_000);
  await deployToSurface(page, { operative: "marine", wx: "storm" });
  await waitForText(page, "WX ALERT — ION STORM CELL", 15_000);
});

test("chapter link: arrival note posts and the staged clock holds", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await deployToSurface(page, { operative: "marine", chapter: "16" });
  await waitForText(page, "CH. 16", 15_000);

  // Staged dusk must not roll into night while the hold window lasts. The
  // clock renders HH:MM on the HUD; 8 wall-seconds unheld would advance it
  // ~24 sim-minutes at the 480 s day.
  const clockOf = async () =>
    (await hudText(page)).match(/\b(\d{2}):(\d{2})\b/)?.slice(1, 3) ?? null;
  const before = await clockOf();
  await page.waitForTimeout(8000);
  const after = await clockOf();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  const minutes = (t: string[]) => Number(t[0]) * 60 + Number(t[1]);
  const drift = Math.abs(minutes(after!) - minutes(before!));
  expect(drift).toBeLessThanOrEqual(10);
});

test("unknown routes render the themed 404", async ({ page }) => {
  await page.goto("/nonexistent-sector", { waitUntil: "domcontentloaded" });
  await waitForText(page, "SECTOR UNCHARTED", 15_000);
  await expect(
    page.getByRole("link", { name: /RETURN TO COMMAND/i }),
  ).toBeVisible();
});

test("terminal boot log types all four lines with no blank row", async ({
  page,
}) => {
  await page.goto("/terminal", { waitUntil: "domcontentloaded" });
  await waitForText(page, "Linking classified archive", 15_000);
  await waitForText(page, "Embed channel ready.", 15_000);
  // No empty "› " bullet: every prompt row carries text.
  const bare = await page.evaluate(() =>
    Array.from(document.querySelectorAll("*"))
      .map((el) => el.textContent?.trim() ?? "")
      .filter((t) => t === "›").length,
  );
  expect(bare).toBe(0);
});
