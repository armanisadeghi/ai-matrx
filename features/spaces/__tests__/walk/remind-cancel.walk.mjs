// Remind cancels (N2): on the page remind.walk.mjs made (PAGE=<id>), the member moves the date 30 minutes out with
// "5 minutes before" (a new waiting reminder), turns Remind to None (it is cancelled), sets "1 hour before" again,
// then deletes the line (cancelled again). Each step prints what the chip holds; the database rows are read beside it.
//   MEMBER=1 SPACES_WALK_ORG="Ashford Labs" PAGE=<id> node features/spaces/__tests__/walk/remind-cancel.walk.mjs
import { open, act, shot } from "./lib.mjs";

const { browser, page } = await open({ next: `/spaces/${process.env.PAGE}`, member: !!process.env.MEMBER, width: 1440, height: 1000 });
await page.locator(".spaces-mention-datebtn").first().waitFor({ timeout: 90_000 });
const t = await page.evaluate(() => {
  const d = new Date(Date.now() + 31 * 60_000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
});
const chip = () => page.locator(".spaces-mention-datebtn").first();
const closeCard = async () => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  if (await page.locator("[data-spaces-date-card]").isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
};
const remind = async (choice) => {
  await chip().click({ force: true });
  await page.locator("[data-spaces-date-card]").getByRole("combobox", { name: "Remind", exact: true }).or(page.locator("[data-spaces-date-card]").getByRole("button", { name: "Remind", exact: true })).first().click();
  await page.getByText(choice, { exact: true }).last().click();
  await closeCard();
};
const state = async (step) => {
  await page.waitForTimeout(3500); // the page's debounce (0.8 s) + the door
  const m = page.locator(".spaces-mention[data-date]");
  console.log(step, new Date().toISOString(), JSON.stringify({ count: await m.count(), iso: await m.first().getAttribute("data-date").catch(() => null), remind: await m.first().getAttribute("data-remind").catch(() => null) }));
};

await chip().click({ force: true });
await page.getByLabel("Time").fill(t);
await closeCard();
await remind("5 minutes before");
await state("STEP1_5MIN");
await remind("None");
await state("STEP2_NONE");
await remind("5 minutes before");
await state("STEP3_5MIN_AGAIN");
await act(page, async () => {
  await page.getByText("Call Pepper's owner", { exact: false }).first().click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  if (await page.locator(".spaces-mention[data-date]").count()) await page.keyboard.press("Backspace");
});
await state("STEP4_DELETED");
await shot(page, "/tmp/remind-cancelled.png");
await browser.close();
