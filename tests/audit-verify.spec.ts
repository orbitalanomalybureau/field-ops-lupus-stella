import { expect, test } from "@playwright/test";
import { deployToSurface, hudText, settle, teleport } from "./helpers";

// The critical spoiler leak: a staged codex entry must show its BASE body on
// first unlock, never stages[0] (the command-gated deep stratum). The collar
// base body reads "Thornhill's retrofit… The work that cost Carver."; the
// stage-2 body names Carver's "forty-three" — command-only content.
test("codex first-unlock shows base body, not the classified stratum", async ({
  page,
}) => {
  await deployToSurface(page, { operative: "marine", spawn: "colony" });
  await page.mouse.click(640, 360);
  await settle(page, 800);
  // gen-west collar is (-22,12); Thornhill is (-18,14). Stand on the collar,
  // clear of Thornhill's prompt, so E inspects the collar.
  await teleport(page, -23, 11);
  await page.keyboard.press("KeyE");
  await settle(page, 700);
  await page.keyboard.press("KeyC"); // codex panel
  await settle(page, 600);

  const text = await hudText(page);
  expect(text, "collar codex should be unlocked (base body)").toMatch(
    /Thornhill's retrofit|cost Carver/i,
  );
  expect(
    text,
    "the classified drift stratum must NOT show on first unlock",
  ).not.toMatch(/forty-three|aggregate is eight/i);
});
