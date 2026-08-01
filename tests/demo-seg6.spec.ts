import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { deployToSurface, hudText, probe, settle, teleport } from "./helpers";

/**
 * SEGMENT 6 — Systems, settings, mobile, embed. Probe spec, not a gate:
 * console.log dumps + screenshots to /tmp/demo/seg6-*.png.
 */

const SHOT = (n: string) => `/tmp/demo/seg6-${n}.png`;

function wireErrors(page: Page, bucket: string[]) {
  page.on("pageerror", (e) => bucket.push(`PAGEERROR: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") bucket.push(`CONSOLE: ${m.text()}`);
  });
}

/** deployToSurface with one retry — SwiftShader boots flake under load. */
async function deploy(page: Page, link: Parameters<typeof deployToSurface>[1]) {
  try {
    await deployToSurface(page, link);
  } catch (e) {
    console.log("deploy retry after:", String(e).slice(0, 120));
    await deployToSurface(page, link);
  }
  await settle(page, 1000);
}

test.describe("desktop systems", () => {
  test.setTimeout(300_000);
  test("debug: what happens on K", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await deploy(page, { operative: "marine", spawn: "colony" });
    console.log("HUD after deploy:", (await hudText(page)).slice(0, 400).replace(/\n/g, " | "));
    await page.keyboard.press("KeyK");
    await settle(page, 1000);
    console.log("HUD after K:", (await hudText(page)).slice(0, 600).replace(/\n/g, " | "));
    await page.screenshot({ path: SHOT("debug-k") });
    console.log("ERRORS:", JSON.stringify(errs));
  });

  test("settings: quality live low->high, describeTier strings", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await deploy(page, { operative: "marine", spawn: "colony" });
    await settle(page, 1000);

    await page.keyboard.press("KeyK");
    await settle(page, 800);
    await expect(page.getByText("GRAPHICS PRESET", { exact: true })).toBeVisible();
    const tierLine = () =>
      page
        .locator("p", { hasText: /pixels ·/ })
        .first()
        .innerText();
    console.log("TIER(low pinned):", await tierLine());

    await page.locator("select").first().selectOption("high");
    await settle(page, 5000); // recompile shaders, remount composer
    console.log("TIER(high):", await tierLine());
    await page.screenshot({ path: SHOT("quality-high") });

    await page.locator("select").first().selectOption("medium");
    await settle(page, 4000);
    console.log("TIER(medium):", await tierLine());

    await page.locator("select").first().selectOption("auto");
    await settle(page, 2000);
    console.log("TIER(auto):", await tierLine());

    // resume and confirm world is alive
    await page.getByRole("button", { name: "Resume" }).click();
    await settle(page, 1500);
    const yaw = await probe(page, (p) => p.getYaw());
    console.log("alive after quality churn, yaw =", yaw);
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });

  test("settings: presence + sensitivity + invertY persist across reload", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await deploy(page, { operative: "marine", spawn: "colony" });

    await page.keyboard.press("KeyK");
    // presence off
    const presence = page.getByRole("checkbox").nth(2); // reduced-motion order: invert, reduced, presence
    // safer: locate by label text
    const presenceBox = page
      .locator("label", { hasText: "SURVEY MESH" })
      .locator("input[type=checkbox]");
    await presenceBox.uncheck();
    void presence;
    // sensitivity to max-ish
    const sens = page.locator("label", { hasText: "LOOK SENSITIVITY" }).locator("input[type=range]");
    await sens.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
    const sensLabel = await page.locator("span", { hasText: /LOOK SENSITIVITY/ }).innerText();
    console.log("sens label after 10 right:", sensLabel);
    // invert Y on
    const invert = page
      .locator("label", { hasText: "Invert vertical look" })
      .locator("input[type=checkbox]");
    await invert.check();

    const stored = await page.evaluate(() => ({
      prefs: localStorage.getItem("lupus-fieldops-input-v1"),
      save: localStorage.getItem("lupus-fieldops-v4"),
    }));
    console.log("input prefs stored:", stored.prefs);
    console.log(
      "save presenceEnabled:",
      stored.save ? JSON.parse(stored.save).presenceEnabled : "NO SAVE",
    );

    // reload, re-enter, re-open settings
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page, 2000);
    console.log("post-reload body head:", (await hudText(page)).slice(0, 300).replace(/\n/g, " | "));
    await page.screenshot({ path: SHOT("post-reload") });
    // Try to resume: save exists, so we may land on select w/ resume option
    const resume = page.getByRole("button", { name: /resume|continue/i }).first();
    if (await resume.isVisible().catch(() => false)) {
      await resume.click();
    } else {
      // redeploy fresh via UI
      const deploy = page.getByRole("button", { name: /Deploy to surface/i });
      if (await deploy.isVisible().catch(() => false)) await deploy.click();
    }
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, { timeout: 30_000 });
    await settle(page, 1500);
    await page.keyboard.press("KeyK");
    await expect(page.getByText("GRAPHICS PRESET", { exact: true })).toBeVisible();
    const presenceAfter = await page
      .locator("label", { hasText: "SURVEY MESH" })
      .locator("input[type=checkbox]")
      .isChecked();
    const invertAfter = await page
      .locator("label", { hasText: "Invert vertical look" })
      .locator("input[type=checkbox]")
      .isChecked();
    const sensAfter = await page
      .locator("span", { hasText: /LOOK SENSITIVITY/ })
      .innerText();
    console.log("AFTER RELOAD — presence:", presenceAfter, "invert:", invertAfter, "sens:", sensAfter);
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });

  test("settings: rebind scan Q->T, old dead, new works, persists, reset restores", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await deploy(page, { operative: "marine", spawn: "treeline" });
    // fern bed at (4,74) radius 14 — treeline spawn (0,70) is inside
    await teleport(page, 4, 74, 0);

    // baseline: Q scans
    await page.keyboard.down("KeyQ");
    await page.waitForTimeout(1500);
    const scanWithQ = (await hudText(page)).includes("SCAN ·");
    await page.keyboard.up("KeyQ");
    console.log("baseline Q scans:", scanWithQ);
    await settle(page, 800);

    // rebind scan -> T
    await page.keyboard.press("KeyK");
    await page.getByRole("button", { name: /Field scanner/ }).click();
    await expect(page.getByText("AWAITING KEY…")).toBeVisible();
    await page.keyboard.press("KeyT");
    const scanRow = await page.getByRole("button", { name: /Field scanner/ }).innerText();
    console.log("scan row after rebind:", scanRow.replace(/\n/g, " "));
    // keybind list shows attack/aim rows sanely?
    const allRows = await page
      .locator("ul li button")
      .allInnerTexts();
    console.log("binding rows:", JSON.stringify(allRows.map((r) => r.replace(/\n/g, "=")), null, 1));
    await page.getByRole("button", { name: "Resume" }).click();
    await settle(page, 800);

    // old key dead
    await page.keyboard.down("KeyQ");
    await page.waitForTimeout(1500);
    const qAfter = (await hudText(page)).includes("SCAN ·");
    await page.keyboard.up("KeyQ");
    console.log("Q scans after rebind (want false):", qAfter);
    // new key works
    await page.keyboard.down("KeyT");
    await page.waitForTimeout(1500);
    const tAfter = (await hudText(page)).includes("SCAN ·");
    await page.keyboard.up("KeyT");
    console.log("T scans after rebind (want true):", tAfter);

    // persists after reload
    const prefs = await page.evaluate(() => localStorage.getItem("lupus-fieldops-input-v1"));
    console.log("prefs blob:", prefs);
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page, 1500);
    const resume = page.getByRole("button", { name: /resume|continue/i }).first();
    if (await resume.isVisible().catch(() => false)) await resume.click();
    else {
      const deploy = page.getByRole("button", { name: /Deploy to surface/i });
      if (await deploy.isVisible().catch(() => false)) await deploy.click();
    }
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, { timeout: 30_000 });
    await teleport(page, 4, 74, 0);
    await page.keyboard.down("KeyT");
    await page.waitForTimeout(1500);
    const tPersist = (await hudText(page)).includes("SCAN ·");
    await page.keyboard.up("KeyT");
    console.log("T scans after reload (want true):", tPersist);

    // reset to defaults
    await page.keyboard.press("KeyK");
    await page.getByRole("button", { name: "RESTORE DEFAULTS" }).click();
    const scanRowReset = await page.getByRole("button", { name: /Field scanner/ }).innerText();
    console.log("scan row after reset:", scanRowReset.replace(/\n/g, " "));
    await page.getByRole("button", { name: "Resume" }).click();
    await settle(page, 500);
    await page.keyboard.down("KeyQ");
    await page.waitForTimeout(1500);
    const qReset = (await hudText(page)).includes("SCAN ·");
    await page.keyboard.up("KeyQ");
    console.log("Q scans after reset (want true):", qReset);
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });

  test("rebind edges: map->N honored? scan->M collision?", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await deploy(page, { operative: "marine", spawn: "treeline" });
    await teleport(page, 4, 74, 0);

    // Rebind MAP to N via settings
    await page.keyboard.press("KeyK");
    await page.getByRole("button", { name: /^Map/ }).click();
    await expect(page.getByText("AWAITING KEY…")).toBeVisible();
    await page.keyboard.press("KeyN");
    const mapRow = await page.getByRole("button", { name: /^Map/ }).innerText();
    console.log("map row after rebind:", mapRow.replace(/\n/g, " "));
    await page.getByRole("button", { name: "Resume" }).click();
    await settle(page, 600);

    // Does N open the map?
    await page.keyboard.press("KeyN");
    await settle(page, 600);
    let body = await hudText(page);
    console.log("N opens map (bound key):", body.includes("TACTICAL MAP"));
    // Does M STILL open the map (old key should be dead)?
    await page.keyboard.press("KeyM");
    await settle(page, 600);
    body = await hudText(page);
    console.log("M toggles map despite rebind (want false):", body.includes("TACTICAL MAP"));
    // close if open
    if (body.includes("TACTICAL MAP")) await page.keyboard.press("KeyM");
    await settle(page, 400);

    // restore defaults, then rebind SCAN to M — collision with hardcoded map key?
    await page.keyboard.press("KeyK");
    await page.getByRole("button", { name: "RESTORE DEFAULTS" }).click();
    await page.getByRole("button", { name: /Field scanner/ }).click();
    await page.keyboard.press("KeyM");
    const scanRow = await page.getByRole("button", { name: /Field scanner/ }).innerText();
    const mapRow2 = await page.getByRole("button", { name: /^Map/ }).innerText();
    console.log("scan row:", scanRow.replace(/\n/g, " "), "| map row:", mapRow2.replace(/\n/g, " "));
    await page.getByRole("button", { name: "Resume" }).click();
    await settle(page, 600);
    await page.keyboard.down("KeyM");
    await page.waitForTimeout(1500);
    body = await hudText(page);
    console.log("holding M: scanning?", body.includes("SCAN ·"), "map open too?", body.includes("TACTICAL MAP"));
    await page.keyboard.up("KeyM");
    await page.screenshot({ path: SHOT("scan-m-collision") });
    // cleanup
    await page.keyboard.press("KeyK");
    await page.getByRole("button", { name: "RESTORE DEFAULTS" }).click();
    await page.getByRole("button", { name: "Resume" }).click();
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });

  test("map: waypoint drop/clear, legend, arrow rotation, fast travel", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await deploy(page, { operative: "marine", spawn: "colony" });

    await page.keyboard.press("KeyM");
    await expect(page.getByText("TACTICAL MAP")).toBeVisible();
    const grid = page.getByRole("button", { name: /Tactical map\./ });
    const box = await grid.boundingBox();
    console.log("map grid box:", JSON.stringify(box));
    if (!box) throw new Error("no map grid");
    // drop waypoint bottom-center-ish (south = high z)
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.8);
    await settle(page, 500);
    const body1 = await hudText(page);
    console.log("WPT footer present:", /WPT \d/.test(body1), body1.match(/WPT [^\n]*/)?.[0]);
    console.log("compass WAYPOINT pip? tape excerpt:", body1.match(/WX [A-Z]+/)?.[0]);
    await page.screenshot({ path: SHOT("map-waypoint") });
    // legend
    const legend = await page.locator("ul").last().innerText();
    console.log("legend:", legend.replace(/\n/g, " · "));

    // close map — compass pip should still show waypoint distance
    await page.keyboard.press("KeyM");
    await settle(page, 300);
    const tape = await hudText(page);
    console.log("tape after close has WPT dist?:", tape.match(/\d+m/g)?.slice(0, 6));

    // arrow rotation: read HeadingArrow transform before/after yaw change
    await page.keyboard.press("KeyM");
    await settle(page, 300);
    const rot1 = await page.evaluate(() => {
      const els = [...document.querySelectorAll("span")].filter((e) =>
        e.getAttribute("style")?.includes("rotate"),
      );
      return els.map((e) => e.getAttribute("style"));
    });
    console.log("rotations before yaw:", JSON.stringify(rot1));
    await page.screenshot({ path: SHOT("map-arrow-yaw0") });
    await probe(page, (p) => p.teleport(-4, 30, 2.1));
    await settle(page, 1200);
    const rot2 = await page.evaluate(() => {
      const els = [...document.querySelectorAll("span")].filter((e) =>
        e.getAttribute("style")?.includes("rotate"),
      );
      return els.map((e) => e.getAttribute("style"));
    });
    console.log("rotations after yaw:", JSON.stringify(rot2));
    await page.screenshot({ path: SHOT("map-arrow-yaw2") });

    // waypoint clear via CLEAR
    const clear = page.getByRole("button", { name: "CLEAR" });
    if (await clear.isVisible().catch(() => false)) {
      await clear.click();
      await settle(page, 300);
      console.log(
        "after CLEAR, footer:",
        (await hudText(page)).match(/MARK A WAYPOINT[^\n]*/)?.[0] ?? "??",
      );
    } else console.log("CLEAR button not visible!");

    // waypoint drop then tap-again-to-clear
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await settle(page, 300);
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await settle(page, 300);
    const afterTapClear = (await hudText(page)).match(/MARK A WAYPOINT[^\n]*/)?.[0];
    console.log("tap-to-clear footer:", afterTapClear ?? "STILL SET");

    // fast travel mid-run
    const pos0 = await page.evaluate(() => {
      return (window as any).__controlsTest ? "probe-ok" : "none";
    });
    void pos0;
    await page.keyboard.press("KeyM"); // close map
    await page.keyboard.press("KeyK");
    await expect(page.getByText("MISSION BOARD")).toBeVisible();
    const missionRows = await page
      .locator("ul li button", { hasText: /./ })
      .allInnerTexts();
    console.log("mission rows count:", missionRows.length);
    const ridgeRow = page.locator("button", { hasText: "Ridge-7" }).first();
    const rowName = (await ridgeRow.innerText().catch(() => "n/a")).split("\n")[0];
    console.log("clicking mission:", rowName);
    await ridgeRow.click();
    await settle(page, 800);
    const bodyFT = await hudText(page);
    console.log("fast travel toast:", bodyFT.match(/FAST TRAVEL[^\n]*/)?.[0] ?? "NONE");
    await page.getByRole("button", { name: "Resume" }).click();
    await settle(page, 1500);
    const coords = (await hudText(page)).match(/-?\d+,-?\d+/)?.[0];
    console.log("coords after fast travel (ridge7 is -100,50):", coords);
    await page.screenshot({ path: SHOT("fast-travel") });
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });

  test("keybind overlay: ? modal and hold-Tab peek, includes R strike", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await deploy(page, { operative: "marine", spawn: "colony" });

    // "?" opens modal
    await page.keyboard.press("Shift+Slash");
    await settle(page, 500);
    let body = await hudText(page);
    console.log("modal open:", body.includes("CONTROL BINDINGS"));
    console.log(
      "strike row:",
      body.match(/Strike[^\n]*\n[^\n]*/)?.[0]?.replace(/\n/g, " = ") ?? "MISSING",
    );
    const rows = body.match(/CONTROL BINDINGS[\s\S]*?TOUCH —/)?.[0];
    console.log("overlay rows:\n", rows);
    await page.screenshot({ path: SHOT("keybind-modal") });
    await page.keyboard.press("Escape");
    await settle(page, 400);
    body = await hudText(page);
    console.log("modal closed by Esc:", !body.includes("CONTROL BINDINGS"));
    console.log("esc did not pause (no PAUSED?):", !/PAUSED|SURVEY HOLD/i.test(body));

    // hold Tab peeks
    await page.keyboard.down("Tab");
    await page.waitForTimeout(700);
    body = await hudText(page);
    console.log("peek visible while held:", body.includes("CONTROL BINDINGS"));
    await page.keyboard.up("Tab");
    await settle(page, 400);
    body = await hudText(page);
    console.log("peek gone on release:", !body.includes("CONTROL BINDINGS"));
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });
});

test.describe("embed + routes", () => {
  test.setTimeout(300_000);

  test("embed route: no boot, no scanline, deep link works", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await page.goto("/embed?quality=low", { waitUntil: "domcontentloaded" });
    await settle(page, 2500);
    let body = await hudText(page);
    console.log("embed landing (want character select, no boot):", body.slice(0, 300).replace(/\n/g, " | "));
    console.log("scanline overlays:", await page.locator(".terminal-scan").count());
    await page.screenshot({ path: SHOT("embed-select") });

    // deep link inside embed
    await page.goto("/embed?quality=low&operative=marine&spawn=ridge7&auto=1", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("canvas", { timeout: 45_000 });
    await page
      .waitForFunction(() => Boolean(window.__controlsTest), null, { timeout: 45_000 })
      .catch(() => console.log("no __controlsTest in embed"));
    await settle(page, 3000);
    body = await hudText(page);
    console.log("embed deep link coords (ridge7 -100,50):", body.match(/-?\d+,-?\d+/)?.[0]);
    console.log("scanline overlays in embed world:", await page.locator(".terminal-scan").count());
    await page.screenshot({ path: SHOT("embed-world") });
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });

  test("terminal page launches iframe and reflects phase", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await page.goto("/terminal", { waitUntil: "domcontentloaded" });
    await settle(page, 2000);
    let body = await hudText(page);
    console.log("terminal boot lines:", body.match(/ODYSSEY COMMAND DATABASE[^]*?Embed channel ready\./)?.[0]?.replace(/\n/g, " | ") ?? body.slice(0, 200));
    console.log("phase chip:", body.match(/CH [A-Z]+/)?.[0]);
    await page.getByRole("button", { name: /Launch SIM-012/ }).click();
    await settle(page, 4000);
    body = await hudText(page);
    console.log("phase chip after launch:", body.match(/CH [A-Z]+/)?.[0]);
    const frame = page.frameLocator("#fieldops-frame");
    const frameText = await frame.locator("body").innerText().catch(() => "FRAME UNREADABLE");
    console.log("frame content head:", frameText.slice(0, 200).replace(/\n/g, " | "));
    await page.screenshot({ path: SHOT("terminal") });
    // drive the frame: pick operative, deploy — phase chip should track
    await frame.getByRole("button", { name: /Miles/i }).click().catch((e) => console.log("no Miles btn:", String(e).slice(0, 80)));
    await settle(page, 1000);
    body = await hudText(page);
    console.log("phase chip after select:", body.match(/CH [A-Z]+/)?.[0]);
    await frame.getByRole("button", { name: /Deploy to surface/i }).click().catch(() => console.log("no deploy btn"));
    await settle(page, 8000);
    body = await hudText(page);
    console.log("phase chip after deploy:", body.match(/CH [A-Z]+/)?.[0]);
    // SEND PAUSE roundtrip
    await page.getByRole("button", { name: "SEND PAUSE" }).click();
    await settle(page, 1500);
    body = await hudText(page);
    console.log("phase chip after SEND PAUSE:", body.match(/CH [A-Z]+/)?.[0]);
    await page.screenshot({ path: SHOT("terminal-paused") });
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });

  test("error surfaces: /nonexistent and /offline", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    const resp = await page.goto("/nonexistent", { waitUntil: "domcontentloaded" });
    console.log("/nonexistent status:", resp?.status());
    await settle(page, 1500);
    console.log("/nonexistent body:", (await hudText(page)).slice(0, 400).replace(/\n/g, " | "));
    await page.screenshot({ path: SHOT("404") });

    const resp2 = await page.goto("/offline", { waitUntil: "domcontentloaded" });
    console.log("/offline status:", resp2?.status());
    await settle(page, 1000);
    console.log("/offline body:", (await hudText(page)).slice(0, 300).replace(/\n/g, " | "));
    await page.screenshot({ path: SHOT("offline") });
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });
});

test.describe("deep-link matrix + reduced motion", () => {
  test.setTimeout(300_000);

  test("quality param honored; chapter param honored", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    // quality=high (deployToSurface would pin low; go manual)
    await page.goto("/?quality=high&operative=marine&spawn=colony&auto=1", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, { timeout: 60_000 });
    await settle(page, 2000);
    await page.keyboard.press("KeyK");
    await settle(page, 600);
    const tier = await page.locator("p", { hasText: /pixels ·/ }).first().innerText();
    console.log("?quality=high tier line:", tier);
    await page.getByRole("button", { name: "Resume" }).click();

    // chapter=7 → south-gate spawn, tod 0.7, wx haze
    await page.goto("/?quality=low&operative=marine&chapter=7&auto=1", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, { timeout: 60_000 });
    await settle(page, 2500);
    const body = await hudText(page);
    console.log("chapter=7 coords (south-gate -6,41):", body.match(/-?\d+,-?\d+/)?.[0]);
    console.log("chapter=7 clock (tod .7 => ~19:36 DUSK):", body.match(/\d\d:\d\d · [A-Z]+/)?.[0]);
    console.log("chapter=7 wx (want HAZE):", body.match(/WX [A-Z]+/)?.[0]);
    console.log("chapter=7 note:", body.match(/CH\. 7[^\n]*/)?.[0] ?? "NO TICKER NOTE");
    await page.screenshot({ path: SHOT("chapter7") });
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });

  test("spoiler flip mid-save: book2early adds coast, flip back re-hides", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await deploy(page, { operative: "marine", spawn: "colony" });

    const mapMarkers = async () => {
      await page.keyboard.press("KeyM");
      await settle(page, 500);
      const grid = page.getByRole("button", { name: /Tactical map\./ });
      const titles = await grid.locator("span[title]").evaluateAll((els) =>
        els.map((e) => e.getAttribute("title")),
      );
      await page.keyboard.press("KeyM");
      await settle(page, 300);
      return titles;
    };

    const m1 = await mapMarkers();
    console.log("book1 markers:", JSON.stringify(m1));

    // flip to book2early in settings
    await page.keyboard.press("KeyK");
    await settle(page, 500);
    await page.locator("select").nth(1).selectOption("book2early");
    await settle(page, 400);
    const missions2 = await page.locator("button", { hasText: /Kaguyahime|memorial/i }).count();
    console.log("book2 mission rows visible in settings:", missions2);
    await page.getByRole("button", { name: "Resume" }).click();
    await settle(page, 400);
    const m2 = await mapMarkers();
    console.log("book2early markers:", JSON.stringify(m2));

    // flip BACK
    await page.keyboard.press("KeyK");
    await settle(page, 500);
    await page.locator("select").nth(1).selectOption("book1");
    await settle(page, 400);
    const missions3 = await page.locator("button", { hasText: /Kaguyahime|memorial/i }).count();
    console.log("book2 mission rows after flip back (want 0):", missions3);
    await page.getByRole("button", { name: "Resume" }).click();
    await settle(page, 400);
    const m3 = await mapMarkers();
    console.log("back-to-book1 markers:", JSON.stringify(m3));
    const leaked = m3.filter((t) => !m1.includes(t));
    console.log("leaked markers after flip back (want []):", JSON.stringify(leaked));
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });

  test("reduced motion: scanline gone, particles gone, storms still occur", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    // pin storm so WX label is deterministic
    await page.goto("/?quality=low&operative=marine&spawn=colony&wx=storm&auto=1", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, { timeout: 60_000 });
    await settle(page, 2500);

    const scanVisible = () =>
      page.evaluate(() => {
        const el = document.querySelector(".terminal-scan");
        if (!el) return "absent";
        return getComputedStyle(el).display === "none" ? "display:none" : "visible";
      });
    console.log("scanline before reduced motion:", await scanVisible());
    let body = await hudText(page);
    console.log("WX before:", body.match(/WX [A-Z]+/)?.[0]);

    await page.keyboard.press("KeyK");
    await settle(page, 500);
    await page
      .locator("label", { hasText: "Reduced motion" })
      .locator("input[type=checkbox]")
      .check();
    await settle(page, 400);
    await page.getByRole("button", { name: "Resume" }).click();
    await settle(page, 1500);
    console.log("scanline after reduced motion:", await scanVisible());
    body = await hudText(page);
    console.log("WX after (storm still?):", body.match(/WX [A-Z]+/)?.[0]);
    await page.screenshot({ path: SHOT("reduced-motion-storm") });
    const yaw = await probe(page, (p) => p.getYaw());
    console.log("world alive under reduced motion, yaw:", yaw);
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });
});

test.describe("mobile portrait 375x812", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("character select + deploy usable by touch", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await page.goto("/?quality=low", { waitUntil: "domcontentloaded" });
    await settle(page, 3500); // boot auto-advance
    const body = await hudText(page);
    console.log("select screen:", body.slice(0, 250).replace(/\n/g, " | "));
    await page.screenshot({ path: SHOT("mob-select") });
    const miles = page.getByRole("button", { name: /Miles/i });
    const mb = await miles.boundingBox();
    console.log("Miles card box (viewport 375x812):", JSON.stringify(mb));
    await miles.tap();
    await settle(page, 1000);
    const deployBtn = page.getByRole("button", { name: /Deploy to surface/i });
    const db = await deployBtn.boundingBox();
    console.log("deploy btn box:", JSON.stringify(db));
    await page.screenshot({ path: SHOT("mob-briefing") });
    await deployBtn.tap();
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, { timeout: 60_000 });
    await settle(page, 2500);
    console.log("in world. toast line:", (await hudText(page)).match(/FIELD OPS ONLINE[^\n]*/)?.[0] ?? "no toast text");
    const toast = page.locator('p[role="status"]');
    console.log("toast role=status count:", await toast.count(), "visible:", await toast.first().isVisible().catch(() => false));
    await page.screenshot({ path: SHOT("mob-hud") });
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });

  test("vitals not occluded by SPR/SCN/TAP; toast visible on push", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await deploy(page, { operative: "marine", spawn: "colony" });
    // measure vitals panel vs action buttons
    const boxes = await page.evaluate(() => {
      const out: Record<string, DOMRect | null> = {};
      const vit = [...document.querySelectorAll("div")].find((d) =>
        d.className.includes?.("panel-glass") && d.textContent?.includes("VITALS"),
      );
      out.vitals = vit ? vit.getBoundingClientRect() : null;
      for (const label of ["SPR", "SCN", "TAP"]) {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent === label);
        out[label] = b ? b.getBoundingClientRect() : null;
      }
      return JSON.parse(JSON.stringify(out));
    });
    console.log("boxes:", JSON.stringify(boxes));
    const v = boxes.vitals;
    for (const k of ["SPR", "SCN", "TAP"]) {
      const b = boxes[k];
      if (!v || !b) { console.log(k, "missing!"); continue; }
      const overlap = !(b.left >= v.right || b.right <= v.left || b.top >= v.bottom || b.bottom <= v.top);
      console.log(`${k} overlaps vitals:`, overlap);
    }
    // push a toast: settings via Menu -> pause -> Settings
    await page.getByRole("button", { name: "Menu" }).tap();
    await settle(page, 600);
    console.log("pause menu:", (await hudText(page)).slice(0, 200).replace(/\n/g, " | "));
    await page.getByRole("button", { name: /Settings \/ mission board/ }).tap();
    await settle(page, 600);
    // settings scrollable? tap presence to trigger a message
    const scroll = await page.evaluate(() => {
      const dlg = [...document.querySelectorAll("div,section")].find(
        (d) => d.scrollHeight > d.clientHeight + 20 && d.textContent?.includes("GRAPHICS PRESET"),
      );
      return dlg ? { sh: dlg.scrollHeight, ch: dlg.clientHeight } : null;
    });
    console.log("settings scroll container:", JSON.stringify(scroll));
    const presenceBox = page.locator("label", { hasText: "SURVEY MESH" }).locator("input[type=checkbox]");
    await presenceBox.scrollIntoViewIfNeeded();
    await presenceBox.uncheck({ force: true });
    await settle(page, 300);
    // resume: scroll to Resume button and tap
    const resume = page.getByRole("button", { name: "Resume" });
    await resume.scrollIntoViewIfNeeded();
    await resume.tap();
    await settle(page, 800);
    const toast = page.locator('p[role="status"]');
    const toastTxt = await toast.first().innerText().catch(() => "NONE");
    console.log("toast after presence toggle:", toastTxt);
    await page.screenshot({ path: SHOT("mob-toast") });
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });

  test("photo mode has touch EXIT; journal composer usable", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await deploy(page, { operative: "marine", spawn: "colony" });
    await page.getByRole("button", { name: "Menu" }).tap();
    await settle(page, 500);
    await page.getByRole("button", { name: /Photo mode/ }).tap();
    await settle(page, 1000);
    let body = await hudText(page);
    console.log("photo mode body:", body.slice(0, 200).replace(/\n/g, " | "));
    const exit = page.getByRole("button", { name: "EXIT" });
    console.log("EXIT visible:", await exit.isVisible());
    const eb = await exit.boundingBox();
    console.log("EXIT box:", JSON.stringify(eb));
    await page.screenshot({ path: SHOT("mob-photo") });
    await exit.tap();
    await settle(page, 800);
    body = await hudText(page);
    console.log("back to HUD after EXIT:", body.includes("VITALS"));

    // journal composer via Log
    await page.getByRole("button", { name: "Log" }).tap();
    await settle(page, 800);
    body = await hudText(page);
    console.log("journal panel:", body.slice(0, 250).replace(/\n/g, " | "));
    const title = page.locator("input").first();
    await title.tap();
    await title.fill("Test entry");
    const ta = page.locator("textarea").first();
    await ta.tap();
    await ta.fill("Composed on a phone.");
    await page.screenshot({ path: SHOT("mob-journal") });
    const buttons = await page.locator("button").allInnerTexts();
    console.log("journal buttons:", JSON.stringify(buttons));
    const save = page.getByRole("button", { name: /file|save|log entry/i }).first();
    await save.tap().catch((e) => console.log("save tap failed:", String(e).slice(0, 100)));
    await settle(page, 500);
    body = await hudText(page);
    console.log("after save:", body.slice(0, 300).replace(/\n/g, " | "));
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });
});

test.describe("mobile landscape 812x375", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true });

  test("landscape: HUD, dialogue longest Thornhill node scrolls, settings scrollable", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    // theo has cmd-access for the long drift-real node
    await deploy(page, { operative: "theo", spawn: "colony" });
    await page.screenshot({ path: SHOT("land-hud") });
    // vitals vs action column
    const boxes = await page.evaluate(() => {
      const out: Record<string, unknown> = {};
      const vit = [...document.querySelectorAll("div")].find((d) =>
        d.className.includes?.("panel-glass") && d.textContent?.includes("VITALS"),
      );
      out.vitals = vit ? JSON.parse(JSON.stringify(vit.getBoundingClientRect())) : null;
      for (const label of ["SPR", "SCN", "TAP"]) {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent === label);
        out[label] = b ? JSON.parse(JSON.stringify(b.getBoundingClientRect())) : null;
      }
      out.viewport = { w: innerWidth, h: innerHeight };
      return out;
    });
    console.log("landscape boxes:", JSON.stringify(boxes));

    // walk to Thornhill and open dialogue
    await teleport(page, -18, 12, 0);
    await settle(page, 1500);
    let body = await hudText(page);
    console.log("interact prompt:", body.match(/Talk — [^\n]*/)?.[0] ?? "NONE");
    await page.getByRole("button", { name: "TAP" }).tap();
    await settle(page, 1200);
    body = await hudText(page);
    console.log("dialogue open:", body.includes("COMMS"), body.match(/Mind the cabling[^\n]*/)?.[0]?.slice(0, 60));
    await page.screenshot({ path: SHOT("land-dlg-hub") });
    // hub scroll container state
    const hubScroll = await page.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find(
        (d) => d.className.includes("overflow-y-auto") && d.textContent?.includes("Mind the cabling"),
      );
      return el ? { sh: el.scrollHeight, ch: el.clientHeight } : null;
    });
    console.log("hub node scroll (sh>ch means scrollable):", JSON.stringify(hubScroll));
    // go to command channel -> drift-real (longest)
    const cmd = page.getByRole("button", { name: /Command channel, Doctor/ });
    console.log("cmd choice present:", await cmd.isVisible().catch(() => false));
    if (await cmd.isVisible().catch(() => false)) {
      await cmd.scrollIntoViewIfNeeded();
      await cmd.tap();
    } else {
      await page.getByRole("button", { name: /Walk me through the collars/ }).tap();
    }
    await settle(page, 800);
    body = await hudText(page);
    console.log("node text head:", body.match(/(Ava flagged|Four ZPE)[^\n]*/)?.[0]?.slice(0, 70));
    const nodeScroll = await page.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find(
        (d) => d.className.includes("overflow-y-auto") && (d.textContent?.includes("Ava flagged") || d.textContent?.includes("Four ZPE")),
      );
      if (!el) return null;
      const before = el.scrollTop;
      el.scrollTop = 10000;
      return { sh: el.scrollHeight, ch: el.clientHeight, scrolledTo: el.scrollTop, before };
    });
    console.log("long node scroll:", JSON.stringify(nodeScroll));
    await page.screenshot({ path: SHOT("land-dlg-long") });
    // choices reachable?
    const lastChoice = page.getByRole("button", { name: /Understood. It stays with me|I'll inspect the nearest collar/ }).first();
    const lb = await lastChoice.boundingBox();
    console.log("bottom choice box (viewport h=375):", JSON.stringify(lb));
    await lastChoice.scrollIntoViewIfNeeded();
    await lastChoice.tap();
    await settle(page, 600);
    // close dialogue if still open
    const closeBtn = page.getByRole("button", { name: "Close" });
    if (await closeBtn.isVisible().catch(() => false)) await closeBtn.tap();
    await settle(page, 500);

    // settings scrollable in landscape
    await page.getByRole("button", { name: "Menu" }).tap();
    await settle(page, 500);
    await page.getByRole("button", { name: /Settings \/ mission board/ }).tap();
    await settle(page, 600);
    const setScroll = await page.evaluate(() => {
      const el = [...document.querySelectorAll("div,section")].find(
        (d) => d.scrollHeight > d.clientHeight + 20 && d.textContent?.includes("GRAPHICS PRESET"),
      );
      if (!el) return null;
      el.scrollTop = 100000;
      return { sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop };
    });
    console.log("settings scroll landscape:", JSON.stringify(setScroll));
    await page.screenshot({ path: SHOT("land-settings-bottom") });
    const resume = page.getByRole("button", { name: "Resume" });
    console.log("Resume reachable:", await resume.isVisible());
    await resume.tap();
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });
});

test.describe("edge re-checks", () => {
  test.setTimeout(300_000);

  test("waypoint CLEAR button + rebind Esc cancel", async ({ page }) => {
    const errs: string[] = [];
    wireErrors(page, errs);
    await deploy(page, { operative: "marine", spawn: "colony" });

    await page.keyboard.press("KeyM");
    await settle(page, 600);
    const grid = page.getByRole("button", { name: /Tactical map\./ });
    const box = await grid.boundingBox();
    if (!box) throw new Error("no grid");
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.75);
    await settle(page, 600);
    const clear = page.getByRole("button", { name: "CLEAR", exact: true });
    await clear.waitFor({ state: "visible", timeout: 5000 }).catch(() => console.log("CLEAR never visible"));
    console.log("CLEAR visible now:", await clear.isVisible().catch(() => false));
    await clear.click().catch((e) => console.log("clear click failed:", String(e).slice(0, 120)));
    await settle(page, 500);
    console.log("footer after CLEAR:", (await hudText(page)).match(/MARK A WAYPOINT[^\n]*/)?.[0] ?? "WPT STILL SET");
    await page.keyboard.press("KeyM");

    // Esc cancels rebind capture without changing binding
    await page.keyboard.press("KeyK");
    await settle(page, 500);
    await page.getByRole("button", { name: /Field scanner/ }).click();
    await expect(page.getByText("AWAITING KEY…")).toBeVisible();
    await page.keyboard.press("Escape");
    await settle(page, 400);
    const row = await page.getByRole("button", { name: /Field scanner/ }).innerText();
    console.log("scan row after Esc cancel (want Q / V):", row.replace(/\n/g, " "));
    const stillOpen = await page.getByText("GRAPHICS PRESET", { exact: true }).isVisible().catch(() => false);
    console.log("settings still open after Esc (didn't close panel?):", stillOpen);
    console.log("ERRORS:", JSON.stringify(errs, null, 2));
  });
});
