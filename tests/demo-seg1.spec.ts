import { test, expect, type Page } from "@playwright/test";
import { settle, teleport, hudText } from "./helpers";

/**
 * SEGMENT 1 — GOLDEN PATH (fresh player, keyboard). Probe-style: dumps state
 * to stdout and screenshots to /tmp/demo/seg1-*.png; hard assertions only for
 * the segment's explicit checks.
 */

const SHOT = (n: string) => `/tmp/demo/seg1-${n}.png`;

function wireErrors(page: Page, bucket: string[]) {
  page.on("pageerror", (e) => bucket.push(`PAGEERROR: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") bucket.push(`CONSOLE-ERROR: ${m.text()}`);
  });
}

async function dumpErrors(tag: string, errors: string[]) {
  console.log(`[${tag}] errors=${errors.length}`);
  for (const e of errors.slice(0, 20)) console.log(`  ${e}`);
}

/** Wait for character select to be interactable (boot auto-advances). */
async function waitForSelect(page: Page) {
  await page
    .getByRole("button", { name: /Deploy|Miles|Theo/i })
    .first()
    .waitFor({ timeout: 30_000 });
}

async function deployViaUI(page: Page) {
  await page.goto("/?quality=low", { waitUntil: "domcontentloaded" });
  await waitForSelect(page);
  await page.getByRole("button", { name: /Miles/i }).click();
  await page.getByRole("button", { name: /Deploy to surface/i }).click();
  await page.waitForSelector("canvas", { timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__controlsTest), null, {
    timeout: 30_000,
  });
  await settle(page);
}

/** Press E and give the store a beat. */
async function interact(page: Page) {
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(800);
}

test.describe("segment 1 golden path", () => {
  test("cold load: boot -> character select -> briefing -> deploy", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    wireErrors(page, errors);

    await page.goto("/?quality=low", { waitUntil: "domcontentloaded" });
    // Boot screen: capture whatever is on screen immediately.
    await page.waitForTimeout(400);
    console.log("[boot] body snippet:", (await hudText(page)).slice(0, 400));
    await page.screenshot({ path: SHOT("01-boot") });

    await waitForSelect(page);
    const selText = await hudText(page);
    console.log("[select] full text:\n", selText);
    await page.screenshot({ path: SHOT("02-select"), fullPage: true });

    // Spoiler defaults book1.
    const spoilerVal = await page
      .locator("select")
      .first()
      .inputValue()
      .catch(() => "NO-SELECT-FOUND");
    console.log("[select] spoiler value:", spoilerVal);
    expect(spoilerVal).toBe("book1");

    // Resume card ABSENT on fresh profile.
    const resumeCount = await page
      .getByRole("button", { name: /RESUME OPERATION/i })
      .count();
    console.log("[select] resume cards:", resumeCount);
    expect(resumeCount).toBe(0);

    // Three operative cards with stats.
    for (const name of [/Theo Daniel/i, /Miles/i]) {
      console.log(
        "[select] card",
        String(name),
        "count:",
        await page.getByRole("button", { name }).count(),
      );
    }

    // Pick Miles -> briefing.
    await page.getByRole("button", { name: /Miles/i }).click();
    await page.waitForTimeout(600);
    const briefing = await hudText(page);
    console.log("[briefing] text:\n", briefing);
    await page.screenshot({ path: SHOT("03-briefing"), fullPage: true });

    // Deploy — sample frames through the insertion transition looking for
    // black gaps.
    await page.getByRole("button", { name: /Deploy to surface/i }).click();
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(900);
      await page.screenshot({ path: SHOT(`04-insertion-${i}`) });
    }
    await page.waitForSelector("canvas", { timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, {
      timeout: 30_000,
    });
    await settle(page, 4000);
    await page.screenshot({ path: SHOT("05-spawned") });
    console.log("[spawn] hud:\n", await hudText(page));
    await dumpErrors("cold-load", errors);
  });

  test("colony loop: perimeter, NPCs, dome, collar, scan, region card, pause", async ({
    page,
  }) => {
    test.setTimeout(540_000);
    const errors: string[] = [];
    wireErrors(page, errors);

    await deployViaUI(page);
    console.log("[loop] spawn hud:\n", await hudText(page));
    await page.screenshot({ path: SHOT("10-loop-spawn") });

    // --- south perimeter objective ---
    await teleport(page, 0, 42);
    await settle(page, 2000);
    let hud = await hudText(page);
    console.log(
      "[perimeter] contains 'perimeter'?",
      /perimeter/i.test(hud),
      "| ticker-ish lines:",
      hud
        .split("\n")
        .filter((l) => /OBJECTIVE|COMPLETE|perimeter/i.test(l))
        .join(" || "),
    );
    await page.screenshot({ path: SHOT("11-perimeter") });

    // --- NPC dialogues, each opened twice; intro must not repeat ---
    const npcs: Array<[string, number, number]> = [
      ["thornhill", -18, 14],
      ["castillo", 8, 24],
      ["voss", 16, 10],
    ];
    for (const [id, x, z] of npcs) {
      await teleport(page, x, z);
      await settle(page, 1500);
      console.log(`[${id}] prompt:`, (await hudText(page)).split("\n").filter((l) => /Talk|Press E/i.test(l)).join(" | "));
      await interact(page);
      const openA = await page.locator("button").allInnerTexts();
      console.log(`[${id}] FIRST open choices:`, JSON.stringify(openA));
      await page.screenshot({ path: SHOT(`12-${id}-first`) });
      // Take choice 1 (the once-gated intro), read the node, then leave.
      await page.keyboard.press("Digit1");
      await page.waitForTimeout(700);
      console.log(
        `[${id}] after choice1:`,
        (await hudText(page)).split("\n").slice(0, 30).join(" / "),
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
      // Reopen: intro option must be gone, hub must render.
      await interact(page);
      const openB = await page.locator("button").allInnerTexts();
      console.log(`[${id}] SECOND open choices:`, JSON.stringify(openB));
      await page.screenshot({ path: SHOT(`13-${id}-second`) });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      // Third quick open/close — repeat-action poke.
      await interact(page);
      const openC = await page.locator("button").allInnerTexts();
      console.log(`[${id}] THIRD open choices:`, JSON.stringify(openC));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }
    hud = await hudText(page);
    console.log(
      "[npcs] objective lines:",
      hud.split("\n").filter((l) => /staff|objective/i.test(l)).join(" || "),
    );

    // --- command dome enter + exit ---
    await teleport(page, 0, 9);
    await settle(page, 1500);
    console.log("[dome] entry prompt:", (await hudText(page)).split("\n").filter((l) => /dome|Press E|Ops/i.test(l)).join(" | "));
    await interact(page);
    await settle(page, 1500);
    hud = await hudText(page);
    console.log("[dome] inside hud lines:", hud.split("\n").filter((l) => /dome|Rest|Exit/i.test(l)).join(" | "));
    await page.screenshot({ path: SHOT("14-dome-inside") });
    await interact(page); // exit
    await settle(page, 1500);
    console.log("[dome] after exit:", (await hudText(page)).split("\n").filter((l) => /dome|Enter|Exit/i.test(l)).join(" | "));

    // --- west collar: E to unlock codex, then read the codex body ---
    await teleport(page, -22, 12);
    await settle(page, 1500);
    console.log("[collar] prompt:", (await hudText(page)).split("\n").filter((l) => /collar|Inspect|scan/i.test(l)).join(" | "));
    await interact(page);
    await page.keyboard.press("KeyC");
    await page.waitForTimeout(1000);
    // Open the collars entry if it is a list item.
    const collarBtn = page.locator("button", { hasText: /Modulation collars/i }).first();
    if (await collarBtn.count()) {
      await collarBtn.click();
      await page.waitForTimeout(600);
    }
    const codexText = await hudText(page);
    console.log("[codex] text:\n", codexText);
    await page.screenshot({ path: SHOT("15-codex-collars"), fullPage: true });
    console.log(
      "[codex] contains 'forty-three'?",
      /forty-three/i.test(codexText),
    );
    expect(codexText).not.toMatch(/forty-three/i);
    // Codex is a HUD panel: C toggles it closed. (Escape here would PAUSE.)
    await page.keyboard.press("KeyC");
    await page.waitForTimeout(600);
    // Edge poke: does Escape close the panel or pause under it?
    await page.keyboard.press("KeyC");
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    const escPoke = await hudText(page);
    console.log(
      "[codex-esc-poke] paused-under-panel?",
      /SYSTEMS HOLD|Paused/i.test(escPoke),
      "| codex still open?",
      /Modulation collars/i.test(escPoke),
    );
    await page.screenshot({ path: SHOT("15b-codex-esc-poke"), fullPage: true });
    // Restore: unpause if paused, close panel.
    if (/SYSTEMS HOLD|Paused/i.test(escPoke)) {
      await page.getByRole("button", { name: /^Resume$/i }).click();
      await page.waitForTimeout(600);
    }
    await page.keyboard.press("KeyC");
    await page.waitForTimeout(600);

    // --- sensor mast scan (hold Q) ---
    await teleport(page, 12, 58);
    await settle(page, 1500);
    await page.keyboard.down("KeyQ");
    let scanned = false;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(2500);
      const t = await hudText(page);
      if (/SCAN COMPLETE/i.test(t)) {
        scanned = true;
        console.log(
          "[scan] complete after ~",
          (i + 1) * 2.5,
          "s | line:",
          t.split("\n").filter((l) => /SCAN/i.test(l)).join(" | "),
        );
        break;
      }
      if (i % 3 === 2)
        console.log(
          "[scan] progress lines:",
          t.split("\n").filter((l) => /SCAN|scan/i.test(l)).join(" | "),
        );
    }
    await page.keyboard.up("KeyQ");
    console.log("[scan] scanned =", scanned);
    await page.screenshot({ path: SHOT("16-scan") });

    // --- region card on leaving the colony (treeline) ---
    await teleport(page, 4, 80);
    let regionSeen = "";
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(900);
      const t = await hudText(page);
      const m = t
        .split("\n")
        .filter((l) => /REGION|TREELINE|ENTERING|treeline/i.test(l));
      if (m.length) {
        regionSeen = m.join(" | ");
        break;
      }
    }
    console.log("[region] card:", regionSeen || "NOT SEEN");
    await page.screenshot({ path: SHOT("17-region") });

    // --- objectives/compass snapshot ---
    hud = await hudText(page);
    console.log("[state] full hud after loop:\n", hud);

    // --- pause menu + abort two-step arm/disarm ---
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    hud = await hudText(page);
    console.log("[pause] text:\n", hud);
    await page.screenshot({ path: SHOT("18-pause") });
    expect(hud).toMatch(/Settings \/ mission board/i);
    expect(hud).toMatch(/Field journal/i);
    await page.getByRole("button", { name: /Abort \/ change operative/i }).click();
    await page.waitForTimeout(300);
    hud = await hudText(page);
    console.log(
      "[abort] armed?",
      /CONFIRM — SEALS AND ERASES/i.test(hud),
    );
    expect(hud).toMatch(/CONFIRM/);
    await page.screenshot({ path: SHOT("19-abort-armed") });
    await page.waitForTimeout(5600);
    hud = await hudText(page);
    console.log(
      "[abort] disarmed after 5.6s?",
      /Abort \/ change operative/i.test(hud) && !/CONFIRM — SEALS/i.test(hud),
    );
    expect(hud).not.toMatch(/CONFIRM — SEALS/);
    await page.getByRole("button", { name: /^Resume$/i }).click();
    await page.waitForTimeout(800);
    console.log(
      "[pause] resumed, canvas visible:",
      await page.locator("canvas").isVisible(),
    );

    await dumpErrors("colony-loop", errors);
  });

  test("edge pokes: queued E during dialogue, Escape close, paused E queue, Voss once-gate", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    wireErrors(page, errors);

    // Fast deploy via deep link (UI path already covered).
    await page.goto("/?quality=low&operative=marine&spawn=colony", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: /Deploy to surface/i }).click();
    await page.waitForSelector("canvas", { timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, {
      timeout: 30_000,
    });
    await settle(page, 3000);

    const dialogOpen = () => page.locator('[role="dialog"]').count();
    const dialogText = async () =>
      (await dialogOpen()) ? page.locator('[role="dialog"]').innerText() : "";

    // A) Open Thornhill, wait for the modal properly, press E WHILE OPEN,
    //    then close with the Close button. Does the dialogue reopen?
    await teleport(page, -18, 12);
    await settle(page, 1500);
    await page.keyboard.press("KeyE");
    await page
      .locator('[role="dialog"]')
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    console.log("[A] dialog after E:", await dialogOpen());
    await page.keyboard.press("KeyE"); // stale edge candidate
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /^Close$/ }).click();
    await page.waitForTimeout(2500);
    const reopened = await dialogOpen();
    console.log(
      "[A] dialog reopened after Close (queued E)?",
      reopened,
      "| text:",
      (await dialogText()).slice(0, 80),
    );
    await page.screenshot({ path: SHOT("30-queued-e-reopen") });
    // Clean up whatever is open.
    if (reopened) {
      await page.getByRole("button", { name: /^Close$/ }).click();
      await page.waitForTimeout(1500);
    }
    console.log("[A] dialog after cleanup close:", await dialogOpen());

    // B) Escape closes a focused dialogue (keyboard path), no reopen when E
    //    was NOT pressed while open.
    await page.keyboard.press("KeyE");
    await page
      .locator('[role="dialog"]')
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    console.log("[B] dialog open:", await dialogOpen());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2000);
    console.log("[B] dialog after Escape:", await dialogOpen());

    // C) Pause, press E while paused (near Thornhill), resume via button:
    //    does the queued E instantly open the dialogue on resume?
    await page.keyboard.press("Escape"); // pause
    await page.waitForTimeout(1000);
    console.log(
      "[C] paused?",
      /SYSTEMS HOLD/i.test(await hudText(page)),
    );
    await page.keyboard.press("KeyE"); // queued while paused
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /^Resume$/i }).click();
    await page.waitForTimeout(2500);
    console.log(
      "[C] dialog auto-opened after resume (queued E)?",
      await dialogOpen(),
      "| text:",
      (await dialogText()).slice(0, 80),
    );
    await page.screenshot({ path: SHOT("31-paused-e-queue") });
    if (await dialogOpen()) {
      await page.getByRole("button", { name: /^Close$/ }).click();
      await page.waitForTimeout(1500);
    }

    // D) Voss once-gate: choose the intro, close, reopen — intro gone?
    await teleport(page, 16, 8);
    await settle(page, 1500);
    await page.keyboard.press("KeyE");
    await page
      .locator('[role="dialog"]')
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    let t = await dialogText();
    console.log("[D] voss first open:", t.slice(0, 200));
    const intro = page.getByRole("button", {
      name: /Voss\? Contracts and gate\?/i,
    });
    console.log("[D] intro present:", await intro.count());
    if (await intro.count()) {
      await intro.click();
      await page.waitForTimeout(1200);
      console.log("[D] after intro:", (await dialogText()).slice(0, 200));
    }
    await page.getByRole("button", { name: /^Close$/ }).click();
    await page.waitForTimeout(2000);
    await page.keyboard.press("KeyE");
    await page
      .locator('[role="dialog"]')
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    t = await dialogText();
    console.log(
      "[D] voss second open:",
      t.slice(0, 250),
      "| intro still there:",
      await intro.count(),
    );
    await page.screenshot({ path: SHOT("32-voss-second") });

    await dumpErrors("edge-pokes", errors);
  });

  test("reload mid-run: resume card, RESUME continuity, fresh-operative reset", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    const errors: string[] = [];
    wireErrors(page, errors);

    await deployViaUI(page);
    // Make progress worth resuming: perimeter + one NPC.
    await teleport(page, 0, 42);
    await settle(page, 2000);
    await teleport(page, -18, 14);
    await settle(page, 1500);
    await interact(page); // open Thornhill
    await page.keyboard.press("Digit1");
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const beforeHud = await hudText(page);
    console.log(
      "[pre-reload] objective-ish lines:",
      beforeHud.split("\n").filter((l) => /\d+\s*\/\s*\d+|OBJECTIVE/i.test(l)).join(" || "),
    );

    // Reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForSelect(page);
    const selText = await hudText(page);
    console.log("[post-reload] select text:\n", selText);
    await page.screenshot({ path: SHOT("20-resume-card"), fullPage: true });
    const resumeBtn = page.getByRole("button", { name: /RESUME OPERATION/i });
    const resumeCount = await resumeBtn.count();
    console.log("[post-reload] resume card present:", resumeCount);
    expect(resumeCount).toBe(1);
    console.log(
      "[post-reload] resume card body:",
      resumeCount ? await resumeBtn.innerText() : "n/a",
    );

    // RESUME continues.
    await resumeBtn.click();
    await page.waitForSelector("canvas", { timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, {
      timeout: 30_000,
    });
    await settle(page, 3000);
    const resumedHud = await hudText(page);
    console.log("[resumed] hud:\n", resumedHud);
    await page.screenshot({ path: SHOT("21-resumed") });

    // Reload again and pick a FRESH operative: progress must reset.
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForSelect(page);
    await page.getByRole("button", { name: /Theo Daniel/i }).click();
    await page.waitForTimeout(600);
    console.log(
      "[fresh] after clicking Theo:",
      (await hudText(page)).split("\n").slice(0, 25).join(" / "),
    );
    const deploy = page.getByRole("button", { name: /Deploy to surface/i });
    if (await deploy.count()) await deploy.click();
    await page.waitForSelector("canvas", { timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, {
      timeout: 30_000,
    });
    await settle(page, 3000);
    const freshHud = await hudText(page);
    console.log("[fresh] hud after fresh deploy:\n", freshHud);
    await page.screenshot({ path: SHOT("22-fresh-reset") });
    // Objectives reset: pause screen shows counts.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const pauseHud = await hudText(page);
    console.log(
      "[fresh] pause counts:",
      pauseHud.split("\n").filter((l) => /objectives/i.test(l)).join(" | "),
    );
    await page.keyboard.press("Escape");

    await dumpErrors("reload", errors);
  });
});
