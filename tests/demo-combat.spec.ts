import { test, type Page } from "@playwright/test";
import { deployToSurface, hudText, settle, teleport, walk } from "./helpers";

/**
 * SEGMENT 5 — COMBAT, RIFLE, DEATH. Hostile-QA probe, not a CI gate.
 * Deterministic creature spawns (seed 90210, computed offline):
 *   fang0 (57.8, 94.5)  fang1 (62.7, 130.3)  fang2 (50.2, 145.1)   [daylight]
 *   fang3 (38.5, 121.5) fang4 (65.2, 128.8)                        [nocturnal]
 *   herd around (-55, 95) +-13
 * Run: FIELDOPS_BASE_URL=http://127.0.0.1:8098 npx playwright test tests/demo-combat.spec.ts
 */

const SHOT = "/tmp/demo";

function watchErrors(page: Page, label: string): { errors: string[] } {
  const box = { errors: [] as string[] };
  page.on("pageerror", (e) => {
    box.errors.push(`PAGEERROR: ${e.message}`);
    console.log(`[${label}] PAGEERROR:`, e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error") {
      box.errors.push(`CONSOLE: ${m.text()}`);
      console.log(`[${label}] CONSOLE ERROR:`, m.text().slice(0, 300));
    }
  });
  return box;
}

/** Charged/empty state of the reticle cell pips (null = reticle hidden). */
async function pips(page: Page): Promise<boolean[] | null> {
  return page.evaluate(() => {
    const row = document.querySelector("div.top-full");
    if (!row) return null;
    return [...row.children].map((s) =>
      (s as HTMLElement).className.includes("bg-accent"),
    );
  });
}

function pct(text: string, label: string): number | null {
  const m = text.match(new RegExp(label + "[^%]{0,24}?(\\d+)%"));
  return m ? Number(m[1]) : null;
}

/** In-game clock in fractional hours (28-h day), from the HUD label. */
function clockHours(text: string): number | null {
  const m = text.match(/(\d{2}):(\d{2}) · (NIGHT|DAWN|DAY|DUSK)/);
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
}

async function fire(page: Page): Promise<void> {
  await page.keyboard.press("KeyR");
}

/** Dismiss ClickToPlay exactly once; later clicks would fire the attack edge. */
async function focusCanvas(page: Page): Promise<void> {
  const vp = page.viewportSize() ?? { width: 800, height: 450 };
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await settle(page, 800);
}

async function setAim(page: Page, on: boolean): Promise<void> {
  await page.evaluate((v) => window.__controlsTest?.setAim(v), on);
}

