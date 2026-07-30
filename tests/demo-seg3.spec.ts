import { test, type Page } from "@playwright/test";
import {
  deployToSurface,
  teleport,
  settle,
  hudText,
  probe,
} from "./helpers";

/**
 * SEGMENT 3 — Expedition West + Weather. Probe spec: logs state, screenshots
 * to /tmp/demo/seg3-*.png, minimal hard assertions.
 */

type Errs = { page: string[]; console: string[] };
function wireErrors(page: Page): Errs {
  const errs: Errs = { page: [], console: [] };
  page.on("pageerror", (e) => errs.page.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errs.console.push(m.text());
  });
  return errs;
}

function dumpErrs(tag: string, errs: Errs) {
  console.log(
    `[${tag}] pageerrors=${JSON.stringify(errs.page)} consoleerrors=${JSON.stringify(errs.console.slice(0, 10))}`,
  );
}

/** Poll body text for a regex; returns true as soon as it appears. */
async function pollFor(
  page: Page,
  re: RegExp,
  timeoutMs = 8000,
  everyMs = 250,
): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const t = await hudText(page);
    if (re.test(t)) return true;
    await page.waitForTimeout(everyMs);
  }
  return false;
}

async function pressE(page: Page) {
  await page.keyboard.press("e");
  await page.waitForTimeout(800);
}

async function clickChoice(page: Page, re: RegExp): Promise<boolean> {
  const btns = page.getByRole("button");
  const n = await btns.count();
  const labels: string[] = [];
  for (let i = 0; i < n; i++) labels.push((await btns.nth(i).innerText()).trim());
  console.log(`[dialogue] buttons: ${JSON.stringify(labels)}`);
  for (let i = 0; i < n; i++) {
    const clean = labels[i]!.replace(/^\d+\s*\n?/, "").trim();
    if (re.test(clean)) {
      await btns.nth(i).click();
      await page.waitForTimeout(700);
      return true;
    }
  }
  return false;
}

