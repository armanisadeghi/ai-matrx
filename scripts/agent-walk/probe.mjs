/**
 * What is actually on the screen when somebody presses "Ask an agent".
 *
 * A probe, not a walk: it opens one real table in one real organization, opens
 * the rail named on the command line, prints what the rail says, presses the
 * agent half, and prints what happens next. Written because guessing the
 * affordances from the React source is how a harness ends up asserting against
 * a button that does not exist.
 *
 *   node scripts/agent-walk/probe.mjs form
 */
import { chromium } from "playwright";
import {
  CASES,
  signIn,
  useOrganization,
  settleOnTable,
  shot,
} from "../builders-walk/walk.mjs";

const which = process.argv[2] ?? "form";
const RAIL = { form: /^Forms$/, booking: /^Bookings$/, portal: /^Portals$/, digest: /^Dashboards$/ };
const T = CASES[which];

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1020 } })).newPage();

const who = await signIn(page, "/data-v2");
console.log(`[probe] signed in as ${who.email}`);
await useOrganization(page, T);
await settleOnTable(page, T.table);
console.log(`[probe] on ${T.orgName} / ${T.tableName} (${T.table})`);

await page.getByRole("button", { name: RAIL[which] }).first().click();
await page.waitForTimeout(4000);
await shot(page, `probe-${which}-01-rail`);
console.log("\n──── RAIL TEXT ────\n" + (await page.evaluate(() => document.body.innerText)).slice(0, 2500));

const ask = page.getByRole("button", { name: /Ask an agent/i }).first();
console.log("\n[probe] 'Ask an agent' visible:", await ask.isVisible().catch(() => false));
if (await ask.isVisible().catch(() => false)) {
  await ask.click();
  await page.waitForTimeout(8000);
  await shot(page, `probe-${which}-02-after-ask`);
  console.log("\n──── AFTER THE ASK ────\n" + (await page.evaluate(() => document.body.innerText)).slice(0, 3000));
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("textarea, [contenteditable=true], input[type=text]"))
      .filter((n) => n.getClientRects().length > 0)
      .map((n) => ({
        tag: n.tagName,
        placeholder: n.getAttribute("placeholder"),
        aria: n.getAttribute("aria-label"),
      })),
  );
  console.log("\n──── VISIBLE INPUTS ────\n" + JSON.stringify(boxes, null, 2));
}

await browser.close();
