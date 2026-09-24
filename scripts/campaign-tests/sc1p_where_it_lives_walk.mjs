/**
 * LANE SC-1' — the headless walk of "which organization is this table in, and move it", from
 * the owner's seat and an outsider's seat, on the dev clone.
 *
 *   SC1P_ORIGIN=http://sc1.localhost:3070 \
 *   SC1P_ADMIN_EMAIL=… SC1P_ADMIN_PASSWORD=… SC1P_TEST_EMAIL=… SC1P_TEST_PASSWORD=… \
 *   SC1P_IDS='{"table":…,"tacoma":…,"portland":…}' \
 *   node scripts/campaign-tests/sc1p_where_it_lives_walk.mjs
 *
 * The ids come from scripts/campaign-tests/_sc1p_walk_fixture.sql (dev clone only); the dev
 * server must point at the clone (scripts/campaign-ports.json "SC-1": 3070). Credentials come
 * from the environment and are never printed. Headless only, the real login form.
 *
 * Clauses (exit 0 only when every one passes):
 *   W1 owner: /data-v2/<table> says "Lives in" and names Tacoma Yard, from the table
 *   W2 owner: the chip opens, says where it lives, and offers Portland Depot as a Move button
 *   W3 owner: Move states the consequence first, then lands — the toast and the chip say Portland
 *   W4 outsider (test@test.com, shared by name, member of neither yard): the chip names Portland
 *      Depot — never "unknown" — and the panel says who can move it, with no Move button
 *   W5 owner: moves it back to Tacoma Yard from the same place (leaves the clone as found)
 *   W6 owner: the where-it-lives lookups on a table page (SC1P_QUIET_TABLE, the Sheet view) answer
 *      with no response >= 400 and no console error — a refusal on a page that renders fine is a
 *      screen lying in the other direction (GRID-PORT's walk, 2026-09-24)
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

import { signIn, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.SC1P_ORIGIN ?? "http://sc1.localhost:3070";
const IDS = JSON.parse(process.env.SC1P_IDS ?? "{}");
const OUT = process.env.SC1P_SHOTS ?? "/tmp/sc1p-shots";
const seats = {
  admin: [process.env.SC1P_ADMIN_EMAIL ?? "", process.env.SC1P_ADMIN_PASSWORD ?? ""],
  test: [process.env.SC1P_TEST_EMAIL ?? "", process.env.SC1P_TEST_PASSWORD ?? ""],
};
for (const [seat, [e, p]] of Object.entries(seats)) {
  if (!e || !p) {
    console.error(`The ${seat} seat's sign-in is not in the environment (never printed).`);
    process.exit(2);
  }
}
if (!IDS.table) {
  console.error("SC1P_IDS is missing the table — run _sc1p_walk_fixture.sql on the clone first.");
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

async function chipText(page) {
  const chip = page.locator(`[data-where-it-lives="${IDS.table}"]`).first();
  const { v } = await until("chip names an organization", async () => {
    const t = (await chip.textContent().catch(() => null)) ?? "";
    return t && !/Reading where this lives/.test(t) ? t : null;
  }, 120000);
  return v ?? "";
}

async function openTable(page) {
  await page.goto(`${ORIGIN}/data-v2/${IDS.table}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.locator(`[data-where-it-lives="${IDS.table}"]`).first().waitFor({ timeout: 240000 });
}

const browser = await chromium.launch({ headless: true });
try {
  // ── the owner's seat ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const who = await signIn(page, ORIGIN, ...seats.admin, "owner seat");
    pass("W0 owner signed in", who === seats.admin[0], `the app says ${who === seats.admin[0] ? "the admin seat" : "someone else"}`);
    await openTable(page);
    const text = await chipText(page);
    const body = await page.evaluate(() => document.body.innerText);
    pass("W1 owner: names Tacoma Yard", TACOMA.test(text) && /Lives in/.test(body), `chip "${text}"`);
    await page.screenshot({ path: `${OUT}/sc1p-W1-owner-tacoma.png` });

    await page.locator(`[data-where-it-lives="${IDS.table}"]`).first().click();
    const panel = page.locator(`[data-where-it-lives-panel="${IDS.table}"]`);
    await panel.waitFor({ timeout: 60000 });
    const move = page.locator(`[data-where-it-lives-move="${IDS.portland}"]`);
    const panelText = await panel.innerText();
    pass("W2 owner: offers Portland Depot", (await move.count()) === 1 && TACOMA.test(panelText), panelText.replace(/\s+/g, " ").slice(0, 200));
    await page.screenshot({ path: `${OUT}/sc1p-W2-owner-panel.png` });

    await move.click();
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: "Move Scale tickets to" }).last();
    await dialog.waitFor({ timeout: 30000 });
    const said = (await dialog.innerText()).replace(/\s+/g, " ");
    await page.screenshot({ path: `${OUT}/sc1p-W3-owner-consequence.png` });
    await dialog.getByRole("button", { name: /^Move to /}).click();
    const { v: landed } = await until("chip says Portland", async () => PORTLAND.test(await chipText(page)), 60000);
    const toastSeen = await page.evaluate(() => document.body.innerText.includes("now lives in"));
    pass(
      "W3 owner: consequence first, then the move lands",
      /moves to Cascade Electronics Recovery . Portland Depot with its/.test(said) && /stop seeing it/.test(said) && landed,
      `dialog "${said.slice(0, 160)}…" · chip now ${landed ? "Portland Depot" : "unchanged"} · toast ${toastSeen ? "seen" : "gone by now"}`,
    );
    await page.screenshot({ path: `${OUT}/sc1p-W3-owner-moved.png` });
    await context.close();
  }

  // ── the outsider's seat ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const who = await signIn(page, ORIGIN, ...seats.test, "outsider seat");
    pass("W0 outsider signed in", who === seats.test[0], `the app says ${who === seats.test[0] ? "the test seat" : "someone else"}`);
    await openTable(page);
    const text = await chipText(page);
    await page.locator(`[data-where-it-lives="${IDS.table}"]`).first().click();
    const panel = page.locator(`[data-where-it-lives-panel="${IDS.table}"]`);
    await panel.waitFor({ timeout: 60000 });
    const panelText = (await panel.innerText()).replace(/\s+/g, " ");
    const moveButtons = await page.locator("[data-where-it-lives-move]").count();
    pass(
      "W4 outsider: names Portland Depot, says who can move it, offers no move",
      PORTLAND.test(text) && !/unknown/i.test(text) && /Only the person who made Scale tickets or an owner or admin of/.test(panelText) && moveButtons === 0,
      `chip "${text}" · panel "${panelText.slice(0, 160)}" · move buttons ${moveButtons}`,
    );
    await page.screenshot({ path: `${OUT}/sc1p-W4-outsider.png` });
    await context.close();
  }

  // ── back where it was found ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await signIn(page, ORIGIN, ...seats.admin, "owner seat");
    await openTable(page);
    await chipText(page);
    await page.locator(`[data-where-it-lives="${IDS.table}"]`).first().click();
    await page.locator(`[data-where-it-lives-move="${IDS.tacoma}"]`).click();
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: "Move Scale tickets to" }).last();
    await dialog.waitFor({ timeout: 30000 });
    await dialog.getByRole("button", { name: /^Move to /}).click();
    const { v: back } = await until("chip says Tacoma", async () => TACOMA.test(await chipText(page)), 60000);
    pass("W5 owner: moved back to Tacoma Yard", Boolean(back), back ? "Tacoma Yard again" : "still Portland");

    const quietTable = process.env.SC1P_QUIET_TABLE ?? IDS.table;
    const bad = [];
    const errors = [];
    page.on("response", (r) => {
      if (r.status() >= 400 && /\/rpc\/(table_home|table_move|where_id_opens)$/.test(r.url())) bad.push(`${r.status()} ${r.url().replace(/.*\/rpc\//, "")}`);
    });
    page.on("console", (m) => {
      if (m.type() === "error" && /table_home|where_id_opens|tableHome|objectOrganization/.test(m.text())) errors.push(m.text().slice(0, 200));
    });
    await page.goto(`${ORIGIN}/data-v2/${quietTable}?view=sheet`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.locator(`[data-where-it-lives="${quietTable}"]`).first().waitFor({ timeout: 240000 });
    await page.waitForTimeout(8000);
    const named = (await page.locator(`[data-where-it-lives="${quietTable}"]`).first().textContent()) ?? "";
    pass("W6 owner: the lookups are quiet on the Sheet", bad.length === 0 && errors.length === 0 && !/unknown|Could not ask/i.test(named),
      `chip "${named}" · responses>=400 ${bad.length ? bad.join(", ") : "none"} · console errors ${errors.length}`);
    await context.close();
  }
} catch (e) {
  pass("walk ran to the end", false, String(e).slice(0, 300));
} finally {
  await browser.close();
  writeFileSync(`${OUT}/sc1p-walk.json`, JSON.stringify(results, null, 2));
}
const failed = Object.entries(results).filter(([, r]) => !r.ok);
console.log(failed.length ? `WALK RED — ${failed.length} failed` : `WALK GREEN — ${Object.keys(results).length} clauses`);
process.exit(failed.length ? 1 : 0);
