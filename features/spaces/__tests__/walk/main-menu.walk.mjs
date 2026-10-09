// Round 33 (4): Spaces sits in the main menu's Content group, first row, and opens /spaces — as the admin and
// as test@test.com (a member). Reads only; nothing is typed. Exit 1 on failure.
//   SHOT_DIR=<dir> node features/spaces/__tests__/walk/main-menu.walk.mjs
import { open, resumeIfPaused } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
for (const member of [false, true]) {
  const who = member ? "test@test.com" : "admin";
  const { browser, page } = await open({ member, next: "/notes", width: 1440, height: 1000 });
  await page.locator('[data-nav-group="/notes"]').first().waitFor({ state: "attached", timeout: 120_000 });
  await page.waitForTimeout(2000);
  await resumeIfPaused(page);
  // A person opens the main menu (the rail expands with its toggle) and opens Content's flyout.
  const menu = page.getByRole("menu", { name: "Content" });
  const chevron = page.getByRole("button", { name: "Open Content menu" });
  if (!(await chevron.first().isVisible().catch(() => false))) {
    // The rail's toggle (a label for the shell's #shell-sidebar-toggle); a route header can hide the label itself.
    const label = page.locator('label[for="shell-sidebar-toggle"]:visible').first();
    if (await label.count()) await label.click();
    else await page.locator("#shell-sidebar-toggle").evaluate((el) => el.click());
    await page.waitForTimeout(1200);
  }
  if (await chevron.first().isVisible().catch(() => false)) await chevron.first().click();
  else await page.locator('[data-nav-group="/notes"]:visible').first().hover();
  await menu.waitFor({ timeout: 15_000 }).catch(async (e) => {
    await page.screenshot({ path: `${SHOT}/main-menu-missing.png` });
    throw e;
  });
  const rows = (await menu.getByRole("link").or(menu.getByRole("menuitem")).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  await page.screenshot({ path: `${SHOT}/main-menu-${member ? "member" : "admin"}.png` });
  check(`${who}: Spaces is the first row of Content`, /^Spaces\b/.test(rows[0] ?? ""), { rows: rows.slice(0, 4) });
  await menu.getByRole("link", { name: /^Spaces\b/ }).or(menu.getByRole("menuitem", { name: /^Spaces\b/ })).first().click();
  const opened = await page.waitForURL((u) => u.pathname.startsWith("/spaces"), { timeout: 60_000 }).then(() => true, () => false);
  await page.locator(".spaces-sidebar-head").first().waitFor({ timeout: 90_000 }).catch(() => {});
  check(`${who}: Spaces opens /spaces`, opened && (await page.locator(".spaces-sidebar-head").count()) > 0, { url: new URL(page.url()).pathname });
  await browser.close();
}
process.exit(failed ? 1 : 0);
