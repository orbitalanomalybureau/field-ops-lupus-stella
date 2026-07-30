/**
 * SEGMENT 2 playtest probe — night, harvest, economy.
 * Not a pass/fail gate: heavy console.log dumps + screenshots to /tmp/demo.
 */
import { test, type Page } from "@playwright/test";
import { deployToSurface, teleport, settle, hudText } from "./helpers";

const SHOT = "/tmp/demo";

function wireErrors(page: Page, label: string): string[] {
  const errs: string[] = [];
  page.on("pageerror", (e) => {
    errs.push(`[pageerror] ${e.message}`);
    console.log(`!! ${label} pageerror: ${e.message}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") {
      errs.push(`[console.error] ${m.text()}`);
      console.log(`!! ${label} console.error: ${m.text()}`);
    }
  });
  return errs;
}

async function holdScan(page: Page, ms: number) {
  await page.evaluate(() => window.__controlsTest?.setKeys(["KeyQ"]));
  await page.waitForTimeout(ms);
  await page.evaluate(() => window.__controlsTest?.setKeys([]));
  await page.waitForTimeout(600);
}

async function pressE(page: Page) {
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1500);
}

async function saveBlob(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("lupus-fieldops-v4");
    return raw ? JSON.parse(raw) : {};
  });
}

function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

/** Click a dialogue choice button by (partial) label. */
async function choose(page: Page, label: string | RegExp) {
  await page.getByRole("button", { name: label }).first().click();
  await page.waitForTimeout(700);
}

async function closeDialogue(page: Page) {
  const end = page.getByRole("button", { name: /End conversation/i });
  if (await end.count()) await end.click();
  else {
    const close = page.getByRole("button", { name: /^Close$/ });
    if (await close.count()) await close.first().click();
  }
  await page.waitForTimeout(700);
}

async function dialogueChoices(page: Page): Promise<string[]> {
  // Choice buttons render "N<label>"; grab all buttons inside the dialog.
  const texts = await page
    .locator("button")
    .allInnerTexts()
    .catch(() => [] as string[]);
  return texts;
}

test.describe.configure({ mode: "serial" });

/* ------------------------------------------------------------------ */
test("A: day refusal, rest to dusk, night harvest, regrowth", async ({
  page,
}) => {
  test.setTimeout(600_000);
  wireErrors(page, "A");
  await deployToSurface(page, { operative: "survey", tod: "0.5" });

  // --- 1. DAY: fern must refuse and stay scannable -------------------
  await teleport(page, 4, 74);
  await settle(page, 1500);
  await holdScan(page, 25_000);
  let hud = await hudText(page);
  console.log("A1 after-day-scan inert-msg count:", count(hud, "inert by day"));
  console.log("A1 has SCAN COMPLETE:", hud.includes("SCAN COMPLETE"));
  console.log("A1 has SPECIMENS row:", hud.includes("SPECIMENS"));
  console.log("A1 has vial-sealed:", hud.includes("spore vial sealed"));
  await page.screenshot({ path: `${SHOT}/seg2-A1-day-refusal.png` });

  // cancel mid-scan edge: short hold, release — no grant expected
  await holdScan(page, 3_000);
  hud = await hudText(page);
  console.log("A1b short-hold grant?:", hud.includes("spore vial sealed"));

  let blob = await saveBlob(page);
  console.log(
    "A1 scannedIds:",
    JSON.stringify(blob["scannedIds"]),
    "inventory:",
    JSON.stringify(blob["inventory"]),
  );

  // --- 2. Enter dome, rest until dusk --------------------------------
  await teleport(page, 0, 9);
  await settle(page, 1500);
  hud = await hudText(page);
  console.log("A2 prompt near entry:", hud.includes("Enter command dome"));
  await pressE(page); // enter dome
  hud = await hudText(page);
  console.log("A2 ops floor msg:", hud.includes("DOME — ops floor access"));

  await teleport(page, -2, 4); // bunk
  await settle(page, 1200);
  hud = await hudText(page);
  console.log("A2 bunk prompt Rest-until-dusk:", hud.includes("Rest until dusk"));
  console.log("A2 clock before:", /\b(DAY|DAWN|DUSK|NIGHT)\b/.exec(hud)?.[0]);
  await page.screenshot({ path: `${SHOT}/seg2-A2-bunk-prompt.png` });
  await pressE(page); // rest
  await settle(page, 2000);
  hud = await hudText(page);
  console.log("A2 rest msg:", hud.includes("REST — watch rotated to dusk"));
  console.log("A2 hud contains DUSK label:", hud.includes("DUSK"));
  console.log("A2 next bunk label:", hud.includes("Rest until dawn") ? "Rest until dawn" : "(unchanged)");
  await page.screenshot({ path: `${SHOT}/seg2-A2-after-rest.png` });

  // --- 3. NIGHT: fern harvest grants spore + SPECIMENS row -----------
  // exit dome first
  await teleport(page, 0.5, 6.5);
  await settle(page, 1200);
  await pressE(page); // exit
  await teleport(page, 4, 74);
  await settle(page, 1500);
  await holdScan(page, 25_000);
  hud = await hudText(page);
  console.log("A3 SCAN COMPLETE fern:", hud.includes("SCAN COMPLETE — Lumina Fern bed"));
  console.log("A3 vial sealed:", hud.includes("spore vial sealed"));
  console.log("A3 SPECIMENS row:", hud.includes("SPECIMENS"));
  blob = await saveBlob(page);
  console.log("A3 inventory:", JSON.stringify(blob["inventory"]), "scannedIds:", JSON.stringify(blob["scannedIds"]), "worldDays:", blob["worldDays"]);
  await page.screenshot({ path: `${SHOT}/seg2-A3-night-harvest.png` });

  // --- 4. Regrowth: rest twice (dusk->dawn->dusk), fern scannable again
  await teleport(page, 0, 9);
  await settle(page, 1200);
  await pressE(page); // enter dome
  await teleport(page, -2, 4);
  await settle(page, 1200);
  const hudBefore = await hudText(page);
  console.log("A4 first rest label dawn?:", hudBefore.includes("Rest until dawn"));
  await pressE(page); // rest -> dawn
  await settle(page, 1500);
  hud = await hudText(page);
  console.log("A4 rest#1 msg dawn:", hud.includes("REST — watch rotated to dawn"));
  blob = await saveBlob(page);
  console.log("A4 after rest#1 worldDays:", blob["worldDays"], "scannedIds:", JSON.stringify(blob["scannedIds"]));
  await pressE(page); // rest -> dusk (double-rest edge: immediate repeat)
  await settle(page, 1500);
  hud = await hudText(page);
  console.log("A4 rest#2 msg dusk:", hud.includes("REST — watch rotated to dusk"));
  blob = await saveBlob(page);
  console.log("A4 after rest#2 worldDays:", blob["worldDays"], "scannedIds:", JSON.stringify(blob["scannedIds"]));

  await teleport(page, 0.5, 6.5);
  await settle(page, 1000);
  await pressE(page); // exit dome
  await teleport(page, 4, 74);
  await settle(page, 1500);
  await holdScan(page, 25_000);
  hud = await hudText(page);
  blob = await saveBlob(page);
  console.log("A4 regrown re-scan complete:", hud.includes("SCAN COMPLETE — Lumina Fern bed"));
  console.log("A4 final inventory:", JSON.stringify(blob["inventory"]));
  await page.screenshot({ path: `${SHOT}/seg2-A4-regrowth-rescan.png` });
});

/* ------------------------------------------------------------------ */
test("B: broke-state gating — hidden trades, Castillo ration line, Voss quills", async ({
  page,
}) => {
  test.setTimeout(420_000);
  wireErrors(page, "B");
  await deployToSurface(page, { operative: "survey", tod: "0.5" });

  // Thornhill, broke: no spore trade, no tier-2, no component line
  await teleport(page, -18, 15);
  await settle(page, 1200);
  await pressE(page);
  let btns = await dialogueChoices(page);
  console.log("B thornhill hub (broke):", JSON.stringify(btns));
  await page.screenshot({ path: `${SHOT}/seg2-B-thornhill-broke.png` });
  await closeDialogue(page);

  // Berger, broke: no servo trade
  await teleport(page, -6, 33);
  await settle(page, 1200);
  await pressE(page);
  btns = await dialogueChoices(page);
  console.log("B berger hub (broke):", JSON.stringify(btns));
  await closeDialogue(page);

  // Voss, no quills: buyback + combat trade hidden
  await teleport(page, 16, 11);
  await settle(page, 1200);
  await pressE(page);
  btns = await dialogueChoices(page);
  console.log("B voss hub (no quills):", JSON.stringify(btns));
  await page.screenshot({ path: `${SHOT}/seg2-B-voss-noquills.png` });
  await closeDialogue(page);

  // Castillo: free stim once, then rationed; broke -> gather line only
  await teleport(page, 8, 25);
  await settle(page, 1200);
  await pressE(page);
  btns = await dialogueChoices(page);
  console.log("B castillo hub #1:", JSON.stringify(btns));
  await choose(page, /I need a stim pack/);
  let hud = await hudText(page);
  console.log("B castillo free-stim node one-dose text:", hud.includes("that's the free one"));
  await choose(page, /Understood/);
  await closeDialogue(page);

  await pressE(page); // reopen
  btns = await dialogueChoices(page);
  console.log("B castillo hub #2 (after free stim):", JSON.stringify(btns));
  await choose(page, /Another stim/);
  btns = await dialogueChoices(page);
  console.log("B castillo rationed node (broke):", JSON.stringify(btns));
  hud = await hudText(page);
  console.log("B rationed text shown:", hud.includes("Stock's rationed"));
  await page.screenshot({ path: `${SHOT}/seg2-B-castillo-rationed-broke.png` });
  await closeDialogue(page);
});

/* ------------------------------------------------------------------ */
test("C: seeded trades — Thornhill tiers + once-gate, Castillo dose, Berger gather line", async ({
  page,
}) => {
  test.setTimeout(420_000);
  wireErrors(page, "C");
  await page.addInitScript(() => {
    localStorage.setItem(
      "lupus-fieldops-v4",
      JSON.stringify({
        version: 7,
        inventory: { "fern-spore": 4, "prism-shard": 1 },
      }),
    );
  });
  await deployToSurface(page, { operative: "survey", tod: "0.5" });
  let blob = await saveBlob(page);
  console.log("C seeded inventory loaded:", JSON.stringify(blob["inventory"]));

  // --- Thornhill tier 1, once-gate, tier 2 gating ---------------------
  await teleport(page, -18, 15);
  await settle(page, 1200);
  await pressE(page);
  let btns = await dialogueChoices(page);
  console.log("C thornhill hub (4 spores, pre-t1):", JSON.stringify(btns));
  // tier-2 must NOT be offered yet
  console.log(
    "C t2 visible pre-t1?:",
    btns.some((b) => b.includes("About a deeper filter pass")),
  );
  await choose(page, /A fern spore for a filter pass/);
  let hud = await hudText(page);
  console.log("C t1 receipt:", hud.includes("Filter's recalibrated"));
  await choose(page, /Appreciated, Doctor/);
  await closeDialogue(page);
  blob = await saveBlob(page);
  console.log("C after t1 inventory:", JSON.stringify(blob["inventory"]), "upgrades:", JSON.stringify(blob["upgrades"]));

  await pressE(page); // reopen hub
  btns = await dialogueChoices(page);
  console.log("C thornhill hub post-t1:", JSON.stringify(btns));
  console.log(
    "C t1 line hidden post-t1?:",
    !btns.some((b) => b.includes("A fern spore for a filter pass")),
  );
  await page.screenshot({ path: `${SHOT}/seg2-C-thornhill-post-t1.png` });
  // tier 2 (needs 2 spores; we hold 3)
  await choose(page, /About a deeper filter pass/);
  btns = await dialogueChoices(page);
  console.log("C thornhill filter-2 node:", JSON.stringify(btns));
  await choose(page, /Two spores, still pulsing/);
  hud = await hudText(page);
  console.log("C t2 receipt:", hud.includes("stopped listening to itself"));
  await choose(page, /Appreciated, Doctor/);
  await closeDialogue(page);
  blob = await saveBlob(page);
  console.log("C after t2 inventory:", JSON.stringify(blob["inventory"]), "upgrades:", JSON.stringify(blob["upgrades"]));
  // re-enter tier-2 chain after purchase: should show the holds line
  await pressE(page);
  await choose(page, /About a deeper filter pass/);
  btns = await dialogueChoices(page);
  console.log("C filter-2 revisit choices:", JSON.stringify(btns));
  hud = await hudText(page);
  await choose(page, /Just confirming the calibration holds/).catch(() => {});
  hud = await hudText(page);
  console.log("C t2 holds line:", hud.includes("It holds"));
  await closeDialogue(page);

  // --- Castillo: free stim then spore dose (1 spore left) -------------
  await teleport(page, 8, 25);
  await settle(page, 1200);
  await pressE(page);
  btns = await dialogueChoices(page);
  console.log("C castillo hub (1 spore):", JSON.stringify(btns));
  await choose(page, /One fern spore for a dose/);
  hud = await hudText(page);
  console.log("C castillo spore-trade receipt:", hud.includes("Good spores"));
  await choose(page, /Thanks, doc/);
  await closeDialogue(page);
  blob = await saveBlob(page);
  console.log("C after castillo inventory:", JSON.stringify(blob["inventory"]), "flags castillo-spores:", (blob["flags"] as Record<string, boolean>)?.["castillo-spores"]);

  // --- Berger: servo (spends only shard), then gather line while broke -
  await teleport(page, -6, 33);
  await settle(page, 1200);
  await pressE(page);
  btns = await dialogueChoices(page);
  console.log("C berger hub (1 shard):", JSON.stringify(btns));
  await choose(page, /One prism shard for a servo tune/);
  hud = await hudText(page);
  console.log("C berger servo receipt:", hud.includes("Servo races have never run this smooth"));
  await choose(page, /Won't waste it/);
  await closeDialogue(page);
  blob = await saveBlob(page);
  console.log("C after servo inventory:", JSON.stringify(blob["inventory"]));

  await pressE(page); // reopen: tier-1 hidden, deeper offer present
  btns = await dialogueChoices(page);
  console.log("C berger hub post-servo:", JSON.stringify(btns));
  await choose(page, /That servo tune\. Can you go deeper/);
  btns = await dialogueChoices(page);
  console.log("C berger servo-2 node (broke):", JSON.stringify(btns));
  console.log(
    "C gather line shown?:",
    btns.some((b) => b.includes("I'll source the pieces")),
    "| priced line hidden?:",
    !btns.some((b) => b.includes("Shards I have")),
  );
  await page.screenshot({ path: `${SHOT}/seg2-C-berger-gather.png` });
  await closeDialogue(page);
});

/* ------------------------------------------------------------------ */
test("D: field acquisition — herd shard, collar component, pips, codex UPDATED gate", async ({
  page,
}) => {
  test.setTimeout(600_000);
  wireErrors(page, "D");
  await deployToSurface(page, { operative: "survey", tod: "0.5" });

  // --- herd scan -> prism shard ---------------------------------------
  await teleport(page, -52, 98);
  await settle(page, 1500);
  await holdScan(page, 25_000);
  let hud = await hudText(page);
  console.log("D herd scan complete:", hud.includes("SCAN COMPLETE — Prismhoof herd"));
  console.log("D shard cased:", hud.includes("prism shard cased"));
  console.log("D SPECIMENS row:", hud.includes("SPECIMENS"));
  await page.screenshot({ path: `${SHOT}/seg2-D-herd-scan.png` });
  let blob = await saveBlob(page);
  console.log("D inventory after herd:", JSON.stringify(blob["inventory"]));

  // --- collar scan -> collar component --------------------------------
  await teleport(page, -22, 13);
  await settle(page, 1500);
  await holdScan(page, 25_000);
  hud = await hudText(page);
  console.log("D collar scan complete:", hud.includes("SCAN COMPLETE — ZPE modulation collar"));
  console.log("D component recovered:", hud.includes("collar component recovered"));
  blob = await saveBlob(page);
  console.log("D inventory after collar:", JSON.stringify(blob["inventory"]));
  await page.screenshot({ path: `${SHOT}/seg2-D-collar-scan.png` });

  // --- codex before intel purchase ------------------------------------
  await page.keyboard.press("KeyC");
  await settle(page, 1200);
  hud = await hudText(page);
  console.log("D codex pre-purchase: has collars entry:", hud.includes("Modulation collars"));
  console.log("D codex pre-purchase: deep body leaked?:", hud.includes("the published drift figure is two millihertz"));
  console.log("D codex pre-purchase: UPDATED present:", hud.includes("UPDATED"));
  await page.screenshot({ path: `${SHOT}/seg2-D-codex-before.png` });
  await page.keyboard.press("KeyC"); // close -> marks seen
  await settle(page, 1000);

  // --- Thornhill component intel ---------------------------------------
  await teleport(page, -18, 15);
  await settle(page, 1200);
  await pressE(page);
  const btns = await dialogueChoices(page);
  console.log("D thornhill hub (has component):", JSON.stringify(btns));
  await choose(page, /I recovered a collar component/);
  await choose(page, /What is it/);
  hud = await hudText(page);
  console.log("D component receipt:", hud.includes("West collar laminate"));
  await choose(page, /^\d?\s*Logged\.?$/);
  await closeDialogue(page);
  blob = await saveBlob(page);
  console.log(
    "D after intel inventory:",
    JSON.stringify(blob["inventory"]),
    "codexStage:",
    JSON.stringify(blob["codexStage"]),
  );

  // --- codex after purchase: UPDATED chip + deeper body ----------------
  await page.keyboard.press("KeyC");
  await settle(page, 1200);
  hud = await hudText(page);
  console.log("D codex post-purchase UPDATED:", hud.includes("UPDATED"));
  console.log("D codex post-purchase deep body:", hud.includes("the published drift figure is two millihertz"));
  console.log("D codex post-purchase stage line:", hud.includes("STAGE 1/1"));
  await page.screenshot({ path: `${SHOT}/seg2-D-codex-after.png` });
});
