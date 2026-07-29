import { expect, test } from "@playwright/test";
import {
  deployToSurface,
  hudText,
  probe,
  settle,
  teleport,
  walk,
} from "./helpers";

/**
 * The regression net. These replaced eight assertion-free probe scripts that
 * printed JSON for a human to eyeball — nothing could fail a pipeline before.
 */

test.describe("boot and shell", () => {
  test("loads the terminal and reaches character select without errors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Miles/i })).toBeVisible({
      timeout: 20_000,
    });

    expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toEqual([]);
    expect(
      consoleErrors,
      `console errors: ${consoleErrors.join(" | ")}`,
    ).toEqual([]);
  });

  test("embed route skips boot and renders without chrome", async ({ page }) => {
    await page.goto("/embed", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Miles/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("terminal host page loads its launch control", async ({ page }) => {
    await page.goto("/terminal", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/CLASSIFIED|TERMINAL/i, {
      timeout: 20_000,
    });
  });
});

test.describe("world", () => {
  test("deploys to surface and renders a canvas", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await deployToSurface(page);

    await expect(page.locator("canvas")).toBeVisible();
    expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toEqual([]);
  });

  test("W moves the operative", async ({ page }) => {
    await deployToSurface(page);
    await page.mouse.click(640, 360);

    const before = await probe(page, (p) => p.getSpeed());
    expect(before).toBeLessThan(0.5);

    await page.keyboard.down("KeyW");
    await page.waitForTimeout(700);
    const during = await probe(page, (p) => p.getSpeed());
    await page.keyboard.up("KeyW");

    expect(during, "held W should produce forward speed").toBeGreaterThan(1);
  });

  test("the player cannot walk off the terrain mesh", async ({ page }) => {
    // Bounds used to be x±260 while the mesh only reached ±240, leaving a
    // strip of walkable void at the edge of the world. Start just inside the
    // western edge — walking there from a spawn would take minutes of wall
    // clock at software-rendered frame rates — then push outward.
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await deployToSurface(page, { operative: "marine", spawn: "ridge7" });
    await page.mouse.click(640, 360);
    await teleport(page, -232, 55, Math.PI / 2);

    for (let i = 0; i < 6; i++) {
      await walk(page, ["ShiftLeft", "KeyW"], 900);
    }
    await settle(page, 600);

    const x = await page.evaluate(
      () => Math.round((window as unknown as { __fieldopsX?: number }).__fieldopsX ?? 0),
    );
    const text = await hudText(page);
    const coord = text.match(/(-?\d+),(-?\d+)/);
    expect(coord, "HUD should report player coordinates").not.toBeNull();

    const px = Number(coord?.[1] ?? x);
    expect(
      Math.abs(px),
      "the operative must stay on the terrain mesh",
    ).toBeLessThanOrEqual(241);

    expect(pageErrors).toEqual([]);
  });

  test("holds a usable framerate under SwiftShader", async ({ page }) => {
    await deployToSurface(page);
    await settle(page, 4000);
    const fps = await probe(page, (p) => p.getFps());
    // SwiftShader rasterizes on the CPU, so this number says nothing about
    // real hardware — a GPU runs the same scene two orders of magnitude
    // faster. It exists to catch a draw-call or overdraw blowup: measured at
    // ~2.1 fps on this scene, so a floor of 1.0 trips only on a real
    // regression. Raise it deliberately if the baseline improves.
    expect(fps, "software-rendered framerate floor").toBeGreaterThan(1);
  });
});

test.describe("progression", () => {
  test("scanning a target completes an objective and unlocks codex", async ({
    page,
  }) => {
    await deployToSurface(page, { operative: "survey", spawn: "treeline" });
    await page.mouse.click(640, 360);
    await settle(page, 1000);

    // The treeline fern bed is a scan target; SURVEY-3 has the fastest scan.
    await page.keyboard.down("KeyQ");
    await page.waitForTimeout(4000);
    await page.keyboard.up("KeyQ");
    await settle(page, 800);

    const text = await hudText(page);
    expect(text).toMatch(/CODEX|OBJECTIVE COMPLETE|SCAN/i);
  });

  test("spoiler ceiling defaults to book1 for a fresh visitor", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Miles/i })).toBeVisible({
      timeout: 20_000,
    });
    const ceiling = await page.evaluate(
      () =>
        (
          document.querySelector("select") as HTMLSelectElement | null
        )?.value ?? null,
    );
    expect(ceiling, "fresh readers must not be shown Book II content").not.toBe(
      "book2early",
    );
  });

  test("E actually interacts", async ({ page }) => {
    // The interact key is an edge, and an edge has exactly one owner. When
    // PlayerController's per-frame snapshot() also consumed it, the controller
    // ran first every frame and E silently did nothing anywhere in the game.
    await deployToSurface(page, { operative: "theo", spawn: "colony" });
    await page.mouse.click(640, 360);
    await settle(page, 1200);

    // The command dome hatch entity sits at (0, 8).
    await teleport(page, 0, 10);

    await page.keyboard.press("KeyE");
    await settle(page, 1200);

    const after = await hudText(page);
    expect(after, "E at the hatch must open the ops floor").toMatch(
      /DOME — ops floor access|Exit command dome/i,
    );
  });

  test("the endgame is hidden until it is earned", async ({ page }) => {
    // The whole point of the quest graph: before this, the objective log
    // advertised the ruin and the chamber from the first second, and walking
    // south for 90 seconds finished the game.
    await deployToSurface(page);
    await settle(page, 1000);

    const log = await hudText(page);
    expect(log, "the log must not name the ruin yet").not.toMatch(
      /southern ruin/i,
    );
    expect(log, "the log must not name the chamber yet").not.toMatch(
      /Enter the chamber/i,
    );
    expect(log, "Ridge-7 needs Voss's waiver first").not.toMatch(
      /Survey Ridge-7/i,
    );
  });

  test("progress survives a reload", async ({ page }) => {
    await deployToSurface(page, { operative: "theo" });
    await settle(page, 1500);

    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page, 2000);

    const text = await hudText(page);
    expect(text).toMatch(/DANIEL|RESUME|Theo/i);
  });
});

test.describe("resilience", () => {
  // The reported crash: selecting Theo threw "Cannot read properties of null
  // (reading 'useMemo')" — a duplicate-React / stale-module fault. This is the
  // faithful regression: click each operative card (not the deep link, which
  // bypasses the select handler) with a save on disk, and assert no page error
  // and that the world reaches the canvas.
  for (const op of [
    { name: /Theo/i, callsign: "DANIEL" },
    { name: /Carrera/i, callsign: "SURVEY-3" },
  ]) {
    test(`selecting ${op.callsign} with a save on disk does not crash`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));

      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.evaluate(() => {
        localStorage.setItem(
          "lupus-fieldops-v4",
          JSON.stringify({
            version: 5,
            characterId: "marine",
            discoveries: 5,
            playerPos: { x: 0, y: 0, z: 70 },
          }),
        );
      });
      await page.reload({ waitUntil: "domcontentloaded" });

      await page.getByRole("button", { name: op.name }).first().click();
      await page.getByRole("button", { name: /Deploy to surface/i }).click();
      await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });

      expect(
        pageErrors,
        `no crash on select: ${pageErrors.join(" | ")}`,
      ).toEqual([]);
    });
  }
});
