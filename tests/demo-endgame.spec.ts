import { expect, test, type Page } from "@playwright/test";
import * as fs from "node:fs";
import { deployToSurface, hudText, probe, settle, teleport } from "./helpers";

/**
 * SEGMENT 4 — endgame, both endings, funnel. Probe spec: heavy on
 * console.log dumps + screenshots, light on brittle assertions.
 */

const SHOT = (n: string) => `/tmp/demo/endgame-${n}.png`;

type Err = { kind: string; text: string };

function collectErrors(page: Page): Err[] {
  const errs: Err[] = [];
  page.on("pageerror", (e) => errs.push({ kind: "pageerror", text: String(e) }));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push({ kind: "console", text: m.text() });
  });
  return errs;
}

function dumpErrors(label: string, errs: Err[]) {
  console.log(`ERRORS[${label}] count=${errs.length}`);
  for (const e of errs.slice(0, 12)) console.log(`  ${e.kind}: ${e.text.slice(0, 300)}`);
}

/** Hold the scanner (Q) at the current spot until a marker string shows up. */
async function scanUntil(page: Page, needle: string, maxMs = 120_000): Promise<boolean> {
  await probe(page, (p) => p.setKeys(["KeyQ"]));
  const t0 = Date.now();
  let found = false;
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(2000);
    const t = await hudText(page);
    if (t.includes(needle)) {
      found = true;
      break;
    }
  }
  await probe(page, (p) => p.setKeys([]));
  return found;
}

