/**
 * THE PICTURES THE STORE HAS EARNED, on the Birchwood Avenue renovation.
 *
 * Lane STAGE-RULES left no screenshots on purpose: the three-outcome board needed a package
 * the app had not published, and a shot captioned "stage rules" showing a board without them
 * is the one lie a screenshot exists to prevent. This takes them, plus the settings screen
 * that lane could not take because it did not exist.
 *
 *   node scripts/campaign-tests/stagerules2_shots.mjs --port 3039 --out <dir>
 *
 * HEADLESS, on its own host, on this lane's own reserved port (scripts/campaign-ports.json).
 * It signs in as admin@admin.com through the nonce handshake and touches ONLY the Birchwood
 * Avenue renovation organization.
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);

const PORT = arg("--port", "3039");
const HOST = arg("--host", "stagerules2.localhost");
const OUT = arg("--out", resolve(ROOT, "tmp/stagerules2-shots"));
const ORIGIN = `http://${HOST}:${PORT}`;

const ORG_SLUG = "home-renovation";
const QUOTES = "0e108f31-5078-48ec-9a15-b492baa414ba";
const TABLE_URL = `/data-v2/${QUOTES}`;

mkdirSync(OUT, { recursive: true });

const notes = [];
function note(what, said) {
  notes.push(`${what}: ${said}`);
  console.log(`[stagerules2] ${what}: ${said}`);
}

async function shot(page, name) {
  const file = resolve(OUT, `stage-rules-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[stagerules2] ${file}`);
  return file;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[page:error] ${m.text().slice(0, 300)}`);
  });

  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent("/data-v2")}`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  if (!who?.email) throw new Error("no identity — the dev-login handshake did not sign anybody in");
  // THE IDENTITY IS CHECKED, NOT ASSUMED. An existing session is not proof.
  if (!/^admin@admin\.com$/i.test(who.email)) {
    throw new Error(`signed in as ${who.email} — every campaign walk runs as admin@admin.com`);
  }
  note("signed in as", who.email);

  // THE ORGANIZATION, PICKED BY ITS SLUG AND NOT BY ITS NAME. There are TWO organizations
  // called "Birchwood Avenue Renovation" on this account — a fixture crew made a second one
  // — and clicking the wrong one gives a screenshot of somebody else's empty board that
  // looks exactly like a working one. The slug is the only thing that tells them apart.
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(5000);
  // The row is a `button[role=option]`; its accessible name runs the abbreviation, the name
  // and the slug together ("BARBirchwood Avenue Renovationhome-renovation"). Clicking the
  // slug's own <span> does nothing, which is how the first run of this walk ended up
  // photographing the picker.
  const slugRow = page.getByRole("option").filter({ hasText: ORG_SLUG }).last();
  if (await slugRow.count()) {
    await slugRow.scrollIntoViewIfNeeded().catch(() => {});
    await slugRow.click({ timeout: 20000 }).catch((e) => note("org click", String(e).slice(0, 120)));
    await page.waitForTimeout(6000);
  } else {
    note("org row", `no button[role=option] carrying ${ORG_SLUG}`);
  }
  const stillAsking = await page.evaluate(() => document.body.innerText.includes("No organization selected"));
  note("organization chosen", stillAsking ? "NO — the picker is still on screen" : `yes (${ORG_SLUG})`);
  if (stillAsking) {
    await shot(page, "0-org-picker-would-not-take");
    throw new Error("the organization picker would not take a click — every shot after this would be of the picker");
  }

  // ── 1. THE SETTINGS RAIL ────────────────────────────────────────────────────────────
  // "Settings" is a TOOLBAR button on the table page, not a nav item — a loose
  // /settings/i match picks up the left rail's own gear and photographs the wrong screen.
  await page.goto(`${ORIGIN}${TABLE_URL}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(8000);
  const settings = page.getByRole("button", { name: /^Settings$/ }).first();
  if (await settings.count()) {
    await settings.click({ timeout: 20000 }).catch((e) => note("settings click", String(e).slice(0, 120)));
    await page.waitForTimeout(5000);
  } else {
    note("settings", "no toolbar button called Settings");
  }
  const hasSection = await page.evaluate(() => document.body.innerText.includes("Rules for entering"));
  note("the section is on screen", hasSection ? "yes" : "NO — this bundle predates records-ui 0.50.0");
  if (hasSection) {
    const edit = page.getByRole("button", { name: /^Edit$/ }).last();
    if (await edit.count()) {
      await edit.click({ timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(5000);
    }
    const preview = await page.locator('[data-testid="stage-rule-preview"]').first().textContent().catch(() => null);
    note("the live preview says", preview ?? "(nothing on screen)");
    await shot(page, "1-the-editor-with-the-5000-rule");
  } else {
    await shot(page, "1-settings-rail-without-the-section");
  }

  // ── 2. THE BOARD, AND THE REFUSAL ───────────────────────────────────────────────────
  // The board is a VIEW, not a toolbar button — a /board|kanban/i match hits "Dashboards".
  await page.goto(`${ORIGIN}${TABLE_URL}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(8000);
  const kanban = page.getByRole("button", { name: /kanban|board/i }).filter({ hasNotText: /dashboard/i }).first();
  if (await kanban.count()) {
    await kanban.click({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(6000);
  } else {
    note("board view", "no saved board view on this table — the toolbar offers New view");
  }
  await shot(page, "2-the-quotes-table");
  const body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  note("what the screen says", body.slice(0, 500));

  writeFileSync(resolve(OUT, "stage-rules-walk.txt"), notes.join("\n") + "\n");
  await browser.close();
}

main().catch(async (error) => {
  console.error(`[stagerules2] ${error?.message ?? error}`);
  process.exitCode = 1;
});
