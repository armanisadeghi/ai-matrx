/**
 * INTEG-CLIENTS — the headless seat walk of a table born and appended to OUTSIDE the grid
 * (CUTOVER-PLAN rev 3 rows F1, F2, F3, F4, F6), on a dev server pointed at the dev clone.
 *
 * admin@admin.com, organization admin's Workspace (its tables were moved into the record store):
 *   birth   — a markdown table ("Parts received this week") rendered by MarkdownStream on the
 *             Block Processing page → Save → Save Table. The Quick Data window opens on the new
 *             table (F2/F3: the located viewer).
 *   append  — two deliveries rendered the same way → Save → "Save to an existing table instead" →
 *             the picker lists the MOVED "Rincon Plumbing — Parts on order" once (F1) → Append rows.
 * test@test.com, same organization:
 *   picker  — Quick Data lists the record-store tables this person may open.
 *
 * Signs in through the login form (seat-browser.mjs), never a cookie or a nonce. Prints what the
 * screen said; the database half of the proof (born in the store, rows in the store, older copy
 * untouched) is read by the caller against the clone. Screenshots go to OUT.
 *
 *   ORIGIN=http://integclients.localhost:3059 OUT=<dir> \
 *   AI_ADMIN_USERNAME=… AI_ADMIN_PASSWORD=… TEST_SEAT_EMAIL=… TEST_SEAT_PASSWORD=… \
 *   WALK_STAMP=<short label> node scripts/integ-clients-walk.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { signIn, setOrganization, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://integclients.localhost:3059";
const OUT = process.env.OUT;
const STAMP = process.env.WALK_STAMP ?? new Date().toISOString().slice(11, 16).replace(":", "");
const ORG = "admin's Workspace";
const PARTS_ON_ORDER = "Rincon Plumbing — Parts on order";
if (!OUT) throw new Error("OUT is required");
mkdirSync(OUT, { recursive: true });

const results = [];
const pass = (clause, ok, said) => {
  results.push({ clause, ok, said });
  console.log(`${ok ? "PASS" : "FAIL"} ${clause} — ${said}`);
};

async function renderMarkdown(page, md, marker) {
  await page.goto(`${ORIGIN}/demos/api-tests/block-processing`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const ta = page.locator("textarea").first();
  await ta.waitFor({ timeout: 120000 });
  await sleep(2500);
  await closeWindows(page);
  // Hydration resets the box to its sample text, so a fill is only trusted once the RENDERED
  // table shows this walk's own marker (a fill that lands before React attaches is thrown away).
  const shown = await until(
    `the rendered table shows "${marker}"`,
    async () => {
      if ((await ta.inputValue()) !== md) await ta.fill(md);
      await page.getByText("Direct Render", { exact: true }).click();
      await sleep(1500);
      return page.evaluate((m) => {
        const out = Array.from(document.querySelectorAll("table")).some((t) => (t.textContent ?? "").includes(m));
        return out;
      }, marker);
    },
    120000,
  );
  if (!shown.v) throw new Error(`the Block Processing page never rendered the walk's table ("${marker}")`);
  await page.getByRole("button", { name: "Save", exact: true }).first().waitFor({ timeout: 60000 });
}

async function closeWindows(page) {
  for (let i = 0; i < 4; i += 1) {
    const close = page.locator("button[aria-label='Close']").first();
    if (!(await close.isVisible().catch(() => false))) return;
    await close.click().catch(() => {});
    await sleep(600);
  }
}

/** Open the "Save to an existing table instead" section and wait for its picker, or say why not. */
async function openExistingPicker(page, label) {
  await page.getByText("Save to an existing table instead").click();
  try {
    await page.locator("#target-table").waitFor({ timeout: 120000 });
  } catch {
    await page.screenshot({ path: `${OUT}/${label}-picker-did-not-open.png` });
    const said = await page.evaluate(() => {
      const d = document.querySelector("[role='dialog']");
      return (d?.textContent ?? "").replace(/\s+/g, " ").slice(0, 600);
    });
    throw new Error(`the target-table picker never appeared; the dialog said: ${said}`);
  }
  await page.locator("#target-table").click();
}

async function toastText(page) {
  const { v } = await until(
    "a toast",
    async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-sonner-toast], [data-sonner-toaster] li, [role='status']"))
          .map((t) => (t.textContent ?? "").trim())
          .find((t) => t.length > 0) ?? null,
      ),
    90000,
  );
  return v ?? "";
}

