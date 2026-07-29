import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type()==="error") errors.push(m.text()); });
await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /Theo Daniel/i }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Deploy to surface/i }).click();
await page.waitForSelector("canvas", { timeout: 15000 });
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    hasCanvas: !!document.querySelector("canvas"),
    hasVitals: t.includes("VITALS"),
    hasStamina: t.includes("STAMINA"),
    hasScanHint: t.includes("scan") || t.includes("SCAN") || t.includes("Q"),
    objectives: t.match(/OBJECTIVES[\s\S]{0,120}/)?.[0],
    probe: window.__controlsTest ? { yaw: window.__controlsTest.getYaw(), speed: window.__controlsTest.getSpeed() } : null,
  };
});
// try screenshot
try {
  await page.screenshot({ path: "/workspace/screenshots/refine-play.png", timeout: 8000, animations: "disabled" });
  info.shot = true;
} catch (e) {
  info.shot = false;
  info.shotErr = e.message;
}
console.log(JSON.stringify({ ...info, errors: errors.slice(0, 15) }, null, 2));
await browser.close();
process.exit(0);