test.describe("segment 5 (800x450)", () => {
  test.use({ viewport: { width: 800, height: 450 } });

  test("melee: stance toggle, swings, kill toast, specimen quill", async ({ page }) => {
    test.setTimeout(300_000);
    const log = watchErrors(page, "melee");
    await deployToSurface(page, { operative: "marine", spawn: "treeline", tod: "0.5", wx: "clear" });
    await focusCanvas(page);

    // -- Stance: F toggles ARMED glyph, repeat-toggle sanity.
    let t = await hudText(page);
    console.log("STANCE_BEFORE:", /◈ ARMED/.test(t) ? "ARMED" : /○ SAFE/.test(t) ? "SAFE" : "MISSING");
    await page.keyboard.press("KeyF");
    await settle(page, 1200);
    t = await hudText(page);
    console.log("STANCE_AFTER_F:", /◈ ARMED/.test(t) ? "ARMED" : "not-armed", "| toast:", /COMBAT STANCE — ARMED/.test(t));
    await page.keyboard.press("KeyF");
    await settle(page, 1200);
    console.log("STANCE_AFTER_FF:", /○ SAFE/.test(await hudText(page)) ? "SAFE" : "not-safe");
    await page.keyboard.press("KeyF"); // leave ARMED for melee
    await settle(page, 800);

    // -- Empty swing far from anything: no crash, cooldown spam.
    for (let i = 0; i < 4; i++) await fire(page);
    await settle(page, 1000);

    // -- Adjacent to fang0 (57.8, 94.5): stand 2 m south, face north (yaw 0).
    await teleport(page, 57.8, 96.8, 0);
    await settle(page, 1500);
    await page.screenshot({ path: `${SHOT}/combat-melee-before.png` });

    let killed = false;
    for (let i = 0; i < 12 && !killed; i++) {
      await fire(page);
      await settle(page, 2600);
      // The swing knocks the fang back; re-close to its home so the next
      // swing connects even at software-rasterizer sim rates.
      const txt = await hudText(page);
      if (/CONTACT DOWN/.test(txt)) {
        killed = true;
        console.log(`MELEE_KILL after ${i + 1} swings`);
        break;
      }
      if (i === 3 || i === 7) await page.screenshot({ path: `${SHOT}/combat-melee-mid${i}.png` });
      await teleport(page, 57.8, 96.8, 0);
    }
    console.log("MELEE_KILLED:", killed);
    await page.screenshot({ path: `${SHOT}/combat-melee-kill.png` });

    // -- Specimen: scanner (hold Q) within 6 m of the carcass, needs 1.2 sim-s.
    if (killed) {
      await teleport(page, 57.8, 96.5, 0);
      await page.keyboard.down("KeyQ");
      let quill = false;
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1500);
        const txt = await hudText(page);
        if (/fang quill secured/i.test(txt)) {
          quill = true;
          break;
        }
      }
      await page.keyboard.up("KeyQ");
      const txt = await hudText(page);
      console.log("QUILL_TOAST:", quill, "| SPECIMENS row:", /SPECIMENS/.test(txt), "| Quill pip:", /Quill\s*1|quill/i.test(txt));
      await page.screenshot({ path: `${SHOT}/combat-quill.png` });
    }
    console.log("ERRORS:", JSON.stringify(log.errors.slice(0, 6)));
  });

  test("rifle: aim HUD, discharge, broadcast line, drain/dry/recharge, TRACKED", async ({ page }) => {
    test.setTimeout(360_000);
    const log = watchErrors(page, "rifle");
    await deployToSurface(page, { operative: "marine", spawn: "treeline", tod: "0.5", wx: "clear" });
    await focusCanvas(page);

    // 14 m south of fang0, facing it (yaw 0 → forward -z... forward=(-sin,-cos) so yaw 0 faces -z i.e. decreasing z).
    await teleport(page, 57.8, 108.5, 0);
    await settle(page, 1200);

    // -- Aim on: reticle + pips + clock label AIM.
    const before = await hudText(page);
    const sigBefore = pct(before, "ZPE SIG");
    console.log("PIPS_NO_AIM:", JSON.stringify(await pips(page)));
    await setAim(page, true);
    await settle(page, 2500);
    let t = await hudText(page);
    console.log("AIM_LABEL:", /· AIM/.test(t), "| PIPS_AIMED:", JSON.stringify(await pips(page)));
    await page.screenshot({ path: `${SHOT}/combat-aim-hud.png` });

    // -- First shot: tracer burst, first-shot line, codex, ZPE spike, pip spend.
    await fire(page);
    await page.screenshot({ path: `${SHOT}/combat-shot1-a.png` });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOT}/combat-shot1-b.png` });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOT}/combat-shot1-c.png` });
    await settle(page, 1500);
    t = await hudText(page);
    const sigAfter = pct(t, "ZPE SIG");
    console.log(
      "FIRST_SHOT — broadcast line:", /every discharge is a broadcast/.test(t),
      "| codex toast:", /CODEX — Pulse rifle/.test(t),
      "| ZPE:", sigBefore, "->", sigAfter,
      "| pips:", JSON.stringify(await pips(page)),
    );

    // -- Drain the remaining cells (cooldown 0.45 sim-s ≈ several wall-s here).
    for (let i = 0; i < 4; i++) {
      await settle(page, 6000);
      await fire(page);
    }
    await settle(page, 2000);
    console.log("PIPS_AFTER_5:", JSON.stringify(await pips(page)));

    // -- Dry fire on empty cells: must not crash.
    await settle(page, 3000);
    await fire(page);
    await fire(page);
    await settle(page, 1500);
    console.log("PIPS_AFTER_DRY:", JSON.stringify(await pips(page)));
    t = await hudText(page);
    console.log("TRACKED_AFTER_SHOTS:", /▲ TRACKED/.test(t));
    await page.screenshot({ path: `${SHOT}/combat-tracked.png` });

    // -- Recharge: pull back to safe ground, keep aiming, watch pips refill.
    await teleport(page, 0, 45, Math.PI);
    await setAim(page, true);
    let refill: boolean[] | null = null;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(3000);
      refill = await pips(page);
      if (refill && refill.filter(Boolean).length >= 3) break;
    }
    console.log("PIPS_AFTER_RECHARGE_WAIT:", JSON.stringify(refill));

    // -- Codex flag survived to the save blob?
    const codex = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("lupus-fieldops-v4");
        if (!raw) return "no-save";
        const blob = JSON.parse(raw);
        const entry = (blob.codex ?? []).find((c: { id: string }) => c.id === "pulse-rifle");
        return { unlocked: entry?.unlocked ?? "absent", flag: blob.flags?.["rifle-discharged"] ?? false };
      } catch (e) {
        return String(e);
      }
    });
    console.log("SAVE_CODEX:", JSON.stringify(codex));
    console.log("ERRORS:", JSON.stringify(log.errors.slice(0, 6)));
  });

  test("prismhoof: stampede on discharge, no loot, long-range fire no-crash", async ({ page }) => {
    test.setTimeout(240_000);
    const log = watchErrors(page, "hoof");
    await deployToSurface(page, { operative: "marine", spawn: "treeline", tod: "0.5", wx: "clear" });
    await focusCanvas(page);

    // 7 m south of hoof (-58.6, 87.4), facing -z toward the herd core.
    await teleport(page, -58.6, 80.0, Math.PI);
    // yaw PI faces +z (forward = (0, +1)) -> herd is at z 87..104, correct.
    await settle(page, 1500);
    await page.screenshot({ path: `${SHOT}/combat-herd-before.png` });

    await setAim(page, true);
    await settle(page, 2000);
    await fire(page);
    await page.screenshot({ path: `${SHOT}/combat-herd-shot.png` });
    await settle(page, 6000);
    await page.screenshot({ path: `${SHOT}/combat-herd-after6s.png` });
    await settle(page, 10000);
    await page.screenshot({ path: `${SHOT}/combat-herd-after16s.png` });
    let t = await hudText(page);
    console.log(
      "HERD — kill toast (must be false):", /CONTACT DOWN/.test(t),
      "| loot/pickup toast (must be false):", /SPECIMEN|LEDGER|prism shard/i.test(t),
    );

    // -- Long range: face open ground (-x) and dump shots at nothing.
    await teleport(page, -58.6, 80.0, Math.PI / 2);
    await setAim(page, true);
    await settle(page, 1500);
    for (let i = 0; i < 3; i++) {
      await fire(page);
      await settle(page, 6000);
    }
    t = await hudText(page);
    console.log("LONG_RANGE done; errors so far:", log.errors.length);
    console.log("ERRORS:", JSON.stringify(log.errors.slice(0, 6)));
  });
});

