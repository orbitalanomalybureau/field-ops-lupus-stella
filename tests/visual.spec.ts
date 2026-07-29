import { expect, test, type Locator, type Page } from "@playwright/test";
import { deployToSurface, settle, type DeepLink } from "./helpers";

/**
 * Golden screenshots — the only assertions in the suite that look at pixels.
 *
 * The world is reproducible by construction: the heightfield is analytic, the
 * scatter is seeded, and deep links pin operative, spawn, world clock and
 * weather. The same URL therefore renders the same frame, which is what makes a
 * pixel diff worth running at all — nothing else here would catch a light rig,
 * material or shader regression.
 *
 * Opt-in on purpose. SwiftShader rasterizes differently on macOS and on the
 * Ubuntu runner, so goldens baselined on a dev machine fail every CI run. Only
 * Linux baselines belong in git. See tests/README.md.
 */

/** Shadow maps, LOD selection and shader compilation all finish late. */
const EXTRA_SETTLE_MS = 1500;

/**
 * Falling rain and lightning never repeat frame for frame, so the storm shot
 * guards sky colour, fog and exposure rather than individual particles.
 */
const STORM_DIFF_RATIO = 0.08;

type Shot = {
  /** Golden file stem. */
  name: string;
  link: DeepLink;
  /** What a diff on this frame means — surfaced in the failure line. */
  guards: string;
  maxDiffPixelRatio?: number;
};

type ScreenshotOptions = {
  animations: "disabled";
  mask: Locator[];
  maxDiffPixelRatio?: number;
};

/**
 * tod is the 28-hour world clock as 0..1: 0 is midnight, 0.5 is noon. The
 * operative is pinned to one character across every shot so a change to the
 * player rig shows up everywhere at once.
 */
const SHOTS: Shot[] = [
  {
    name: "colony-dawn-clear",
    link: { operative: "marine", spawn: "colony", tod: "0.26", wx: "clear" },
    guards: "sky gradient and fog seam with the sun on the horizon",
  },
  {
    name: "colony-night-clear",
    link: { operative: "marine", spawn: "colony", tod: "0.02", wx: "clear" },
    guards: "fern bioluminescence and the night light rig at their peak",
  },
  {
    name: "colony-storm",
    link: { operative: "marine", spawn: "colony", tod: "0.45", wx: "storm" },
    guards: "the weather sim/render split — particles, fog lift, sun dim",
    maxDiffPixelRatio: STORM_DIFF_RATIO,
  },
  {
    name: "treeline-day-clear",
    link: { operative: "marine", spawn: "treeline", tod: "0.5", wx: "clear" },
    guards: "Titan canopy density, trunk materials and forest interior light",
  },
  {
    name: "ridge7-day-clear",
    // A low sun casts the longest shadows, which is the point of this frame:
    // player-following shadow maps used to drop out entirely this far west.
    link: { operative: "marine", spawn: "ridge7", tod: "0.38", wx: "clear" },
    guards: "player-following shadows on the western spine",
  },
  {
    name: "ruins-day-clear",
    link: { operative: "marine", spawn: "ruins", tod: "0.6", wx: "clear" },
    guards: "ruin geometry and the approach the endgame is reached through",
  },
  {
    name: "coast-dusk-haze",
    link: {
      operative: "marine",
      spawn: "coast",
      spoiler: "book2early",
      tod: "0.72",
      wx: "haze",
    },
    guards: "Kaguyahime coast, which does not render under the book1 ceiling",
  },
];

/**
 * The scatter is seeded but the decoration is not: the terrain detail texture,
 * the starfield, creature phases and weather particles all draw from
 * Math.random at mount. Replacing it before any app code runs is what makes a
 * pixel comparison possible — otherwise every load paints a different ground.
 */
async function pinEntropy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let seed = 0x9e3779b9;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
}

/**
 * HUD readouts that move on their own. Playwright tolerates a mask locator
 * that matches nothing, so readouts absent from a given frame cost nothing.
 * These are text- and layout-matched because the HUD carries no test hooks; if
 * a mask stops matching, the diff gets noisy rather than wrong.
 */
function volatileHud(page: Page): Locator[] {
  return [
    // "06:12 · DAWN · IDLE"
    page.getByText(/^\d{2}:\d{2} · [A-Z]+ · [A-Z]+$/),
    // "18,140" — the player still drifts a little while the scene settles.
    page.getByText(/^-?\d+,-?\d+$/),
    // Predator lock flickers with creature AI.
    page.getByText("TRACKED", { exact: true }),
    // Comms feed: arrival order tracks wall-clock time, not world state.
    page.locator("div.w-80"),
  ];
}

/**
 * Without pointer lock the hint sits over the middle of every frame. Masking
 * it would cover scene pixels we want compared, so remove it from the paint.
 */
async function hidePointerLockHint(page: Page): Promise<void> {
  const hint = page.getByText(/Click canvas to look/);
  if (await hint.count()) {
    await hint.first().evaluate((el) => {
      el.style.display = "none";
    });
  }
}

/** IBM Plex is fetched from a remote stylesheet; capture after it resolves. */
async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test.describe("golden screenshots", () => {
  test.skip(
    () => !process.env.FIELDOPS_VISUAL,
    "Goldens are opt-in and platform-specific — see tests/README.md.",
  );

  for (const shot of SHOTS) {
    test(`${shot.name} — ${shot.guards}`, async ({ page }) => {
      await pinEntropy(page);
      await deployToSurface(page, shot.link);
      await settle(page, EXTRA_SETTLE_MS);
      await hidePointerLockHint(page);
      await waitForFonts(page);

      const options: ScreenshotOptions = {
        animations: "disabled",
        mask: volatileHud(page),
      };
      if (shot.maxDiffPixelRatio !== undefined) {
        options.maxDiffPixelRatio = shot.maxDiffPixelRatio;
      }
      await expect(page).toHaveScreenshot(`${shot.name}.png`, options);
    });
  }

  test("character-select — 2D shell layout and type scale", async ({ page }) => {
    await pinEntropy(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Miles/i })).toBeVisible({
      timeout: 20_000,
    });
    await waitForFonts(page);

    // No canvas, no clock: this frame is stable enough to compare whole.
    await expect(page).toHaveScreenshot("character-select.png", {
      animations: "disabled",
    });
  });
});
