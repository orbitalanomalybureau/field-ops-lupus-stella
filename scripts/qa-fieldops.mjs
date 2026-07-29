import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await page.waitForTimeout(2800);
await page.screenshot({ path: "/workspace/screenshots/01-select.png", fullPage: false });

const theo = page.getByRole("button", { name: /Theo Daniel/i });
await theo.click({ timeout: 10000 });
await page.waitForTimeout(600);
await page.screenshot({ path: "/workspace/screenshots/02-briefing.png" });

await page.getByRole("button", { name: /Deploy to surface/i }).click();
await page.waitForTimeout(5000);
await page.screenshot({ path: "/workspace/screenshots/03-playing.png" });

const hasCanvas = await page.evaluate(() => !!document.querySelector("canvas"));
const body = await page.evaluate(() => document.body.innerText.slice(0, 800));

await page.keyboard.down("KeyW");
await page.waitForTimeout(2000);
await page.keyboard.up("KeyW");
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/04-moved.png" });

// Sprint south toward forest
for (let i = 0; i < 8; i++) {
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(800);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
}
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/05-south.png" });

const probe = await page.evaluate(() => {
  const t = window.__controlsTest;
  return t ? { yaw: t.getYaw(), speed: t.getSpeed() } : null;
});

console.log(JSON.stringify({ hasCanvas, errors, probe, bodyPreview: body }, null, 2));
await browser.close();