const browser = await chromium.launch({ headless: true });
try {
  // ── admin seat ────────────────────────────────────────────────────────────
  const admin = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  admin.on("pageerror", (e) => console.log(`PAGEERROR ${String(e.message).slice(0, 300)}`));
  const who = await signIn(admin, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD, "admin");
  pass("admin-signed-in", who === "admin@admin.com", who);
  await setOrganization(admin, ORG);

  // BIRTH
  if (process.env.SKIP_BIRTH !== "1") {
  const bornName = `Rincon Plumbing — Parts received (walk ${STAMP})`;
  await renderMarkdown(
    admin,
    "Parts received this week:\n\n| Part | Supplier | Qty | For job |\n|---|---|---|---|\n" +
      "| 3/4 in copper sweat elbow (25-pack) | Ferguson Ventura | 4 | Ojai repipe |\n" +
      "| Moen 1222 cartridge | Ewing Oxnard | 6 | Stock |\n" +
      "| Uponor 1/2 in ProPEX ring (100) | Ferguson Ventura | 2 | Ojai repipe |\n",
    "Uponor 1/2 in ProPEX ring (100)",
  );
  await admin.screenshot({ path: `${OUT}/01-admin-chat-table-before-save.png` });
  await admin.getByRole("button", { name: "Save", exact: true }).first().click();
  await admin.locator("#table-name").waitFor({ timeout: 30000 });
  await admin.fill("#table-name", bornName);
  await admin.fill("#table-description", "Deliveries from suppliers this week, from the dispatcher's chat.");
  await admin.screenshot({ path: `${OUT}/02-admin-save-as-new-table.png` });
  await admin.getByRole("button", { name: "Save Table" }).click();
  const bornToast = await toastText(admin);
  pass("birth-saved", /saved/i.test(bornToast) && !/not saved|error/i.test(bornToast), bornToast);
  const opened = await until(
    "the Quick Data window on the new table",
    async () => admin.evaluate((name) => document.body.innerText.includes(name), bornName),
    60000,
  );
  await sleep(4000);
  await admin.screenshot({ path: `${OUT}/03-admin-new-table-opens-in-quick-data.png` });
  // Inside the Quick Data window only (the page behind it shows the same words in its markdown):
  // the window's table picker names the new table with its row count.
  const rowsShown = await admin.evaluate((name) => {
    const trigger = Array.from(document.querySelectorAll("button[role='combobox']")).find((b) =>
      (b.textContent ?? "").includes(name.slice(0, 18)),
    );
    return /\b3 rows\b/.test(trigger?.textContent ?? "");
  }, bornName);
  pass("birth-opens-with-its-rows", Boolean(opened.v) && rowsShown, opened.v ? "Quick Data shows the new table and its rows" : "the new table did not open");
  console.log(`BORN_NAME=${bornName}`);
  // Close the Quick Data window (it persists across navigation and carries its own Save buttons).
  await closeWindows(admin);
  }

  // APPEND into the moved table
  await renderMarkdown(
    admin,
    "Two more deliveries:\n\n| Part | Supplier | Qty |\n|---|---|---|\n" +
      "| Navien NPE-240A2 tankless heater | Ferguson Ventura | 1 |\n" +
      `| Charlotte 4 in PVC cleanout (walk ${STAMP}) | Ewing Oxnard | 3 |\n`,
    `Charlotte 4 in PVC cleanout (walk ${STAMP})`,
  );
  await admin.screenshot({ path: `${OUT}/04a-admin-deliveries-rendered.png` });
  await admin.getByRole("button", { name: "Save", exact: true }).first().click();
  await sleep(2000);
  await admin.screenshot({ path: `${OUT}/04b-admin-save-dialog.png` });
  await openExistingPicker(admin, "04x-admin");
  const options = await until(
    "the table picker",
    async () => {
      const list = await admin.evaluate(() => Array.from(document.querySelectorAll("[role='option']")).map((o) => (o.textContent ?? "").trim()));
      return list.length > 0 ? list : null;
    },
    60000,
  );
  const partsOptions = (options.v ?? []).filter((t) => t.includes(PARTS_ON_ORDER));
  await admin.screenshot({ path: `${OUT}/04-admin-picker-lists-the-moved-table.png` });
  pass("picker-lists-moved-table-once", partsOptions.length === 1, `${partsOptions.length} option(s): ${partsOptions.join(" | ")}`);
  await admin.getByRole("option").filter({ hasText: PARTS_ON_ORDER }).first().click();
  await admin.getByRole("button", { name: "Append rows" }).waitFor({ timeout: 60000 });
  await sleep(1500);
  await admin.screenshot({ path: `${OUT}/05-admin-append-columns-matched.png` });
  await admin.getByRole("button", { name: "Append rows" }).click();
  const appendToast = await toastText(admin);
  pass("append-saved", /appended/i.test(appendToast) && !/fail|error/i.test(appendToast), appendToast);
  await sleep(4000);
  await admin.screenshot({ path: `${OUT}/06-admin-after-append.png` });

  // ── test seat: the same organization's picker ─────────────────────────────
  const test = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const whoTest = await signIn(test, ORIGIN, process.env.TEST_SEAT_EMAIL, process.env.TEST_SEAT_PASSWORD, "test");
  pass("test-signed-in", whoTest === "test@test.com", whoTest);
  await setOrganization(test, ORG);
  await renderMarkdown(test, "| Part | Qty |\n|---|---|\n| Moen 1222 cartridge (test seat) | 1 |\n", "Moen 1222 cartridge (test seat)");
  await test.getByRole("button", { name: "Save", exact: true }).first().click();
  await openExistingPicker(test, "07x-test");
  const testOptions = await until(
    "test's table picker",
    async () => {
      const list = await test.evaluate(() => Array.from(document.querySelectorAll("[role='option']")).map((o) => (o.textContent ?? "").trim()));
      return list.length > 0 ? list : null;
    },
    60000,
  );
  await test.screenshot({ path: `${OUT}/07-test-seat-picker.png` });
  console.log(`TEST_PICKER=${JSON.stringify(testOptions.v ?? [])}`);
  pass("test-picker-lists-store-tables", (testOptions.v ?? []).length > 0, `${(testOptions.v ?? []).length} table(s) offered`);
  await test.keyboard.press("Escape");
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} clauses passed`);
process.exit(failed.length ? 1 : 0);
