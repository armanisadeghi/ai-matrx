// Remind on a date mention (N2, Notion "Remind"): as the member, on a new page, "@today" gets a time ~2 minutes
// out and Remind "At time of event"; the reminder arrives in the in-app inbox through the notification dispatcher
// and the inbox is screenshotted. Leaves the page (its id is printed) for remind-cancel.walk.mjs.
//   MEMBER=1 node features/spaces/__tests__/walk/remind.walk.mjs
import { open, newPage, act, shot } from "./lib.mjs";

const { browser, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
const id = await newPage(page);
console.log("page", id);

/** Local "HH:mm" `min` minutes from now, rounded up to the next minute. */
const clock = (min) =>
  page.evaluate((m) => {
    const d = new Date(Date.now() + m * 60_000 + 60_000);
    d.setSeconds(0, 0);
    const p = (n) => String(n).padStart(2, "0");
    return { hhmm: `${p(d.getHours())}:${p(d.getMinutes())}`, at: d.toISOString() };
  }, min);

async function dateLine(text, minutes, choice) {
  await act(page, async () => {
    await page.locator(".bn-editor .bn-inline-content").last().click();
    await page.keyboard.press("End");
    await page.keyboard.type(`${text} @today`, { delay: 25 });
  });
  const item = page.locator(".bn-suggestion-menu-item, [role=option]").filter({ hasText: /^\s*Today/ }).first();
  await item.waitFor({ timeout: 10_000 });
  await act(page, () => item.click());
  const chip = page.locator(".spaces-mention-datebtn").last();
  const t = await clock(minutes);
  await chip.click();
  await page.getByLabel("Time").fill(t.hhmm);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await page.locator(".spaces-mention-datebtn").last().click();
  await page.locator("[data-spaces-date-card]").getByRole("combobox", { name: "Remind", exact: true }).or(page.locator("[data-spaces-date-card]").getByRole("button", { name: "Remind", exact: true })).first().click();
  await page.getByText(choice, { exact: true }).last().click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const remind = await page.locator(".spaces-mention[data-date]").last().getAttribute("data-remind");
  const iso = await page.locator(".spaces-mention[data-date]").last().getAttribute("data-date");
  console.log(JSON.stringify({ line: text, iso, remind, due: t.at }));
  return t;
}

const first = await dateLine("Call Pepper's owner about the rabies certificate", 2, "At time of event");
await page.waitForTimeout(4000);
console.log("SET_DONE", new Date().toISOString());

// Wait for the first reminder's time, then for the dispatcher (5 s sweep), then open the inbox.
const waitMs = new Date(first.at).getTime() - Date.now() + 25_000;
if (waitMs > 0) await page.waitForTimeout(waitMs);
await page.goto(`${new URL(page.url()).origin}/notifications`, { waitUntil: "domcontentloaded" });
await page.getByText("Reminder: ", { exact: false }).first().waitFor({ timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(2000);
await shot(page, process.env.SHOT ?? "/tmp/remind-delivered.png");
const seen = await page.getByText("Call Pepper's owner", { exact: false }).count();
console.log("DELIVERED_VISIBLE", seen);
await browser.close();
process.exit(seen > 0 ? 0 : 1);