test.describe("segment 4 — endgame", () => {
  test.setTimeout(360_000);

  test("A0: sealed ruin refuses before reveal (fresh run)", async ({ page }) => {
    const errs = collectErrors(page);
    await deployToSurface(page, { operative: "marine", spawn: "ruins", tod: "0.5" });

    let t = await hudText(page);
    console.log("PRE: has 'Locate the southern ruin'?", t.includes("Locate the southern ruin"));
    console.log("PRE: has 'Enter the chamber'?", t.includes("Enter the chamber"));

    // Ruin entity at (18,155), pick radius 7.
    await teleport(page, 18, 150, Math.PI);
    await settle(page, 2000);
    t = await hudText(page);
    console.log("AT RUIN prompt slice:", t.match(/Inspect chamber seal|Enter chamber|Alloy inert[^\n]*/g));
    await page.screenshot({ path: SHOT("a0-seal-prompt") });

    await page.keyboard.press("KeyE");
    await settle(page, 2000);
    t = await hudText(page);
    console.log("AFTER E: NO RESPONSE?", t.includes("CHAMBER SEAL — NO RESPONSE"));
    console.log("AFTER E: REMEMBER modal?", t.includes("TRANSLATION ACTIVE"));
    console.log("AFTER E: codex line:", t.match(/CODEX — [^\n]*/g));

    // Poke: press E again — refusal should be idempotent, no crash, no dup codex.
    await page.keyboard.press("KeyE");
    await settle(page, 1500);
    t = await hudText(page);
    console.log("AFTER 2nd E: still playing?", t.includes("OBJECTIVES"));
    console.log("AFTER 2nd E: modal leaked?", t.includes("TRANSLATION ACTIVE"));
    console.log("OBJ PANEL: 'Enter the chamber' visible?", t.includes("Enter the chamber"));
    await page.screenshot({ path: SHOT("a0-after-refuse") });
    dumpErrors("A0", errs);
  });

  test("A1: scan reveal -> open ruin -> continue exploring -> re-open probe", async ({ page }) => {
    const errs = collectErrors(page);
    await deployToSurface(page, { operative: "marine", spawn: "colony", tod: "0.5" });

    let t = await hudText(page);
    console.log("PRE-SCAN: ruins task visible?", t.includes("Locate the southern ruin"));
    console.log("PRE-SCAN: remember visible?", t.includes("Enter the chamber"));

    // EM lattice node scan target at (12,58) r=12.
    await teleport(page, 12, 58, 0);
    await settle(page, 1500);
    const scanned = await scanUntil(page, "SCAN COMPLETE — EM lattice node");
    console.log("SCAN completed?", scanned);
    t = await hudText(page);
    console.log("POST-SCAN tasking line:", t.match(/TASKING — EM gradient[^\n]*/g));
    console.log("POST-SCAN: 'Locate the southern ruin' visible?", t.includes("Locate the southern ruin"));
    console.log("POST-SCAN: 'Enter the chamber' visible (should be NO)?", t.includes("Enter the chamber"));
    await page.screenshot({ path: SHOT("a1-post-scan") });

    // To the ruin.
    await teleport(page, 18, 150, Math.PI);
    await settle(page, 2000);
    t = await hudText(page);
    console.log("RUIN prompt:", t.match(/Enter chamber|Inspect chamber seal|Approach|Press E/g));
    await page.keyboard.press("KeyE");
    await settle(page, 2500);
    t = await hudText(page);
    const modalUp = t.includes("TRANSLATION ACTIVE") && t.includes("REMEMBER");
    console.log("RUIN MODAL up?", modalUp);
    console.log("MODAL has Seal/Continue/Broadcast?",
      t.includes("Seal log & return"), t.includes("Continue exploring"),
      t.includes("AUTHORIZE UNCOLLARED TRANSMIT"));
    console.log("OBJECTIVE COMPLETE ruins?", t.includes("OBJECTIVE COMPLETE — Locate the southern ruin"));
    await page.screenshot({ path: SHOT("a1-ruin-modal") });
    expect(modalUp).toBe(true);

    // Continue exploring -> back to play.
    await page.getByRole("button", { name: "Continue exploring" }).click();
    await settle(page, 2000);
    t = await hudText(page);
    console.log("BACK TO PLAY: HUD objectives?", t.includes("OBJECTIVES"));
    console.log("BACK TO PLAY: modal gone?", !t.includes("TRANSLATION ACTIVE"));
    console.log("REMEMBER tasking now visible?", t.includes("Enter the chamber"));

    // Re-open probe: walk away and back, look for any prompt at the ruin.
    await teleport(page, 18, 120, Math.PI);
    await settle(page, 1500);
    await teleport(page, 18, 151, Math.PI);
    await settle(page, 2500);
    t = await hudText(page);
    const prompt = t.match(/Enter chamber|Inspect chamber seal|Press E|Approach/g);
    console.log("RE-OPEN prompt after continue-exploring:", prompt);
    await page.screenshot({ path: SHOT("a1-reopen-probe") });
    await page.keyboard.press("KeyE");
    await settle(page, 2000);
    t = await hudText(page);
    console.log("RE-OPEN after E: modal up?", t.includes("TRANSLATION ACTIVE"));
    console.log("RE-OPEN after E: objectives HUD?", t.includes("OBJECTIVES"));
    await page.screenshot({ path: SHOT("a1-reopen-after-e") });
    dumpErrors("A1", errs);
  });

  test("A2: silent ending -> CompleteScreen -> new operative reset", async ({ page }) => {
    const errs = collectErrors(page);
    const apiHits: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/")) apiHits.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    page.on("response", (r) => {
      if (r.url().includes("/api/")) apiHits.push(`  -> ${r.status()} ${new URL(r.url()).pathname}`);
    });

    await deployToSurface(page, { operative: "marine", spawn: "colony", tod: "0.5" });
    await teleport(page, 12, 58, 0);
    await settle(page, 1000);
    const scanned = await scanUntil(page, "SCAN COMPLETE — EM lattice node");
    console.log("SCAN completed?", scanned);
    await teleport(page, 18, 150, Math.PI);
    await settle(page, 2000);
    await page.keyboard.press("KeyE");
    await settle(page, 2000);

    await page.getByRole("button", { name: "Seal log & return" }).click();
    await settle(page, 3000);
    let t = await hudText(page);
    console.log("COMPLETE: header?", t.includes("SIM-012 COMPLETE"), "breach?", t.includes("PROTOCOL BREACH"));
    console.log("COMPLETE: 'Field log sealed'?", t.includes("Field log sealed"));
    console.log("COMPLETE: silent epilogue?", t.includes("archived to the Odyssey training database"));
    const stats = t.match(/\d+\/\d+ objectives · \d+ codex/);
    console.log("COMPLETE stats line:", stats?.[0]);
    console.log("COMPLETE: download btn?", t.includes("Download log"), "share btn?", t.includes("Share log"));
    const tallyLine = t.match(/ODYSSEY COMMAND — [^\n]*/);
    console.log("COMPLETE tally line:", tallyLine?.[0] ?? "(none rendered)");
    const novelHref = await page
      .locator("a", { hasText: "2121: EXODUS" })
      .getAttribute("href")
      .catch(() => null);
    console.log("NOVEL link href:", novelHref);
    console.log("API traffic:", JSON.stringify(apiHits));
    await page.screenshot({ path: SHOT("a2-complete-silent") });

    // Download from the complete screen.
    const dl = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
    await page.getByRole("button", { name: "Download log" }).click();
    const download = await dl;
    console.log("COMPLETE download fired?", Boolean(download), download?.suggestedFilename());

    // New operative: arm, verify 5s auto-disarm, then arm+confirm.
    await page.getByRole("button", { name: "New operative" }).click();
    await settle(page, 500);
    t = await hudText(page);
    console.log("RESET armed?", t.includes("CONFIRM — ERASES FIELD LOG"), "hint?", t.includes("STANDS DOWN IN 5S"));
    await page.waitForTimeout(5600);
    t = await hudText(page);
    console.log("RESET auto-disarmed after 5s?", t.includes("New operative") && !t.includes("CONFIRM — ERASES FIELD LOG"));

    await page.getByRole("button", { name: "New operative" }).click();
    await settle(page, 300);
    await page.getByRole("button", { name: /CONFIRM — ERASES FIELD LOG/ }).click();
    await settle(page, 2000);
    t = await hudText(page);
    console.log("AFTER RESET: character select?", t.includes("Miles") || t.includes("OPERATIVE") || t.includes("Select"));
    const save = await page.evaluate(() => localStorage.getItem("lupus-fieldops-v4"));
    console.log("AFTER RESET: save cleared?", save === null);
    await page.screenshot({ path: SHOT("a2-after-reset") });

    // Fresh world: pick an operative, deploy, verify objectives back to 0 and
    // device prefs (quality pinned low by the first deep link) persisted.
    await page.getByRole("button", { name: /Miles/i }).click();
    await page.getByRole("button", { name: /Deploy to surface/i }).click();
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, { timeout: 30_000 });
    await settle(page, 2500);
    t = await hudText(page);
    console.log("FRESH RUN objectives header:", t.match(/OBJECTIVES \d+\/\d+/)?.[0]);
    console.log("FRESH RUN: old ruins task leaked?", t.includes("Locate the southern ruin"));
    const blob = await page.evaluate(() => localStorage.getItem("lupus-fieldops-v4"));
    if (blob) {
      const s = JSON.parse(blob);
      console.log("FRESH SAVE: quality =", s.quality, "ending =", s.ending, "doneCount =",
        (s.objectives ?? []).filter((o: { done?: boolean }) => o.done).length,
        "journal =", (s.journal ?? []).length);
    } else console.log("FRESH SAVE: none written yet");
    await page.screenshot({ path: SHOT("a2-fresh-run") });
    dumpErrors("A2", errs);
  });

  test("B: broadcast ending — countersign arm/auto-disarm, dark epilogue", async ({ page }) => {
    const errs = collectErrors(page);
    const apiHits: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/")) apiHits.push(`${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`);
    });

    await deployToSurface(page, { operative: "marine", spawn: "colony", tod: "0.5" });
    await teleport(page, 12, 58, 0);
    await settle(page, 1000);
    console.log("SCAN completed?", await scanUntil(page, "SCAN COMPLETE — EM lattice node"));
    await teleport(page, 18, 150, Math.PI);
    await settle(page, 2000);
    await page.keyboard.press("KeyE");
    await settle(page, 2000);
    let t = await hudText(page);
    expect(t.includes("TRANSLATION ACTIVE")).toBe(true);

    // Arm and IGNORE: must stand down on its own after 5s.
    await page.getByRole("button", { name: /AUTHORIZE UNCOLLARED TRANSMIT/ }).click();
    await settle(page, 400);
    t = await hudText(page);
    console.log("ARMED: countersign shown?", t.match(/COUNTERSIGN [^\n]*TRANSMIT STAR MAPS/)?.[0]);
    console.log("ARMED: stands-down hint?", t.includes("STANDS DOWN IN 5S"));
    await page.screenshot({ path: SHOT("b-armed") });
    await page.waitForTimeout(5600);
    t = await hudText(page);
    const disarmed = t.includes("AUTHORIZE UNCOLLARED TRANSMIT — COUNTERSIGN REQUIRED");
    console.log("AUTO-DISARMED after 5s?", disarmed, "ended prematurely?", t.includes("Transmission logged"));

    // Arm + confirm.
    await page.getByRole("button", { name: /AUTHORIZE UNCOLLARED TRANSMIT/ }).click();
    await settle(page, 400);
    await page.getByRole("button", { name: /TRANSMIT STAR MAPS/ }).click();
    await settle(page, 3000);
    t = await hudText(page);
    console.log("BROADCAST: breach header?", t.includes("PROTOCOL BREACH"));
    console.log("BROADCAST: 'Transmission logged'?", t.includes("Transmission logged"));
    console.log("BROADCAST: REMEMBERED. beat?", t.includes("REMEMBERED."));
    console.log("BROADCAST: dark epilogue?", t.includes("eleven seconds of uncollared"));
    console.log("BROADCAST tally line:", t.match(/ODYSSEY COMMAND — [^\n]*/)?.[0] ?? "(none)");
    console.log("API traffic:", JSON.stringify(apiHits));
    await page.screenshot({ path: SHOT("b-complete-broadcast") });

    // Return to surface: storm forced + signal pegged should be observable.
    await page.getByRole("button", { name: "Return to surface" }).click();
    await settle(page, 3000);
    t = await hudText(page);
    console.log("SURFACE: WX label:", t.match(/WX \w+/)?.[0]);
    console.log("SURFACE: ticker carrier line?", t.includes("CARRIER OPEN — STAR MAPS TRANSMITTING"));
    console.log("SURFACE: quiet protocol line?", t.includes("QUIET PROTOCOL — VIOLATED"));
    await page.screenshot({ path: SHOT("b-surface-after") });
    dumpErrors("B", errs);
  });

  test("J: journal composer x3, export .txt with FURTHER READING", async ({ page }) => {
    const errs = collectErrors(page);
    await deployToSurface(page, { operative: "marine", spawn: "colony", tod: "0.5" });

    await page.keyboard.press("KeyJ");
    await settle(page, 1000);
    let t = await hudText(page);
    console.log("JOURNAL open?", t.includes("FIELD JOURNAL"), "counter:", t.match(/FILED \d\/3/)?.[0]);

    // Empty note must not file.
    const fileBtn = page.getByRole("button", { name: "File note" });
    console.log("File btn disabled when empty?", await fileBtn.isDisabled());

    const body = page.getByPlaceholder("Observation, bearing, anything the survey should carry.");
    const title = page.getByPlaceholder("Subject line");

    // Poke: type overlay hotkeys into the composer — must not trigger photo/journal toggles.
    await body.click();
    await body.fill("jp pk note one — keys must stay in the box");
    await title.fill("Note one");
    t = await hudText(page);
    console.log("Still in journal after typing j/p?", t.includes("FIELD JOURNAL"));
    await fileBtn.click();
    await settle(page, 400);
    t = await hudText(page);
    console.log("After note 1:", t.match(/FILED \d\/3/)?.[0], "filed toast?", t.includes("JOURNAL — note filed"));

    await body.fill("note two");
    await fileBtn.click();
    await settle(page, 300);
    await body.fill("note three");
    await fileBtn.click();
    await settle(page, 800);
    t = await hudText(page);
    console.log("After note 3: journal3 complete?", t.includes("OBJECTIVE COMPLETE — File three journal notes"));
    console.log("Authored badges:", (t.match(/OPERATIVE AUTHORED/g) ?? []).length);
    await page.screenshot({ path: SHOT("j-composer") });

    // Export .txt
    const dlP = page.waitForEvent("download", { timeout: 15_000 });
    await page.getByRole("button", { name: "Download .txt" }).click();
    const dl = await dlP;
    const path = await dl.path();
    console.log("DOWNLOAD:", dl.suggestedFilename(), "path?", Boolean(path));
    if (path) {
      const txt = fs.readFileSync(path, "utf8");
      console.log("TXT header ok?", txt.startsWith("FIELD OPS JOURNAL — LUPUS STELLA"));
      console.log("TXT has FURTHER READING?", txt.includes("FURTHER READING"));
      const refs = txt.match(/Continue in 2121: EXODUS — Ch\. \d+:[^\n]*/g) ?? [];
      console.log("TXT chapter refs:", refs.length, refs.slice(0, 4));
      console.log("TXT site url line?", /exodus2121|http/.test(txt.split("FURTHER READING")[1] ?? ""));
      console.log("TXT notes present?", txt.includes("note three"), txt.includes("Note one"));
    }
    // Close and re-open — entries persist.
    await page.getByRole("button", { name: "Close" }).click();
    await settle(page, 800);
    await page.keyboard.press("KeyJ");
    await settle(page, 800);
    t = await hudText(page);
    console.log("Re-open: entries still there?", t.includes("Note one"));
    await page.keyboard.press("Escape");
    await settle(page, 500);
    dumpErrors("J", errs);
  });

  test("P: photo mode capture -> PNG download + journal entry, HUD hidden", async ({ page }) => {
    const errs = collectErrors(page);
    await deployToSurface(page, { operative: "marine", spawn: "colony", tod: "0.5" });

    let t = await hudText(page);
    const hudHadObjectives = t.includes("OBJECTIVES");
    await page.keyboard.press("KeyP");
    await settle(page, 1500);
    t = await hudText(page);
    console.log("PHOTO: controls up?", t.includes("CAPTURE"), "FOV slider?", t.includes("FOV"));
    console.log("PHOTO: HUD hidden?", hudHadObjectives && !t.includes("OBJECTIVES"));
    console.log("PHOTO: nameplates/prompts gone?", !t.includes("Press E") && !t.includes("Talk —"));
    await page.screenshot({ path: SHOT("p-photo-ui") });

    const dlP = page.waitForEvent("download", { timeout: 20_000 });
    await page.getByRole("button", { name: "CAPTURE" }).click();
    // Poke: double-click while busy — the guard should swallow it.
    await page.getByRole("button", { name: "CAPTURE" }).click({ force: true }).catch(() => undefined);
    const dl = await dlP;
    const path = await dl.path();
    console.log("PHOTO download:", dl.suggestedFilename());
    if (path) {
      const buf = fs.readFileSync(path);
      const isPng = buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      console.log("PHOTO PNG ok?", isPng, `dims ${w}x${h}`, `bytes ${buf.length}`);
      fs.copyFileSync(path, SHOT("p-capture-artifact"));
    }
    // Exit photo, check journal entry landed.
    await page.keyboard.press("KeyP");
    await settle(page, 1000);
    await page.keyboard.press("KeyJ");
    await settle(page, 1000);
    t = await hudText(page);
    console.log("JOURNAL has 'Field photograph'?", t.includes("Field photograph"));
    console.log("Photo entry is SYSTEM (not authored)?", t.includes("Field photograph") && t.match(/FILED (\d)\/3/)?.[1] === "0");
    await page.keyboard.press("Escape");
    dumpErrors("P", errs);
  });
});