test.describe("segment 3 — expedition west + weather", () => {
  test("A. pre-waiver: beacon refuses, no ridge7 objective", async ({ page }) => {
    test.setTimeout(180_000);
    const errs = wireErrors(page);
    await deployToSurface(page, { operative: "marine" });

    const hud0 = await hudText(page);
    console.log(
      `[A] objective-log-has-ridge7=${/Survey Ridge-7/i.test(hud0)} (expect false)`,
    );

    // Ridge approach region card fires on first entry (poll runs at 2 Hz).
    await teleport(page, -118, 62);
    const sawCard = await pollFor(page, /RIDGE-7 APPROACH/i, 6000, 200);
    console.log(`[A] region card RIDGE-7 APPROACH seen=${sawCard}`);
    await page.screenshot({ path: "/tmp/demo/seg3-A1-ridge-arrival.png" });

    const sawPrompt = await pollFor(page, /Plant Ridge-7 beacon/i, 6000);
    console.log(`[A] beacon prompt seen=${sawPrompt}`);
    await pressE(page);
    const refused = await pollFor(page, /GATE CONTROL — no waiver/i, 5000);
    console.log(`[A] refusal toast seen=${refused}`);
    // Poke: repeat the press — should refuse again, never plant.
    await pressE(page);
    await pressE(page);
    const hud1 = await hudText(page);
    console.log(
      `[A] planted-toast-present=${/expedition beacon planted/i.test(hud1)} (expect false)`,
    );
    console.log(
      `[A] objective-log-has-ridge7-after=${/Survey Ridge-7/i.test(hud1)} (expect false)`,
    );
    await page.screenshot({ path: "/tmp/demo/seg3-A2-refusal.png" });
    dumpErrs("A", errs);
  });

  test("B. Voss waiver path (marine): what->authorize, then plant+cache+hale", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errs = wireErrors(page);
    await deployToSurface(page, { operative: "marine" });

    await teleport(page, 15, 11);
    const sawTalk = await pollFor(page, /Talk — Adele Voss/i, 6000);
    console.log(`[B] voss talk prompt=${sawTalk}`);
    await pressE(page);
    await page.waitForTimeout(1000);

    // Hostile poke: cmd-only branch must NOT be visible for a marine.
    const bodyInDlg = await hudText(page);
    console.log(
      `[B] marine-sees-cmd-branch=${/Skip the runaround/i.test(bodyInDlg)} (expect false)`,
    );

    const c1 = await clickChoice(page, /^What is Ridge-7\?/i);
    console.log(`[B] clicked 'What is Ridge-7?'=${c1}`);
    const c2 = await clickChoice(page, /^Authorize the trek\./i);
    console.log(`[B] clicked 'Authorize the trek.'=${c2}`);
    const c3 = await clickChoice(page, /^Copy\. Heading west\./i);
    console.log(`[B] clicked 'Copy. Heading west.'=${c3}`);
    // Focus-trap poke: after a choice click the clicked button unmounts —
    // where does focus land? (Escape only closes when focus is in the panel.)
    const active = await page.evaluate(() => {
      const a = document.activeElement;
      return a ? `${a.tagName}.${(a as HTMLElement).className}`.slice(0, 80) : "null";
    });
    console.log(`[B] activeElement after choice click=${active}`);
    const escWorks = await page.keyboard
      .press("Escape")
      .then(async () => {
        await page.waitForTimeout(700);
        return !/End conversation/i.test(await hudText(page));
      });
    console.log(`[B] Escape-closed-end-node=${escWorks}`);
    if (!escWorks) {
      const c4 = await clickChoice(page, /^End conversation/i);
      console.log(`[B] clicked 'End conversation'=${c4}`);
    }
    // If Escape instead opened the pause menu, clear it.
    if (/PAUSED|RESUME/i.test(await hudText(page))) {
      console.log(`[B] Escape opened pause menu instead of closing dialogue`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
    }
    await page.waitForTimeout(800);

    const tasking = await pollFor(
      page,
      /TASKING — Ridge-7 survey authorized/i,
      6000,
    );
    const hint = /Ridge-7 west corridor open/i.test(await hudText(page));
    console.log(`[B] tasking toast=${tasking} nav hint=${hint}`);
    const hudObj = await hudText(page);
    console.log(`[B] objective-log-has-ridge7=${/Survey Ridge-7/i.test(hudObj)}`);
    await page.screenshot({ path: "/tmp/demo/seg3-B1-waiver.png" });

    // Plant the beacon.
    await teleport(page, -118, 62);
    await pollFor(page, /Plant Ridge-7 beacon/i, 6000);
    await pressE(page);
    const planted = await pollFor(page, /expedition beacon planted/i, 5000);
    console.log(`[B] planted=${planted}`);
    // Poke: E again — prompt should be gone, no double plant.
    await pressE(page);
    const hud2 = await hudText(page);
    const plantedCount = (hud2.match(/expedition beacon planted/gi) ?? []).length;
    console.log(
      `[B] prompt-after-plant=${/Plant Ridge-7 beacon/i.test(hud2)} (expect false), planted toasts=${plantedCount}`,
    );
    const objDone = /OBJECTIVE COMPLETE — Survey Ridge-7/i.test(hud2);
    console.log(`[B] objective complete toast=${objDone}`);
    await page.screenshot({ path: "/tmp/demo/seg3-B2-planted.png" });

    // Ridge cache — Survey Team B log 3.
    await teleport(page, -95, 40);
    const cachePrompt = await pollFor(page, /Recover cache/i, 6000);
    console.log(`[B] ridge cache prompt=${cachePrompt}`);
    if (!cachePrompt) {
      const speed = await probe(page, (p) => p.getSpeed());
      console.log(
        `[B] cache diagnostics: speed=${speed.toFixed(2)} hud=${JSON.stringify((await hudText(page)).slice(0, 600))}`,
      );
      await page.screenshot({ path: "/tmp/demo/seg3-B-cache-miss.png" });
    }
    await pressE(page);
    const looted = await pollFor(page, /CACHE RECOVERED — CACHE-R/i, 5000);
    const recovered = /RECOVERED — Survey B — log 3 of 4/i.test(await hudText(page));
    console.log(`[B] cache-r looted=${looted} recovered-log-toast=${recovered}`);

    // Journal should now hold the unauthored Team B entry.
    await page.keyboard.press("j");
    await page.waitForTimeout(900);
    const journal = await hudText(page);
    console.log(
      `[B] journal-has-log3=${/Survey B — log 3 of 4/i.test(journal)} journal-has-body=${/Kaguyahime is alive/i.test(journal)}`,
    );
    await page.screenshot({ path: "/tmp/demo/seg3-B3-journal.png" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    // Hale camp — one-shot site.
    await teleport(page, -101, 57);
    const halePrompt = await pollFor(page, /Search Hale camp/i, 6000);
    console.log(`[B] hale prompt=${halePrompt}`);
    await pressE(page);
    const haleLog = await pollFor(page, /SITE LOG — Cold camp — Ridge-7/i, 5000);
    console.log(`[B] hale site log toast=${haleLog}`);
    await settle(page, 1500);
    const hud3 = await hudText(page);
    console.log(
      `[B] hale-prompt-after-read=${/Search Hale camp/i.test(hud3)} (expect false)`,
    );
    await pressE(page); // second E: must do nothing
    const hud4 = await hudText(page);
    const haleCount = (hud4.match(/SITE LOG — Cold camp/gi) ?? []).length;
    console.log(`[B] hale toast count after second E=${haleCount} (expect <=1)`);
    await page.screenshot({ path: "/tmp/demo/seg3-B4-hale.png" });
    dumpErrs("B", errs);
  });

  test("C. Theo cmd-access instant waiver branch", async ({ page }) => {
    test.setTimeout(180_000);
    const errs = wireErrors(page);
    await deployToSurface(page, { operative: "theo" });

    await teleport(page, 15, 11);
    await pollFor(page, /Talk — Adele Voss/i, 6000);
    await pressE(page);
    await page.waitForTimeout(1000);
    const c1 = await clickChoice(page, /Skip the runaround/i);
    console.log(`[C] cmd branch visible+clicked=${c1}`);
    const cmdText = /waiver has been on file since you made landfall/i.test(
      await hudText(page),
    );
    console.log(`[C] ridge-cmd node text shown=${cmdText}`);
    await page.screenshot({ path: "/tmp/demo/seg3-C1-cmd.png" });
    const c2 = await clickChoice(page, /^Noted\. Heading west\./i);
    console.log(`[C] clicked exit=${c2}`);
    const c2b = await clickChoice(page, /^End conversation/i);
    console.log(`[C] clicked End conversation=${c2b}`);
    const tasking = await pollFor(
      page,
      /TASKING — Ridge-7 survey authorized/i,
      6000,
    );
    console.log(`[C] tasking toast=${tasking}`);
    // Plant immediately — waiver is on file.
    await teleport(page, -118, 62);
    await pollFor(page, /Plant Ridge-7 beacon/i, 6000);
    await pressE(page);
    const planted = await pollFor(page, /expedition beacon planted/i, 5000);
    console.log(`[C] theo planted=${planted}`);

    // Poke: reopen Voss — the once:"voss-cmd" branch must be gone.
    await teleport(page, 15, 11);
    await pollFor(page, /Talk — Adele Voss/i, 6000);
    await pressE(page);
    await page.waitForTimeout(1000);
    const again = await hudText(page);
    console.log(
      `[C] cmd-branch-second-visit=${/Skip the runaround/i.test(again)} (expect false)`,
    );
    await page.keyboard.press("Escape");
    dumpErrs("C", errs);
  });

  test("D. scree slide probe on the ridge flank", async ({ page }) => {
    test.setTimeout(240_000);
    const errs = wireErrors(page);
    await deployToSurface(page, { operative: "marine" });

    // Analytic scan (worldHeight.ts) says slope>SLIDE_SLOPE(0.6) at
    // x=-112..-118, z=40..62 (max 0.64 at -114,52). Beacon sits at 0.54,
    // cache-r 0.50, hale 0.37 — all standable by design.
    const coordOf = async () => {
      const t = await hudText(page);
      const m = /(-?\d+),(-?\d+)/.exec(t.split("ZPE SIG")[1] ?? t);
      return m ? `${m[1]},${m[2]}` : "?";
    };
    // 1) Passive: teleport into the steepest cell and watch for drift.
    await teleport(page, -114, 50);
    const series: string[] = [];
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(400);
      const s = await probe(page, (p) => p.getSpeed());
      series.push(`${s.toFixed(1)}@${await coordOf()}`);
    }
    console.log(`[D] passive slide series (-114,50): ${series.join(" ")}`);
    await page.screenshot({ path: "/tmp/demo/seg3-D1-slide-passive.png" });

    // 2) Active: walk along the flank inside the slide band, log speeds.
    await teleport(page, -116, 44);
    await page.keyboard.down("w");
    const series2: string[] = [];
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(400);
      const s = await probe(page, (p) => p.getSpeed());
      series2.push(`${s.toFixed(1)}@${await coordOf()}`);
    }
    await page.keyboard.up("w");
    console.log(`[D] walking slide series (-116,44 W-held): ${series2.join(" ")}`);

    // 3) Control: hale camp (slope 0.37) must stay standable.
    await teleport(page, -101, 57);
    await settle(page, 2000);
    const ctl: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(400);
      ctl.push((await probe(page, (p) => p.getSpeed())).toFixed(1));
    }
    console.log(`[D] hale-camp control speeds: ${ctl.join(" ")}`);
    await page.screenshot({ path: "/tmp/demo/seg3-D2-flank.png" });
    dumpErrs("D", errs);
  });

  test("E. storm: pin wx=storm, ride it out to the survival objective", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    const errs = wireErrors(page);
    await deployToSurface(page, { operative: "marine", wx: "storm" });

    const hud0 = await hudText(page);
    console.log(
      `[E] wx-readout=${/WX STORM/i.test(hud0)} alert-toast=${/ION STORM CELL/i.test(hud0)}`,
    );
    await page.screenshot({ path: "/tmp/demo/seg3-E1-storm.png" });

    // Ride it out. STORM_HOLD=18 sim-s; the clamped delta stretches that to
    // minutes of wall clock. Poll for the survival credit.
    const t0 = Date.now();
    let survived = false;
    let sawOzone = false;
    while (Date.now() - t0 < 330_000) {
      const t = await hudText(page);
      if (/ozone on the wind/i.test(t)) sawOzone = true;
      if (/storm cell survived/i.test(t) || /OBJECTIVE COMPLETE — Weather a storm front/i.test(t)) {
        survived = true;
        break;
      }
      await page.waitForTimeout(2000);
    }
    console.log(
      `[E] survived=${survived} after ${((Date.now() - t0) / 1000).toFixed(0)}s; ozone-warning-seen=${sawOzone}`,
    );
    const hud1 = await hudText(page);
    console.log(
      `[E] objective-complete-toast=${/OBJECTIVE COMPLETE — Weather a storm front/i.test(hud1)}`,
    );
    await page.screenshot({ path: "/tmp/demo/seg3-E2-after.png" });
    dumpErrs("E", errs);
  });

  test("F. kaguyahime spoiler gates: book1 absent, book2early present", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errs = wireErrors(page);

    // book1: coast must be empty — no region card, no memorial, no cache-c.
    await deployToSurface(page, { operative: "marine", spoiler: "book1" });
    await teleport(page, 22, 200);
    const leak = await pollFor(page, /KAGUYAHIME SHORE/i, 5000, 250);
    const hudB1 = await hudText(page);
    console.log(
      `[F] book1: shore-card=${leak} memorial-prompt=${/Log Kaguyahime memorial/i.test(hudB1)} (both expect false)`,
    );
    await pressE(page); // must do nothing
    const hudB1b = await hudText(page);
    console.log(
      `[F] book1: after-E kaguyahime-logged=${/Kaguyahime vector logged/i.test(hudB1b)} (expect false)`,
    );
    await teleport(page, 35, 195);
    await settle(page, 1500);
    const hudB1c = await hudText(page);
    console.log(
      `[F] book1: coast-cache-prompt=${/Recover cache/i.test(hudB1c)} (expect false)`,
    );
    await pressE(page);
    console.log(
      `[F] book1: cache-c-looted=${/CACHE RECOVERED — CACHE-C/i.test(await hudText(page))} (expect false)`,
    );
    await page.screenshot({ path: "/tmp/demo/seg3-F1-book1-coast.png" });

    // book2early: everything must be there.
    await deployToSurface(page, { operative: "marine", spoiler: "book2early" });
    await teleport(page, 22, 200);
    const card = await pollFor(page, /KAGUYAHIME SHORE/i, 6000, 200);
    console.log(`[F] book2early: shore-card=${card}`);
    const mem = await pollFor(page, /Log Kaguyahime memorial/i, 6000);
    console.log(`[F] book2early: memorial-prompt=${mem}`);
    await pressE(page);
    const logged = await pollFor(page, /Kaguyahime vector logged/i, 5000);
    console.log(`[F] book2early: memorial-logged=${logged}`);
    await pressE(page); // one-shot poke
    const dupCount = ((await hudText(page)).match(/Kaguyahime vector logged/gi) ?? [])
      .length;
    console.log(`[F] book2early: logged-toast-count=${dupCount} (expect 1)`);
    await page.screenshot({ path: "/tmp/demo/seg3-F2-book2-memorial.png" });

    await teleport(page, 35, 195);
    const cachePrompt = await pollFor(page, /Recover cache/i, 6000);
    console.log(`[F] book2early: coast-cache-prompt=${cachePrompt}`);
    await pressE(page);
    const looted = await pollFor(page, /CACHE RECOVERED — CACHE-C/i, 5000);
    const finalLog = /RECOVERED — Survey B — final log/i.test(await hudText(page));
    console.log(
      `[F] book2early: cache-c-looted=${looted} final-team-b-fragment=${finalLog}`,
    );
    await page.keyboard.press("j");
    await page.waitForTimeout(900);
    const journal = await hudText(page);
    console.log(
      `[F] book2early: journal-final-log=${/Survey B — final log/i.test(journal)} reveal-body=${/do not open the channel/i.test(journal)}`,
    );
    await page.keyboard.press("Escape");
    await page.screenshot({ path: "/tmp/demo/seg3-F3-book2-cache.png" });
    dumpErrs("F", errs);
  });

  test("G. chapter deep links: 1 (colony dawn) and 16 (coast, book2early)", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errs = wireErrors(page);

    await deployToSurface(page, { operative: "marine", chapter: "1" });
    const note1 = await pollFor(page, /CH\. 1 — the first amber dawn/i, 8000);
    const hud1 = await hudText(page);
    const clock = /\d\d?:\d\d/.exec(hud1)?.[0] ?? "?";
    const grid1 = await pollFor(page, /COLONY PLATEAU/i, 6000, 200);
    console.log(
      `[G] ch1: note-toast=${note1} clock=${clock} (tod 0.27 => ~06:28) colony-card=${grid1}`,
    );
    console.log(`[G] ch1 hud=${JSON.stringify(hud1.slice(0, 700))}`);
    await page.screenshot({ path: "/tmp/demo/seg3-G1-ch1.png" });

    await deployToSurface(page, { operative: "marine", chapter: "16" });
    const note16 = await pollFor(page, /CH\. 16 — the far shore answers/i, 8000);
    // Spawn "coast" is (20,185) — inside the shore region circle (r=28).
    const grid16 = await pollFor(page, /KAGUYAHIME SHORE/i, 8000, 200);
    const hud16 = await hudText(page);
    const clock16 = /\d\d?:\d\d/.exec(hud16)?.[0] ?? "?";
    console.log(
      `[G] ch16: note-toast=${note16} shore-card=${grid16} clock=${clock16} (tod 0.75 => 18:00)`,
    );
    console.log(`[G] ch16 hud=${JSON.stringify(hud16.slice(0, 900))}`);
    // Ceiling must have been forced up: memorial interactable.
    await teleport(page, 22, 200);
    const mem = await pollFor(page, /Log Kaguyahime memorial/i, 6000);
    console.log(`[G] ch16: memorial-prompt-under-forced-ceiling=${mem}`);
    await page.screenshot({ path: "/tmp/demo/seg3-G2-ch16.png" });
    dumpErrs("G", errs);
  });

  test("H. ch16 arrival timing: catch the note + shore card from the deploy click", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errs = wireErrors(page);
    // Bypass deployToSurface's settle so the first seconds are observable.
    await page.goto("/?quality=low&operative=marine&chapter=16", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: /Deploy to surface/i }).click();
    let sawNote = false;
    let sawCard = false;
    let noteAt = -1;
    let cardAt = -1;
    const t0 = Date.now();
    while (Date.now() - t0 < 30_000 && !(sawNote && sawCard)) {
      const t = await page.locator("body").innerText().catch(() => "");
      const el = (Date.now() - t0) / 1000;
      if (!sawNote && /CH\. 16 — the far shore answers/i.test(t)) {
        sawNote = true;
        noteAt = el;
      }
      if (!sawCard && /KAGUYAHIME SHORE/i.test(t)) {
        sawCard = true;
        cardAt = el;
      }
      await page.waitForTimeout(120);
    }
    console.log(
      `[H] ch16 tight poll: note=${sawNote}@${noteAt.toFixed(1)}s card=${sawCard}@${cardAt.toFixed(1)}s`,
    );
    // How long does the note survive the arrival message flood?
    if (sawNote) {
      let goneAt = -1;
      const t1 = Date.now();
      while (Date.now() - t1 < 25_000) {
        const t = await page.locator("body").innerText().catch(() => "");
        if (!/CH\. 16 — the far shore answers/i.test(t)) {
          goneAt = (Date.now() - t1) / 1000;
          break;
        }
        await page.waitForTimeout(400);
      }
      console.log(
        `[H] note visible-for=${goneAt < 0 ? ">25s" : `${goneAt.toFixed(1)}s after first seen`}`,
      );
      const flood = await page.locator("body").innerText();
      const tick = flood.split("OBJECTIVES")[0]?.split("SAFE")[1] ?? "";
      console.log(`[H] ticker at that point=${JSON.stringify(tick.slice(0, 400))}`);
    }
    await page.screenshot({ path: "/tmp/demo/seg3-H1-ch16-arrival.png" });
    dumpErrs("H", errs);
  });
});
