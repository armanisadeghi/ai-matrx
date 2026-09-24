/**
 * LANE SC-1-TAILS — the headless walk of "Show everything" and the per-row organization chip, from
 * the owner's seat (admin@admin.com) and an outsider's seat (test@test.com), on the dev clone.
 *
 *   SC1T_ORIGIN=http://sc1t.localhost:3070 SC1T_IDS='{"tacoma":…,"kept":…,"table":…}' \
 *   SC1T_ADMIN_EMAIL=… SC1T_ADMIN_PASSWORD=… SC1T_TEST_EMAIL=… SC1T_TEST_PASSWORD=… \
 *   node scripts/campaign-tests/sc1t_show_everything_walk.mjs
 *
 * Ids from `_sc1t_walk_fixture.sql` (after `_sc1p_walk_fixture.sql`). Credentials from the
 * environment, never printed. Headless, the real login form (scripts/lib/seat-browser.mjs).
 *
 *   S1 owner, Tacoma Yard hub: the scope strip names Tacoma Yard; what the app keeps is NOT listed,
 *      and one sentence + "Show everything" says how many are waiting
 *   S2 owner: Show everything lists "Material choices" under "Kept by the app"; Hide puts it away
 *   S3 owner, the tables list under the hub: every row carries a chip naming Tacoma Yard; its own
 *      Show everything reveals Material choices with the store's sentence for who keeps it
 *   S4 owner: a row chip opens the panel — Scale tickets lives in Tacoma Yard, Portland Depot offered
 *   S5 outsider (shared Scale tickets by name, member of neither yard): /data-v2?scope=all lists it
 *      under Tacoma Yard with a chip naming Tacoma Yard; the panel offers her no move
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

import { setOrganization, signIn, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.SC1T_ORIGIN ?? "http://sc1t.localhost:3070";
const IDS = JSON.parse(process.env.SC1T_IDS ?? "{}");
const OUT = process.env.SC1T_SHOTS ?? "/tmp/sc1t-shots";
const seats = {
  admin: [process.env.SC1T_ADMIN_EMAIL ?? "", process.env.SC1T_ADMIN_PASSWORD ?? ""],
  test: [process.env.SC1T_TEST_EMAIL ?? "", process.env.SC1T_TEST_PASSWORD ?? ""],
};
for (const [seat, [e, p]] of Object.entries(seats)) {
  if (!e || !p) {
    console.error(`The ${seat} seat's sign-in is not in the environment (never printed).`);
    process.exit(2);
  }
}
if (!IDS.table || !IDS.kept) {
  console.error("SC1T_IDS is missing ids — run _sc1t_walk_fixture.sql on the clone first.");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = {};
const pass = (name, ok, saw) => {
  results[name] = { ok: Boolean(ok), saw };
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${saw}`);
};
const TACOMA = /Cascade Electronics Recovery . Tacoma Yard/;
const PORTLAND = /Cascade Electronics Recovery . Portland Depot/;
const bodyText = (page) => page.evaluate(() => document.body.innerText);

const browser = await chromium.launch({ headless: true });
try {
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const who = await signIn(page, ORIGIN, ...seats.admin, "owner seat");
    pass("S0 owner signed in", who === seats.admin[0], who === seats.admin[0] ? "the admin seat" : "someone else");
    await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await setOrganization(page, "Cascade Electronics Recovery - Tacoma Yard");
    await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const hubControl = page.locator("[data-hub-show-everything]");
    await hubControl.waitFor({ timeout: 240000 });
    const strip = (await page.locator("[data-hub-scope]").first().innerText()).replace(/\s+/g, " ");
    const keptToggle = page.locator('[data-hub-listing-toggle="kept-by-the-app"]');
    const controlText = (await hubControl.innerText()).replace(/\s+/g, " ");
    pass(
      "S1 owner: the hub names Tacoma Yard and keeps the app's tables behind Show everything",
      TACOMA.test(strip) && (await keptToggle.count()) === 0 && /the app keeps for itself (is|are) not listed here/.test(controlText) &&
        (await hubControl.getAttribute("data-hub-show-everything")) === "off",
      `strip "${strip}" · control "${controlText}" · kept listing ${(await keptToggle.count()) ? "shown" : "absent"}`,
    );
    await page.screenshot({ path: `${OUT}/sc1t-S1-hub-default.png`, fullPage: true });

    await hubControl.getByRole("button", { name: "Show everything" }).click();
    await keptToggle.first().waitFor({ timeout: 30000 });
    await keptToggle.first().click();
    const { v: keptListed } = await until("Material choices listed in the hub", async () =>
      /Material choices/.test(await bodyText(page)) ? true : null, 30000);
    await page.screenshot({ path: `${OUT}/sc1t-S2-hub-show-everything.png`, fullPage: true });
    await hubControl.getByRole("button", { name: "Hide what the app keeps" }).click();
    await page.waitForTimeout(500);
    pass("S2 owner: Show everything lists what the app keeps; Hide puts it away",
      Boolean(keptListed) && (await keptToggle.count()) === 0,
      `listed ${keptListed ? "yes" : "no"} · after hide ${(await keptToggle.count()) ? "still shown" : "hidden"}`);

    const rowChip = page.locator(`[data-where-it-lives="${IDS.table}"]`).first();
    await rowChip.waitFor({ timeout: 120000 });
    const chips = page.locator("[data-where-it-lives]");
    const n = await chips.count();
    const texts = [];
    for (let i = 0; i < n; i += 1) texts.push(((await chips.nth(i).textContent()) ?? "").trim());
    const listControl = page.locator("[data-tables-show-everything]");
    await listControl.waitFor({ timeout: 60000 });
    const beforeKept = /Material choices/.test(await page.locator("[data-tables-show-everything]").evaluate((el) => el.parentElement?.innerText ?? ""));
    await listControl.getByRole("button", { name: "Show everything" }).click();
    const { v: says } = await until("the keeper sentence", async () => {
      const t = await bodyText(page);
      return /Kept for a column's choices|Kept by the/.test(t) && /Material choices/.test(t) ? t : null;
    }, 30000);
    pass(
      "S3 owner: every row of the tables list names Tacoma Yard; its Show everything shows the keeper's sentence",
      n > 0 && texts.every((t) => TACOMA.test(t)) && !beforeKept && Boolean(says),
      `${n} chips (${[...new Set(texts)].join(" | ").slice(0, 120)}) · kept before ${beforeKept ? "listed" : "hidden"} · sentence ${says ? "shown" : "absent"}`,
    );
    await page.screenshot({ path: `${OUT}/sc1t-S3-tables-show-everything.png`, fullPage: true });

    await rowChip.click();
    const panel = page.locator(`[data-where-it-lives-panel="${IDS.table}"]`);
    await panel.waitFor({ timeout: 60000 });
    const panelText = (await panel.innerText()).replace(/\s+/g, " ");
    pass("S4 owner: the row chip says where Scale tickets lives and offers Portland Depot",
      TACOMA.test(panelText) && (PORTLAND.test(panelText)),
      panelText.slice(0, 220));
    await page.screenshot({ path: `${OUT}/sc1t-S4-row-panel.png` });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const who = await signIn(page, ORIGIN, ...seats.test, "outsider seat");
    pass("S0 outsider signed in", who === seats.test[0], who === seats.test[0] ? "the test seat" : "someone else");
    await page.goto(`${ORIGIN}/data-v2?scope=all`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const chip = page.locator(`[data-where-it-lives="${IDS.table}"]`).first();
    await chip.waitFor({ timeout: 240000 });
    const chipText = ((await chip.textContent()) ?? "").trim();
    await chip.click();
    const panel = page.locator(`[data-where-it-lives-panel="${IDS.table}"]`);
    await panel.waitFor({ timeout: 60000 });
    const panelText = (await panel.innerText()).replace(/\s+/g, " ");
    const moves = await page.locator("[data-where-it-lives-move]").count();
    pass("S5 outsider: All my organizations names Tacoma Yard on the row; no move offered",
      TACOMA.test(chipText) && moves === 0 && /Only the person who made Scale tickets/.test(panelText),
      `chip "${chipText}" · panel "${panelText.slice(0, 160)}" · move buttons ${moves}`);
    await page.screenshot({ path: `${OUT}/sc1t-S5-outsider-all.png`, fullPage: true });
    await context.close();
  }
} catch (e) {
  pass("walk ran to the end", false, String(e).slice(0, 300));
} finally {
  await browser.close();
  writeFileSync(`${OUT}/sc1t-walk.json`, JSON.stringify(results, null, 2));
}
const failed = Object.entries(results).filter(([, r]) => !r.ok);
console.log(failed.length ? `WALK RED — ${failed.length} failed` : `WALK GREEN — ${Object.keys(results).length} clauses`);
process.exit(failed.length ? 1 : 0);