test.describe("segment 5 deaths (small viewport for sim speed)", () => {
  test.use({ viewport: { width: 480, height: 320 } });

  test("death: flatline -> colony evac, +2h, health 60, evac-window fire, second death", async ({ page }) => {
    test.setTimeout(540_000);
    const log = watchErrors(page, "death");
    // Night: nocturnal fangs awake — player lands between fang1 and fang4.
    await deployToSurface(page, { operative: "marine", spawn: "treeline", tod: "0.85", wx: "clear" });
    await focusCanvas(page);

    let t = await hudText(page);
    const clock0 = clockHours(t);
    console.log("PRE_DEATH clock:", clock0, "| vitals:", pct(t, "VITALS"));

    await teleport(page, 63.5, 129.5, 0);
    let dead = false;
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(1500);
      t = await hudText(page);
      if (/VITALS FLATLINE/i.test(t)) {
        dead = true;
        break;
      }
      // Fangs wander; re-pin the player onto the pack every ~20 polls.
      if (i % 15 === 14) await teleport(page, 63.5, 129.5, 0);
      if (i % 20 === 19) console.log("  waiting… vitals:", pct(t, "VITALS"), "tracked:", /▲ TRACKED/.test(t));
    }
    console.log("DIED:", dead);
    await page.screenshot({ path: `${SHOT}/combat-flatline-overlay.png` });

    if (dead) {
      // -- Evac-window fire: must be silently refused, never crash.
      await setAim(page, true);
      await fire(page);
      await fire(page);
      await settle(page, 1000);
      const duringPips = await pips(page);
      console.log("EVAC_FIRE pips (expect all charged/unspent):", JSON.stringify(duringPips));
      await setAim(page, false);

      await settle(page, 6000); // let the fade clear
      t = await hudText(page);
      const clock1 = clockHours(t);
      const flatCount = (t.match(/VITALS FLATLINE/gi) ?? []).length;
      console.log(
        "POST_DEATH — coords:", (t.match(/-?\d+,-?\d+/) ?? [])[0],
        "| vitals:", pct(t, "VITALS"),
        "| clock:", clock0, "->", clock1,
        "| jump(h):", clock1 !== null && clock0 !== null ? ((clock1 - clock0 + 28) % 28).toFixed(2) : "n/a",
        "| evac-complete line:", /collar auto-evac complete/i.test(t),
        "| TRACKED gone:", !/▲ TRACKED/.test(t),
        "| flatline mentions in HUD:", flatCount,
      );
      await page.screenshot({ path: `${SHOT}/combat-post-evac.png` });

      // -- Second death: no double-fire, clean repeat.
      await teleport(page, 63.5, 129.5, 0);
      let dead2 = false;
      for (let i = 0; i < 200; i++) {
        await page.waitForTimeout(1500);
        t = await hudText(page);
        const vit = pct(t, "VITALS");
        if (/collar auto-evac engaged/i.test(t) && vit !== null && vit >= 55 && /-4,30|-\d+,\d+/.test(t)) {
          // freshly evacuated again (vitals back to 60 at colony)
          const coords = (t.match(/-?\d+,-?\d+/) ?? [])[0];
          if (coords === "-4,30") {
            dead2 = true;
            break;
          }
        }
        if (i % 15 === 14) {
          const coords = (t.match(/-?\d+,-?\d+/) ?? [])[0];
          if (coords === "-4,30" && vit !== null && vit < 55) await teleport(page, 63.5, 129.5, 0);
          if (coords !== "-4,30") await teleport(page, 63.5, 129.5, 0);
        }
      }
      t = await hudText(page);
      console.log("SECOND_DEATH:", dead2, "| clock now:", clockHours(t), "| vitals:", pct(t, "VITALS"));
      await page.screenshot({ path: `${SHOT}/combat-second-death.png` });
    }
    console.log("ERRORS:", JSON.stringify(log.errors.slice(0, 6)));
  });

  test("death with ridge beacon planted -> relocation to ridge-7", async ({ page }) => {
    test.setTimeout(420_000);
    const log = watchErrors(page, "beacon");
    await page.addInitScript(() => {
      localStorage.setItem(
        "lupus-fieldops-v4",
        JSON.stringify({ version: 7, updatedAt: Date.now(), characterId: "marine", ridgeBeaconPlanted: true }),
      );
    });
    await deployToSurface(page, { operative: "marine", spawn: "treeline", tod: "0.85", wx: "clear" });
    await focusCanvas(page);
    await teleport(page, 63.5, 129.5, 0);

    let t = "";
    let dead = false;
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(1500);
      t = await hudText(page);
      if (/VITALS FLATLINE|collar auto-evac engaged/i.test(t)) {
        dead = true;
        break;
      }
      if (i % 15 === 14) await teleport(page, 63.5, 129.5, 0);
    }
    await settle(page, 6000);
    t = await hudText(page);
    console.log(
      "BEACON_DEATH:", dead,
      "| coords (expect -100,50):", (t.match(/-?\d+,-?\d+/) ?? [])[0],
      "| vitals:", pct(t, "VITALS"),
    );
    await page.screenshot({ path: `${SHOT}/combat-ridge-evac.png` });
    console.log("ERRORS:", JSON.stringify(log.errors.slice(0, 6)));
  });

  test("rest refusal while TRACKED (best effort pursuit)", async ({ page }) => {
    test.setTimeout(540_000);
    const log = watchErrors(page, "rest");
    await deployToSurface(page, { operative: "marine", spawn: "south-gate", tod: "0.85", wx: "clear" });
    await focusCanvas(page);
    // ARMED so contact shoves instead of bleeding us out at the gate.
    await page.keyboard.press("KeyF");
    await settle(page, 800);

    // Bait: stand at the gate, fire to force detection (night earshot ~87 m).
    await teleport(page, 0, 42, 0);
    await setAim(page, true);
    await fire(page);
    let tracked = false;
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(2000);
      const t = await hudText(page);
      if (/▲ TRACKED/.test(t)) {
        tracked = true;
        break;
      }
      if (i % 12 === 11) await fire(page); // refresh alert
    }
    console.log("GATE_TRACKED:", tracked);
    await page.screenshot({ path: `${SHOT}/combat-rest-tracked.png` });
    await setAim(page, false);

    if (tracked) {
      // Into the dome: hatch at (0,8), bunk at (-2,3.95).
      await teleport(page, 0, 8.5, 0);
      await page.keyboard.press("KeyE");
      await settle(page, 1500);
      let t = await hudText(page);
      console.log("INSIDE_DOME:", /Exit command dome|Rest until/i.test(t));
      await teleport(page, -2, 4.5, 0);
      await settle(page, 1000);

      let outcome = "none";
      for (let i = 0; i < 40; i++) {
        t = await hudText(page);
        const isTracked = /▲ TRACKED/.test(t);
        const restPrompt = /Rest until (dawn|dusk)/i.test(t);
        if (isTracked && restPrompt) {
          await page.keyboard.press("KeyE");
          await settle(page, 1200);
          t = await hudText(page);
          if (/something has your line/i.test(t)) {
            outcome = "refused";
            break;
          }
          if (/REST — watch rotated/i.test(t)) {
            outcome = "rested-despite-tracked(race?)";
            break;
          }
        }
        await page.waitForTimeout(2500);
      }
      console.log("REST_OUTCOME:", outcome);
      await page.screenshot({ path: `${SHOT}/combat-rest-outcome.png` });
    }
    console.log("ERRORS:", JSON.stringify(log.errors.slice(0, 6)));
  });
});

