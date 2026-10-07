/**
 * LANE BELL-OWNER — the headless walk of the bell rule on the shared preview (LIVE database), as
 * admin@admin.com. Arman, 2026-10-07: the badge counts only what is new since the bell was opened;
 * opening clears it; everything in it clears in a few clicks, waiting workflows included.
 *
 *   node scripts/bell-zero-walk.mjs open      # sign in, read the badge, open the bell → 0
 *   (a new notice is delivered to admin@admin.com between the phases)
 *   node scripts/bell-zero-walk.mjs clear     # badge 1 → Clear all + clear every place → 0, reload → 0
 *
 * Writes: only admin@admin.com's own seen/done marks and bell preferences (all reversible: Done view,
 * Hidden places, Undo).
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://s96c6068c.localhost:3001";
const OUT = process.env.OUT ?? "/tmp/matrx-evidence/2026-10-07/bell-owner";
mkdirSync(OUT, { recursive: true });
const STATE = `${OUT}/storage.json`;
const env = {};
for (const file of [".env", ".env.local"]) {
  const path = new URL(`../${file}`, import.meta.url);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
const phase = process.argv[2] ?? "open";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  ...(phase !== "open" && existsSync(STATE) ? { storageState: STATE } : {}),
});
const page = await ctx.newPage();
const missing = [];
page.on("response", (r) => {
  if (r.url().includes("/rpc/") && (r.status() === 404 || r.status() >= 500)) missing.push(`${r.status()} ${r.url().split("/rpc/")[1]?.split("?")[0]}`);
});
const bell = page.locator("[data-inbox-header-button] button").first();
const label = async () => (await bell.getAttribute("aria-label")) ?? "";
const badgeOf = (l) => Number(l.match(/Notifications, (\d+) new/)?.[1] ?? 0);
const settle = async (want, ms = 90000) => {
  const got = await until(`badge ${want}`, async () => {
    const l = await label();
    return l.startsWith("Notifications") && want(badgeOf(l)) ? l : null;
  }, ms);
  return got.v ?? (await label());
};

try {
  if (phase === "open") {
    const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
    check("signed in as admin@admin.com", who === env.AI_ADMIN_USERNAME, who ?? "none");
  }
  await page.goto(`${ORIGIN}/notes`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await bell.waitFor({ timeout: 180000 });

  if (phase === "open") {
    const before = await settle((n) => n > 0, 60000);
    console.log(`INFO badge before opening: "${before}"`);
    await page.screenshot({ path: `${OUT}/1-before-open.png` });
    await bell.click();
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/2-bell-open.png` });
    await bell.click(); // close
    const after = await settle((n) => n === 0, 30000);
    check("opening the bell takes the badge to 0", badgeOf(after) === 0, `before "${before}" → after "${after}"`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await bell.waitFor({ timeout: 180000 });
    await sleep(8000);
    const reloaded = await label();
    check("after a reload the badge is still 0", badgeOf(reloaded) === 0, reloaded);
    await ctx.storageState({ path: STATE });
  } else {
    const fresh = await settle((n) => n >= 1, 120000);
    check("a new notice makes the badge 1", badgeOf(fresh) === 1, fresh);
    await page.screenshot({ path: `${OUT}/3-one-new.png` });
    await bell.click();
    await sleep(4000);
    const panel = page.locator("[data-inbox-panel]").first();
    let clicks = 0;
    const clearAll = panel.locator("[data-inbox-clear-all]");
    if (await clearAll.count()) {
      await clearAll.click();
      clicks += 1;
      await sleep(4000);
    }
    // Every place with a number: ⋯ → Clear (two clicks each).
    for (const key of ["approvals", "work", "workflows", "assists"]) {
      const count = panel.locator(`[data-source-count="${key}"]`);
      if (!(await count.count())) continue;
      const before = await count.textContent();
      await panel.locator(`[data-source-menu="${key}"]`).click();
      await page.locator(`[data-source-clear="${key}"]`).click();
      clicks += 2;
      await sleep(1500);
      check(`place "${key}" (${before}) clears`, (await panel.locator(`[data-source-count="${key}"]`).count()) === 0);
    }
    await page.screenshot({ path: `${OUT}/4-cleared.png` });
    const text = (await panel.innerText()).replace(/\s+/g, " ");
    check("the bell says all caught up", /all caught up/i.test(text), text.slice(0, 160));
    const leftCounts = await panel.locator("[data-source-count]").count();
    check("no place shows a number", leftCounts === 0, `${leftCounts} left`);
    console.log(`INFO clicks to zero: ${clicks}`);
    await bell.click();
    const after = await settle((n) => n === 0, 30000);
    check("badge 0 after clearing", badgeOf(after) === 0, after);
    await page.reload({ waitUntil: "domcontentloaded" });
    await bell.waitFor({ timeout: 180000 });
    await sleep(10000);
    const reloaded = await label();
    check("after a reload the badge is still 0", badgeOf(reloaded) === 0, reloaded);
    await bell.click();
    await sleep(5000);
    const again = page.locator("[data-inbox-panel]").first();
    const againText = (await again.innerText()).replace(/\s+/g, " ");
    check("after a reload the bell is still all caught up", /all caught up/i.test(againText), againText.slice(0, 160));
    check("after a reload no place shows a number", (await again.locator("[data-source-count]").count()) === 0);
    await page.screenshot({ path: `${OUT}/5-after-reload.png` });
  }
  check("no triage door answered 404 or 5xx", missing.length === 0, missing.slice(0, 5).join(", "));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
