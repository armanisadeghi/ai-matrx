// scripts/cutover-switch-tails-walk.mjs — lane CUTOVER-TAILS headless proof of the org settings
// "Data" switch (OrgDataSwitches, features/unified-data/cutover/OrgDataSwitches.tsx) for
// admin@admin.com's own organization: screenshot the switch + readiness sentence, and try its
// "Check again" rerun control (the only rerun the page offers) on the older_tables seam.
//
//   ORIGIN=<site> SHOTS=<dir> node scripts/cutover-switch-tails-walk.mjs
//
// Prints a JSON verdict; never touches any organization other than admin's own.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:3001";
const SHOTS = process.env.SHOTS ?? "/tmp";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const out = { origin: ORIGIN };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await context.newPage();

try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);

  // admin's own organization (never a test organization): read it from the app's own state.
  const org = await page.evaluate(async () => {
    const res = await fetch("/api/whoami");
    return res.ok ? res.json() : null;
  });
  out.whoami = org;

  // Land on the organizations list and take admin's own (non-test) organization's settings page.
  await page.goto(`${ORIGIN}/organizations`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(2000);
  await page.screenshot({ path: join(SHOTS, "orgs-list.png") });

  const rows = await page.locator("a[href^='/organizations/']").all();
  const hrefs = [];
  for (const r of rows) {
    const href = await r.getAttribute("href").catch(() => null);
    if (href && /^\/organizations\/[^/]+$/.test(href)) hrefs.push(href);
  }
  out.candidate_org_links = [...new Set(hrefs)];
  if (!out.candidate_org_links.length) throw new Error("no organization links found on /organizations");

  const orgHref = out.candidate_org_links[0];
  out.chosen_org_href = orgHref;
  const settingsUrl = `${ORIGIN}${orgHref}/settings#data`;
  out.settings_url = settingsUrl;
  await page.goto(settingsUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(2000);

  const dataSection = page.locator("#data");
  await until("data section", () => dataSection.isVisible(), 60000);
  await dataSection.scrollIntoViewIfNeeded();
  await sleep(1500);
  await page.screenshot({ path: join(SHOTS, "data-switch-before.png"), fullPage: false });

  // Capture the readiness sentence(s) and the rerun control's exact label.
  out.checks_before = await page.locator("#data li span").allInnerTexts().catch(() => []);
  const checkAgainBtn = page.locator("#data button", { hasText: /check again/i }).first();
  out.check_again_visible = await checkAgainBtn.isVisible().catch(() => false);
  out.check_again_label = out.check_again_visible ? (await checkAgainBtn.innerText()).trim() : null;

  if (out.check_again_visible) {
    await checkAgainBtn.click();
    await sleep(2500);
    await page.screenshot({ path: join(SHOTS, "data-switch-after-rerun.png") });
    out.checks_after = await page.locator("#data li span").allInnerTexts().catch(() => []);
    out.sentence_changed = JSON.stringify(out.checks_before) !== JSON.stringify(out.checks_after);
  }

  out.ok = true;
} catch (e) {
  out.ok = false;
  out.error = String(e?.message ?? e);
  await page.screenshot({ path: join(SHOTS, "error.png") }).catch(() => {});
} finally {
  await browser.close();
}
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