test.describe("segment 5 ghosts (800x450)", () => {
  test.use({ viewport: { width: 800, height: 450 } });

  test("scanner intercept ghosts + route-learning codex", async ({ page }) => {
    test.setTimeout(300_000);
    const log = watchErrors(page, "ghosts");
    await deployToSurface(page, { operative: "marine", spawn: "treeline", tod: "0.5", wx: "clear" });
    await focusCanvas(page);
    await page.keyboard.press("KeyF"); // ARMED: shove, don't bleed
    await settle(page, 800);

    // Walk a pattern near fang1/fang2 so route learning has >4 path samples.
    await teleport(page, 55, 135, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      await walk(page, ["KeyW"], 5000);
      await page.waitForTimeout(800);
    }
    await settle(page, 3000);

    // Scanner up: ghost intercept markers should render; photo the view.
    await page.keyboard.down("KeyQ");
    await settle(page, 4000);
    await page.screenshot({ path: `${SHOT}/combat-ghosts-a.png` });
    await teleport(page, 50, 138, Math.PI * 0.75);
    await settle(page, 3000);
    await page.screenshot({ path: `${SHOT}/combat-ghosts-b.png` });
    await page.keyboard.up("KeyQ");

    const t = await hudText(page);
    console.log("ROUTE_CODEX toast:", /CODEX — Route learning/i.test(t));
    const codex = await page.evaluate(() => {
      try {
        const blob = JSON.parse(localStorage.getItem("lupus-fieldops-v4") ?? "{}");
        const entry = (blob.codex ?? []).find((c: { id: string }) => c.id === "route-learning");
        return entry?.unlocked ?? "absent";
      } catch (e) {
        return String(e);
      }
    });
    console.log("ROUTE_CODEX in save:", JSON.stringify(codex));
    console.log("ERRORS:", JSON.stringify(log.errors.slice(0, 6)));
  });
});
