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

const ORG_NAME = "Birchwood Ave Renovation";
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

  // The organization picker on the /data-v2 empty state, chosen the way a person does.
  await page.waitForTimeout(3000);
  const orgOption = page.getByRole("option", { name: new RegExp(ORG_NAME, "i") }).first();
  if (await orgOption.count()) {
    await orgOption.click({ timeout: 15000, force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    note("organization", ORG_NAME);
  } else {
    note("organization picker", "no option on screen — assuming the session already holds one");
  }

  // ── 1. THE EDITOR, with the $5,000 rule open in it ──────────────────────────────────
  await page.goto(`${ORIGIN}${TABLE_URL}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(6000);
  const settings = page.getByRole("button", { name: /settings/i }).first();
  if (await settings.count()) {
    await settings.click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3500);
  }
  const heading = page.getByText("Rules for entering", { exact: false }).first();
  if (await heading.count()) {
    await heading.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    note("the section is on screen", await page.evaluate(() => document.body.innerText.includes("Rules for entering") ? "yes" : "no"));
    const edit = page.getByRole("button", { name: /^Edit$/ }).last();
    if (await edit.count()) {
      await edit.click({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(4000);
    }
    const preview = await page
      .locator('[data-testid="stage-rule-preview"]')
      .first()
      .textContent()
      .catch(() => null);
    note("the live preview says", preview ?? "(nothing on screen)");
    await shot(page, "1-the-editor-with-the-5000-rule");
  } else {
    note("the section", "NOT FOUND on the settings rail — shot taken anyway so the miss is visible");
    await shot(page, "1-settings-rail-without-the-section");
  }

  // ── 2. THE BOARD, and the refusal ───────────────────────────────────────────────────
  await page.goto(`${ORIGIN}${TABLE_URL}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(6000);
  const board = page.getByRole("button", { name: /board|kanban/i }).first();
  if (await board.count()) {
    await board.click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);
  }
  await shot(page, "2-the-quotes-board");
  note("board text", (await page.evaluate(() => document.body.innerText.slice(0, 400))).replace(/\s+/g, " "));

  writeFileSync(resolve(OUT, "stage-rules-walk.txt"), notes.join("\n") + "\n");
  await browser.close();
}

main().catch(async (error) => {
  console.error(`[stagerules2] ${error?.message ?? error}`);
  process.exitCode = 1;
});
