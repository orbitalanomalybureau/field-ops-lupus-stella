import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /Theo/i }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Deploy/i }).click();
await page.waitForTimeout(5000);
// walk into forest
await page.mouse.click(640, 360);
for (let i = 0; i < 6; i++) {
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
}
await page.waitForTimeout(800);
try {
  await page.screenshot({ path: "/workspace/screenshots/refine-forest.png", timeout: 10000, animations: "disabled" });
  console.log("shot ok");
} catch (e) {
  // fallback: extract canvas dataURL
  const data = await page.evaluate(() => document.querySelector("canvas")?.toDataURL("image/jpeg", 0.7));
  if (data) {
    const fs = await import("fs");
    const b64 = data.split(",")[1];
    fs.writeFileSync("/workspace/screenshots/refine-forest.jpg", Buffer.from(b64, "base64"));
    console.log("canvas dump ok", b64.length);
  } else console.log("no shot", e.message);
}
const t = await page.innerText("body");
console.log(t.match(/OBJECTIVES[\s\S]{0,200}/)?.[0]);
await browser.close();
