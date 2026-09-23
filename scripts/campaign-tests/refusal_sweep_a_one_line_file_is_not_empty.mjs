/**
 * REFUSAL-SWEEP / VERIFIER-16 M9 — the older create-a-table import on /data reads a
 * one-line file as the line it is, never "CSV file is empty".
 *
 *   node scripts/campaign-tests/refusal_sweep_a_one_line_file_is_not_empty.mjs [origin]
 *
 * THE USE CASE. Rincon Plumbing & Drain's office manager starts a Customers table from the
 * old spreadsheet: once from a file that is only the one customer she typed (no header), and
 * once from a header plus that customer. Signed in as admin@admin.com through /login.
 * Headless only, on this lane's port. It stops at the preview — nothing is created.
 */
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { signIn } from "../lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "../..");
const ORIGIN = process.argv[2] ?? "http://127.0.0.1:3057";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => /^AI_ADMIN_(USERNAME|PASSWORD)=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
const dir = mkdtempSync(join(tmpdir(), "rincon-"));
const FILES = {
  "one-customer.csv": "Takeda Property Management,805-555-0142,2210 Ocean View Dr\n",
  "customers-header-and-one.csv": "Customer,Phone,Address\nTakeda Property Management,805-555-0142,2210 Ocean View Dr\n",
};
for (const [n, t] of Object.entries(FILES)) writeFileSync(join(dir, n), t);

const results = [];
const check = (name, ok, saw = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${saw ? ` — ${saw}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME || "admin@admin.com", env.AI_ADMIN_PASSWORD);
  check("seat is admin@admin.com", String(who).includes("admin@admin.com"), String(who));

  for (const [name, expect] of [
    ["one-customer.csv", { says: "Every row is imported, 1 in all", header: false, shot: "refusal-oneline-no-header.png" }],
    ["customers-header-and-one.csv", { says: "the 1 row below it are imported", header: true, shot: "refusal-oneline-header-plus-one.png" }],
  ]) {
    await page.goto(`${ORIGIN}/data`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.getByText("Import/Paste", { exact: true }).first().click({ timeout: 120000 });
    await page.locator('input[type="file"]').first().setInputFiles(join(dir, name));
    const says = page.locator("[data-matrx-import-first-row-says]");
    await says.waitFor({ timeout: 60000 }).catch(() => {});
    const body = await page.locator('[role="dialog"]').innerText().catch(() => "");
    check(`${name}: not called empty`, !/is empty|No valid data/i.test(body));
    const text = (await says.count()) ? await says.innerText() : "(no first-row line)";
    check(`${name}: reads the line as it is`, text.includes(expect.says), text);
    const toggled = await page.locator("#firstRowIsHeader").getAttribute("aria-checked").catch(() => null);
    check(`${name}: the guess is shown, switch ${expect.header ? "on" : "off"}`, toggled === String(expect.header), `aria-checked=${toggled}`);
    check(`${name}: the customer is in the preview`, body.includes("Takeda Property Management"));
    check(`${name}: the button says one row`, body.includes("Import 1 row"));
    await page.screenshot({ path: join(OUT, expect.shot) });
  }
  check("0 page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} green`);
process.exit(passed === results.length ? 0 : 1);
