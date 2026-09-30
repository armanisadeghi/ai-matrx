// scripts/org-filter/variables-picker-run-walk.mjs — LANE ORG-FILTER-CLASS
//
// A RUN READS A TABLE FROM ANOTHER ORGANIZATION. On the CLONE preview, headless: the seat works in
// one organization (VR_WORKING_IN), binds the agent's variable (VR_VARIABLE) through "Fill
// automatically → From my data" to a table of ANOTHER organization (VR_TABLE), presses Run with a
// question, and the answer must quote a row of that table (VR_EXPECT, a value from it).
//
//   VR_ORIGIN=… VR_EMAIL=… VR_PASSWORD=… VR_AGENT=<id> VR_VARIABLE=recall
//   VR_TABLE="Hygiene Recall Schedule" VR_WORKING_IN="admin's Workspace"
//   VR_QUESTION="…" VR_EXPECT="Theo Brannigan" VR_SHOTS=<dir> node scripts/org-filter/variables-picker-run-walk.mjs
//
// Credentials come from the environment and are never printed.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { setOrganization, signIn, sleep, until } from "../lib/seat-browser.mjs";

const E = process.env;
for (const k of ["VR_ORIGIN", "VR_EMAIL", "VR_PASSWORD", "VR_AGENT", "VR_VARIABLE", "VR_TABLE", "VR_QUESTION", "VR_EXPECT"]) {
  if (!E[k]) throw new Error(`${k} must be set`);
}
const SHOTS = E.VR_SHOTS ?? "shots/org-filter-class";
mkdirSync(SHOTS, { recursive: true });
const results = [];
const pass = (clause, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${clause} — ${detail}`);
};
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/admin-run-${name}.png` });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const seen = [];
page.on("request", (r) => {
  if (/\/agents?\/|\/conversations?\/|\/ai\//.test(r.url()) && r.method() === "POST") seen.push(new URL(r.url()).pathname);
});

try {
  pass("seat", (await signIn(page, E.VR_ORIGIN, E.VR_EMAIL, E.VR_PASSWORD)) === E.VR_EMAIL, "signed in");
  await page.goto(`${E.VR_ORIGIN}/agents/${E.VR_AGENT}/build`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until("builder", async () => (await page.$('button[title="Variables"]')) !== null, 150000);
  if (E.VR_WORKING_IN) await setOrganization(page, E.VR_WORKING_IN);
  await sleep(1500);
  const header = await page.evaluate(() => document.body.innerText.includes("Choose organization") ? "none" : "set");
  pass("working organization is set (not the table's)", header === "set", `header: ${header === "set" ? E.VR_WORKING_IN : "Choose organization"}`);

  await page.click('button[title="Variables"]');
  const dlg = page.locator('[role="dialog"]').filter({ hasText: "Agent Variables" }).last();
  await dlg.getByText(E.VR_VARIABLE, { exact: true }).first().click();
  await sleep(800);
  await dlg
    .getByText("Fill automatically", { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"justify-between")][1]//button[@role="switch"]')
    .filter({ visible: true })
    .first()
    .click();
  await sleep(800);
  await dlg
    .getByText("Source", { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"space-y")][1]//button[@role="combobox"]')
    .filter({ visible: true })
    .first()
    .click();
  await page.locator('[role="option"]', { hasText: "From my data" }).click();
  await until("tables read", async () => {
    const t = await dlg.locator('[aria-label="Table"]').first().textContent();
    return t && !/Loading/.test(t) ? t : null;
  }, 90000);
  await dlg.locator('[aria-label="Table"]').first().click();
  await sleep(800);
  await page.keyboard.type(E.VR_TABLE);
  await sleep(800);
  await page.locator('[role="option"]', { hasText: E.VR_TABLE }).first().click();
  const preview = await until("preview", async () =>
    page.evaluate((want) => (document.body.innerText.includes(want) ? true : null), E.VR_EXPECT), 90000);
  pass("the preview shows the other organization's rows", Boolean(preview.v), `preview contains "${E.VR_EXPECT}"`);
  await shot(page, "bound");
  await page.keyboard.press("Escape");
  await sleep(800);
  // Close the modal if Escape only closed the dropdown.
  const close = page.locator('div[role="dialog"] button:has(svg.lucide-x)').first();
  if (await close.isVisible().catch(() => false)) await close.click();
  await sleep(800);

  // Save, then Run from the builder's own composer.
  const save = page.locator('button[title*="Save" i], button[aria-label*="Save" i]').first();
  if (await save.isVisible().catch(() => false)) {
    await save.click();
    await sleep(2500);
  }
  await shot(page, "saved");
  const box = page.getByPlaceholder(/Type your message/i).first();
  await box.click();
  await box.fill(E.VR_QUESTION);
  const count = (want) => page.evaluate((w) => document.body.innerText.split(w).length - 1, want);
  const before = await count(E.VR_EXPECT);
  await page.keyboard.press("Enter");
  const answer = await until("the answer", async () => {
    if ((await count(E.VR_EXPECT)) <= before) return null;
    return page.evaluate((want) => {
      const text = document.body.innerText;
      const at = text.lastIndexOf(want);
      return text.slice(Math.max(0, at - 160), at + 160);
    }, E.VR_EXPECT);
  }, 240000);
  await shot(page, "answered");
  pass("the run's answer quotes a row of the other organization's table", Boolean(answer.v), (answer.v ?? "(no answer quoting it)").replace(/\s+/g, " "));
} catch (err) {
  await shot(page, "error").catch(() => {});
  pass("walk", false, err instanceof Error ? err.message : String(err));
} finally {
  console.log(`POSTs seen: ${[...new Set(seen)].slice(0, 8).join(", ") || "(none)"}`);
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
}
