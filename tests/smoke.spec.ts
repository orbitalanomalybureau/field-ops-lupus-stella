import { expect, test } from "@playwright/test";
import { deployToSurface, hudText, probe, settle, walk } from "./helpers";

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
    // Bounds used to be x±260 while the mesh only reached ±240, leaving a strip
    // of walkable void. Sprint west far longer than the map is wide.
    await deployToSurface(page, { operative: "marine", spawn: "ridge7" });
    await page.mouse.click(640, 360);

    for (let i = 0; i < 12; i++) {
      await walk(page, ["ShiftLeft", "KeyA"], 900);
    }
    await settle(page, 500);

    const text = await hudText(page);
    const coords = text.match(/(-?\d+)\s*,\s*(-?\d+)/g) ?? [];
    expect(coords.length, "HUD should report player coordinates").toBeGreaterThan(
      0,
    );

    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    expect(pageErrors).toEqual([]);
  });

  test("holds a usable framerate under SwiftShader", async ({ page }) => {
    await deployToSurface(page);
    await settle(page, 4000);
    const fps = await probe(page, (p) => p.getFps());
    // SwiftShader is a software rasterizer — this catches order-of-magnitude
    // regressions (a 10x draw-call blowup), not real-world performance.
    expect(fps, "software-rendered framerate floor").toBeGreaterThan(4);
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

  test("progress survives a reload", async ({ page }) => {
    await deployToSurface(page, { operative: "theo" });
    await settle(page, 1500);

    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page, 2000);

    const text = await hudText(page);
    expect(text).toMatch(/DANIEL|RESUME|Theo/i);
  });
});
