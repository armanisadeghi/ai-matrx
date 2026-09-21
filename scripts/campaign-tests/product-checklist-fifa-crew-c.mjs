// Data crew C: use-the-product checklist against the one fully-populated
// dataset (FIFA World Cup finals, 22 real rows, entered via store doors) —
// a saved view grouped and colored by winner, a dashboard question, a form,
// and a share to test@test.com. Headless Playwright, this crew's own
// *.localhost host on the shared dev server.
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const HOST = "realdata-c.localhost";
const ORIGIN = `http://${HOST}:3001`;
const { tableId } = JSON.parse(readFileSync(resolve(ROOT, "scripts/campaign-tests/entry-results-crew-c-fifa.json"), "utf8"));
const OUT_DIR = resolve(ROOT, "scripts/campaign-tests");
const findings = [];
function limit(doing, said, expected) {
  findings.push({ when: new Date().toISOString(), crew: "C", use_case: "FIFA World Cup finals trivia night", doing, said, expected });
  console.log(`[LIMIT] ${doing} -> ${said}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(`/data-v2/${tableId}`)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);

  const orgOption = page.getByRole("option", { name: /The Offside Rule/i }).first();
  if (await orgOption.count()) {
    await orgOption.scrollIntoViewIfNeeded().catch(() => {});
    await orgOption.click({ timeout: 5000, force: true }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.goto(`${ORIGIN}/data-v2/${tableId}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: resolve(OUT_DIR, "fifa-1-grid.png"), fullPage: true }).catch(() => {});
  const bodyText0 = await page.locator("body").innerText().catch(() => "");
  console.log("grid rows visible:", (bodyText0.match(/\b19\d\d|\b20\d\d/g) || []).length);

  // --- Saved view: group by winner, color by winner ---
  const groupsSelect = page.getByText("No groups", { exact: true }).first();
  if (await groupsSelect.count()) {
    await groupsSelect.click({ timeout: 5000, force: true }).catch((e) => limit("open the grouping control", String(e), "a menu to pick a group-by field"));
    await page.waitForTimeout(800);
    await page.screenshot({ path: resolve(OUT_DIR, "fifa-2-group-menu.png"), fullPage: true }).catch(() => {});
    const winnerOption = page.getByText("winner", { exact: true }).first();
    if (await winnerOption.count()) {
      await winnerOption.click({ timeout: 5000, force: true }).catch((e) => limit("pick winner as the group field", String(e), "the grid to group by winner"));
      await page.waitForTimeout(1200);
    } else {
      limit("find 'winner' in the group-by menu", "no exact-text 'winner' option found in the opened menu", "the winner field listed as a groupable column");
    }
  } else {
    limit("find a grouping control on the grid toolbar", "no button matching 'No groups'/'group' found", "a way to group the view by a field");
  }
  await page.screenshot({ path: resolve(OUT_DIR, "fifa-3-grouped.png"), fullPage: true }).catch(() => {});

  const newViewBtn = page.getByRole("button", { name: /^\+$/ }).first();
  const saveViewBtn = page.getByText(/Save view|Save as view/i).first();
  if (await saveViewBtn.count()) {
    await saveViewBtn.click({ timeout: 5000, force: true }).catch((e) => limit("save the grouped view", String(e), "the grouped/colored arrangement to persist as a named view"));
    await page.waitForTimeout(1000);
  } else {
    limit("find a 'save view' control after grouping", "no explicit Save-view control found on the toolbar", "an explicit way to save the current grouping/color as a named view, distinct from Default view");
  }

  // --- Dashboard: a real question ("finals by winner, most first") ---
  const dashTab = page.getByText("Dashboards", { exact: true }).first();
  if (await dashTab.count()) {
    await dashTab.click({ timeout: 5000, force: true }).catch((e) => limit("open the Dashboards tab", String(e), "the dashboard panel to open"));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: resolve(OUT_DIR, "fifa-4-dashboards.png"), fullPage: true }).catch(() => {});
    const bodyText = await page.locator("body").innerText().catch(() => "");
    findings.push({ when: new Date().toISOString(), crew: "C", use_case: "FIFA World Cup finals trivia night", doing: "open Dashboards and look for a way to ask 'finals won, most first, grouped by winner'", said: bodyText.slice(0, 2000), expected: "a chart or count block answerable from the winner field" });
  } else {
    limit("find the Dashboards tab on the table page", "no button named exactly 'Dashboards' found", "a Dashboards tab on the table toolbar, per the try-everything guide");
  }

  // --- Form ---
  const formsTab = page.getByText("Forms", { exact: true }).first();
  if (await formsTab.count()) {
    await formsTab.click({ timeout: 5000, force: true }).catch((e) => limit("open the Forms tab", String(e), "the forms panel to open"));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(OUT_DIR, "fifa-5-forms.png"), fullPage: true }).catch(() => {});
    const newFormBtn = page.getByText(/New form|Create form|\+ Form/i).first();
    if (await newFormBtn.count()) {
      await newFormBtn.click({ timeout: 5000, force: true }).catch((e) => limit("create a new form", String(e), "a form to be created over this table"));
      await page.waitForTimeout(2000);
      await page.screenshot({ path: resolve(OUT_DIR, "fifa-6-form-created.png"), fullPage: true }).catch(() => {});
    } else {
      limit("find a 'new form' control", "no button matching 'New form'/'Create form' found on the Forms tab", "a way to create a public form over this table");
    }
  } else {
    limit("find the Forms tab on the table page", "no button named exactly 'Forms' found", "a Forms tab on the table toolbar");
  }

  // --- Share to test@test.com ---
  const shareBtn = page.getByText("Share", { exact: true }).first();
  if (await shareBtn.count()) {
    await shareBtn.click({ timeout: 5000, force: true }).catch((e) => limit("open the Share dialog", String(e), "a dialog to share this table"));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: resolve(OUT_DIR, "fifa-7-share-dialog.png"), fullPage: true }).catch(() => {});
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
    if (await emailInput.count()) {
      await emailInput.fill("test@test.com").catch(() => {});
      const inviteBtn = page.getByText(/Invite|Send invite|^Share$|^Send$|^Add$/i).first();
      if (await inviteBtn.count()) {
        await inviteBtn.click({ timeout: 5000, force: true }).catch((e) => limit("submit the share invite to test@test.com", String(e), "test@test.com to be granted access"));
        await page.waitForTimeout(1500);
        await page.screenshot({ path: resolve(OUT_DIR, "fifa-8-after-share.png"), fullPage: true }).catch(() => {});
      } else {
        limit("find a confirm/invite button in the Share dialog", "no button matching Invite/Share/Send/Add found", "a way to submit the share invite");
      }
    } else {
      limit("find an email input in the Share dialog", "no input[type=email] or email-labelled input found", "a field to type test@test.com into");
    }
  } else {
    limit("find the Share control on the table page", "no button named exactly 'Share' found", "a Share control on the table toolbar");
  }

  writeFileSync(resolve(OUT_DIR, "product-checklist-findings-crew-c.json"), JSON.stringify(findings, null, 2));
  console.log(`wrote ${findings.length} findings`);
  await browser.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
