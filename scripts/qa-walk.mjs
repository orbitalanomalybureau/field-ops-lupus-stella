import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type()==="error") errors.push(m.text()); });
await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2800);
await page.getByRole("button", { name: /Miles/i }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Deploy to surface/i }).click();
await page.waitForSelector("canvas", { timeout: 10000 });
await page.waitForTimeout(1500);
await page.mouse.click(480, 270);

for (let i = 0; i < 18; i++) {
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(550);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
}
await page.waitForTimeout(800);

const hud = await page.evaluate(() => {
  const t = document.body.innerText;
  const probe = window.__controlsTest;
  return {
    obj: t.match(/OBJECTIVES[\s\S]{0,500}/)?.[0],
    messages: t.match(/OBJECTIVE COMPLETE[^\n]+/g),
    probe: probe ? { yaw: probe.getYaw(), speed: probe.getSpeed() } : null,
    hasCanvas: !!document.querySelector("canvas"),
  };
});
console.log(JSON.stringify({ ...hud, errors }, null, 2));
await browser.close();
process.exit(0);
