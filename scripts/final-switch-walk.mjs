// scripts/final-switch-walk.mjs — THE FINAL SWITCH PAGE, WALKED FROM THE SEAT (lane FINAL-SWITCH).
//
// Read-only: signs in through the login form as admin@admin.com on the shared preview (the LIVE
// database), opens Administration → Database → Final switch at 1440 and 390, and records what the
// page says — the state, the press and its reason, every organization row, the platform checks,
// the rehearsal card — plus every database call it made. It NEVER presses: the press on production
// is Arman's. Then it opens an organization's settings Data card and /data to show they read the
// platform's state. Screenshots go to common-docs/operations/for-arman/<date>/final-switch/.
//
//   node scripts/final-switch-walk.mjs [shot_dir]

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://final-switch.localhost:3001";
const SHOTS = process.argv[2] ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-26/final-switch";
const HARBOR = "11f4e747-c13a-49c7-81a3-66e6391f8a9b"; // Harbor Dental Group (admin's test organization)
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

mkdirSync(SHOTS, { recursive: true });
const out = { origin: ORIGIN, at: new Date().toISOString(), views: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    const calls = [];
    page.on("response", (r) => {
      const u = r.url();
      if (u.includes("/rest/v1/rpc/") || u.includes("/cutover/")) calls.push({ url: u.replace(/\?.*$/, ""), status: r.status() });
    });
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
    const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
    if (who !== "admin@admin.com") throw new Error(`signed in as ${who}`);

    await page.goto(`${ORIGIN}/administration/database/final-switch`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForSelector('[data-testid="final-switch-rehearsal"]', { timeout: 180000 });
    await page
      .waitForFunction(() => document.querySelectorAll('[data-testid="final-switch-org-row"]').length > 0 || /could not be read/.test(document.body.innerText), null, { timeout: 180000 })
      .catch(() => undefined);
    const view = await page.evaluate(() => {
      const press = document.querySelector('[data-testid="final-switch-press"]');
      return {
        press_present: !!press,
        press_disabled: press ? press.disabled : null,
        press_why: document.querySelector('[data-testid="final-switch-press-why"]')?.textContent ?? null,
        undo_present: !!document.querySelector('[data-testid="final-switch-undo"]'),
        rows: [...document.querySelectorAll('[data-testid="final-switch-org-row"]')].map((r) => r.innerText.replace(/\s+/g, " ").slice(0, 400)),
        rehearsal: document.querySelector('[data-testid="final-switch-rehearsal"]')?.innerText.slice(0, 1200) ?? null,
        headline: document.querySelector("section p")?.textContent ?? null,
      };
    });
    await page.screenshot({ path: join(SHOTS, `final-switch-${w}.png`), fullPage: w === 1440 });

    await page.goto(`${ORIGIN}/organizations/${HARBOR}/settings#data`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForTimeout(8000);
    const card = await page.evaluate(() => document.body.innerText.match(/Switched for everyone at once[\s\S]{0,600}/)?.[0] ?? null);
    if (w === 1440) await page.screenshot({ path: join(SHOTS, `org-data-card-${w}.png`), fullPage: false });

    await page.goto(`${ORIGIN}/data`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForTimeout(3000);
    const dataLandsOn = new URL(page.url()).pathname;

    out.views.push({ width: w, signed_in_as: who, ...view, org_card_platform_lines: card, data_lands_on: dataLandsOn, calls, console_errors: errors });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(SHOTS, "walk.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.views.map((v) => ({ width: v.width, press_present: v.press_present, press_disabled: v.press_disabled, press_why: v.press_why, undo: v.undo_present, rows: v.rows.length, data_lands_on: v.data_lands_on, readiness_calls: v.calls.filter((c) => c.url.includes("final_switch")).map((c) => c.status), errors: v.console_errors.length })), null, 2));
