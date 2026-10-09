// C28 — the AI block (round 41): "/ai" puts an AI block on a new page; a prompt generates in place through
// spaces.writing_assist; the answer is still there after a reload (stored prompt + output). Trashes the page.
//   MEMBER=1 SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/ai-block.walk.mjs
import { open, newPage, act, shot, slash, trashPage, originOf } from "./lib.mjs";

const OUT = process.env.SHOTS ?? "/tmp";
const { browser, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
const id = await newPage(page);
console.log("page", id);
await act(page, async () => {
  await page.locator(".spaces-title").first().click();
  await page.keyboard.type("Kickoff agenda", { delay: 15 });
  await page.keyboard.press("Enter");
  await slash(page, "ai", "AI block");
});
const box = page.locator("[data-ai-block]").first();
await box.waitFor({ timeout: 15_000 });
await act(page, async () => {
  await box.locator("textarea").fill("Write three short bullet points for a spring campaign kickoff meeting agenda.");
  await box.locator("textarea").press("Enter");
});
await page.waitForFunction(() => document.querySelector("[data-ai-block]")?.getAttribute("data-state") === "running", null, { timeout: 30_000 }).catch(() => {});
await shot(page, `${OUT}/r41-ai-running.png`);
await page.waitForFunction(() => document.querySelector("[data-ai-block]")?.getAttribute("data-state") === "done", null, { timeout: 180_000 }).catch(() => {});
const before = (await box.innerText().catch(() => "")).trim();
await page.waitForTimeout(4000);
await shot(page, `${OUT}/r41-ai-done.png`);
await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
await page.locator("[data-ai-block][data-state=done]").first().waitFor({ timeout: 60_000 }).catch(() => {});
const after = (await page.locator("[data-ai-block]").first().innerText().catch(() => "")).trim();
console.log(JSON.stringify({ before: before.slice(0, 300), after: after.slice(0, 300) }));
console.log("trashed:", await trashPage(page));
await browser.close();
const ok = before.length > 40 && after.length > 40 && after.includes(before.split("\n")[0].slice(0, 20));
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
