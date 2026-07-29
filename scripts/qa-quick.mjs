import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto("http://127.0.0.1:8080/", { waitUntil: "commit", timeout: 15000 });
await page.waitForTimeout(2200);
await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent?.includes("Miles"))?.click());
await page.waitForTimeout(300);
await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent?.includes("Deploy"))?.click());
await page.waitForTimeout(4500);
const t = await page.innerText("body");
const out = {
  canvas: await page.locator("canvas").count(),
  vitals: t.includes("VITALS"),
  wx: /WX\s+(CLEAR|HAZE|RAIN|STORM)/.test(t),
  ridge: t.includes("Ridge"),
  npcsObj: t.includes("Speak with colony") || t.includes("staff"),
  clock: /DAWN|DAY|DUSK|NIGHT/.test(t),
  errors: errors.slice(0, 8),
};
await page.goto("http://127.0.0.1:8080/embed", { waitUntil: "commit", timeout: 15000 });
await page.waitForTimeout(1800);
const e = await page.innerText("body");
out.embed = e.includes("EXODUS") || e.includes("operative") || e.includes("FIELD");
await page.goto("http://127.0.0.1:8080/terminal", { waitUntil: "commit", timeout: 15000 });
await page.waitForTimeout(1200);
const term = await page.innerText("body");
out.terminal = term.includes("CLASSIFIED TERMINAL");
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(0);
