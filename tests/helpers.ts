import type { Page } from "@playwright/test";

/** The debug surface PlayerController installs on window for QA. */
export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getFps: () => number;
  setKeys: (codes: string[]) => void;
  teleport: (x: number, z: number, yaw?: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

/** Deep-link params the game understands (src/game/store.ts applyDeepLink). */
export type DeepLink = {
  operative?: "theo" | "marine" | "survey";
  spawn?: "south-gate" | "colony" | "ridge7" | "ruins" | "coast" | "treeline";
  spoiler?: "book1" | "book2early";
  chapter?: string;
  auto?: "1";
  /** Test-only: pin the world clock so golden screenshots are reproducible. */
  tod?: string;
  /** Test-only: pin the weather so golden screenshots are reproducible. */
  wx?: "clear" | "haze" | "rain" | "storm";
};

export function deepLinkUrl(link: DeepLink, path = "/"): string {
  const params = new URLSearchParams(
    Object.entries(link).filter(([, v]) => v !== undefined) as [
      string,
      string,
    ][],
  );
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Drive the game from a cold load to a rendered world, via the UI a real
 * player uses. Returns once the canvas has painted at least a few frames.
 */
export async function deployToSurface(
  page: Page,
  link: DeepLink = { operative: "marine" },
): Promise<void> {
  await page.goto(deepLinkUrl(link), { waitUntil: "domcontentloaded" });

  // Boot screen auto-advances; character select needs a pick unless deep-linked.
  if (!link.operative) {
    await page.getByRole("button", { name: /Miles/i }).click();
  }
  await page.getByRole("button", { name: /Deploy to surface/i }).click();

  await page.waitForSelector("canvas", { timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__controlsTest), null, {
    timeout: 30_000,
  });
  await settle(page);
}

/**
 * Wait for the renderer to reach a steady state — shader compilation and the
 * first LOD/instancing passes make the opening frames unrepresentative.
 */
export async function settle(page: Page, ms = 2500): Promise<void> {
  await page.waitForTimeout(ms);
}

/** Hold movement keys for a duration, then release. */
export async function walk(
  page: Page,
  keys: string[],
  ms: number,
): Promise<void> {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

/**
 * Put the operative somewhere. Walking is not viable in this harness: headless
 * WebGL runs at a couple of frames a second and the controller clamps delta,
 * so a metre of ground costs seconds of wall clock.
 */
export async function teleport(
  page: Page,
  x: number,
  z: number,
  yaw?: number,
): Promise<void> {
  await page.evaluate(
    ([px, pz, py]) => window.__controlsTest?.teleport(px!, pz!, py ?? undefined),
    [x, z, yaw ?? null],
  );
  await page.waitForTimeout(1200);
}

export async function probe<T>(
  page: Page,
  fn: (p: ControlsProbe) => T,
): Promise<T> {
  return page.evaluate((body) => {
    const p = window.__controlsTest;
    if (!p) throw new Error("__controlsTest probe missing");
    return new Function("probe", `return (${body})(probe)`)(p) as T;
  }, fn.toString());
}

/** Everything the HUD currently says, for text assertions. */
export async function hudText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}
