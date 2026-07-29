import { expect, test } from "@playwright/test";
import { deployToSurface, settle } from "./helpers";

test("the game polls the signaling relay when presence is on", async ({
  page,
}) => {
  const rtcRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/rtc")) rtcRequests.push(r.url());
  });

  // No tod/wx pins — those deliberately disable presence for golden shots.
  await deployToSurface(page, { operative: "marine", spawn: "colony" });
  await settle(page, 6000);

  console.log(
    "RTC_POLLS",
    rtcRequests.length,
    rtcRequests[0]?.slice(rtcRequests[0].indexOf("/api")),
  );
  expect(rtcRequests.length, "presence should be polling /api/rtc").toBeGreaterThan(
    2,
  );
  expect(rtcRequests[0]).toContain("room=fieldops-book1");
});

test("QA pins disable presence entirely", async ({ page }) => {
  const rtcRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/rtc")) rtcRequests.push(r.url());
  });
  await deployToSurface(page, {
    operative: "marine",
    spawn: "colony",
    tod: "0.5",
    wx: "clear",
  });
  await settle(page, 5000);
  console.log("RTC_POLLS_PINNED", rtcRequests.length);
  expect(rtcRequests.length, "pinned QA runs must never join presence").toBe(0);
});
