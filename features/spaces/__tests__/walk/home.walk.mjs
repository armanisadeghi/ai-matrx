// E4 — Spaces Home (round 41): on a new page titled "Vet follow-ups", "@today" at a time ~3 hours out with
// Remind "At time of event"; then the sidebar's Home shows the page under Recently visited and the reminder under
// Upcoming, and Your pages lists it. Trashes the page (its reminder is cancelled with it).
//   MEMBER=1 SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/home.walk.mjs
import { open, newPage, act, shot, trashPage, originOf } from "./lib.mjs";

const OUT = process.env.SHOTS ?? "/tmp";
const { browser, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
const id = await newPage(page);
console.log("page", id);
await act(page, async () => {
  await page.locator(".spaces-title").first().click();
  await page.keyboard.type("Vet follow-ups", { delay: 15 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("Call Pepper's owner about the certificate @today", { delay: 20 });
});
const item = page.locator(".bn-suggestion-menu-item, [role=option]").filter({ hasText: /^\s*Today/ }).first();
await item.waitFor({ timeout: 10_000 });
await act(page, () => item.click());
const hhmm = await page.evaluate(() => {
  const d = new Date(Date.now() + 3 * 3600_000);
  if (d.getDate() !== new Date().getDate()) d.setTime(Date.now() + 90_000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
});
await act(page, async () => {
  await page.locator(".spaces-mention-datebtn").last().click();
  await page.getByLabel("Time").fill(hhmm);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await page.locator(".spaces-mention-datebtn").last().click();
  await page.locator("[data-spaces-date-card]").getByRole("combobox", { name: "Remind", exact: true }).or(page.locator("[data-spaces-date-card]").getByRole("button", { name: "Remind", exact: true })).first().click();
  await page.getByText("At time of event", { exact: true }).last().click();
  await page.keyboard.press("Escape");
});
await page.waitForTimeout(6000);
await act(page, () => page.getByRole("button", { name: "Home", exact: true }).first().click());
await page.waitForURL(/\/spaces\/home/, { timeout: 60_000 });
await page.locator("[data-spaces-home]").waitFor({ timeout: 60_000 });
await page.locator("[data-upcoming]").first().waitFor({ timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(1500);
const r = {
  recentFirst: await page.locator(".spaces-home-card-title").first().textContent().catch(() => null),
  upcoming: await page.locator("[data-upcoming]").filter({ hasText: "Call Pepper" }).count(),
  upcomingText: await page.locator("[data-upcoming]").first().innerText().catch(() => null),
  yours: await page.locator("section[aria-label='Your pages'] .spaces-home-row").filter({ hasText: "Vet follow-ups" }).count(),
};
await shot(page, `${OUT}/r41-home.png`);
console.log(JSON.stringify(r));
await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
await page.locator(".bn-editor").first().waitFor({ timeout: 60_000 });
console.log("trashed:", await trashPage(page));
await browser.close();
const ok = r.recentFirst === "Vet follow-ups" && r.upcoming >= 1 && r.yours === 1;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
