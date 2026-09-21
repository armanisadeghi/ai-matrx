// Data crew C, path 1 (IMPORT WIZARD): open the National Parks table's own
// page in /data-v2 as admin@admin.com (headless Playwright, dev-login on the
// shared machine-wide dev server, this crew's own *.localhost host) and try
// the Import action with the CSV exactly as scraped/downloaded.
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const HOST = "realdata-c.localhost";
const ORIGIN = `http://${HOST}:3001`;
const { tableId } = JSON.parse(readFileSync(resolve(ROOT, "scripts/campaign-tests/parks-table-crew-c.json"), "utf8"));
const CSV_PATH = "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/us-national-parks-as-downloaded.csv";
const OUT_DIR = resolve(ROOT, "scripts/campaign-tests");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const findings = [];

  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(`/data-v2/${tableId}`)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  console.log("signed in as", who?.email ?? who);

  await page.waitForTimeout(3000);

  // The session may land with no active organization selected (a real,
  // expected first-run state) — pick "Trailhead & Torch Journeys" from the
  // org list the empty-state page itself offers, exactly as a person would.
  // The list can run past what is on screen, so scroll it into view first.
  const orgPicker = page.getByRole("option", { name: /Trailhead & Torch Journeys/i }).first();
  const found = await orgPicker.count();
  console.log(`org picker match count: ${found}`);
  if (found) {
    await orgPicker.scrollIntoViewIfNeeded({ timeout: 5000 }).catch((e) => console.log("scrollIntoView failed:", String(e)));
    await page.waitForTimeout(300);
    await orgPicker.click({ timeout: 5000, force: true }).catch((e) => console.log("click failed:", String(e)));
    await page.waitForTimeout(2500);
    console.log("clicked. url now:", page.url());
    // Re-navigate to the table page now that an org is active.
    await page.goto(`${ORIGIN}/data-v2/${tableId}`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }

  await page.screenshot({ path: resolve(OUT_DIR, "parks-1-table-page.png"), fullPage: true }).catch(() => {});
  console.log("url:", page.url());
  console.log("title:", await page.title());

  // Look for anything labelled "Import" on the table page.
  const importCandidates = await page.locator("text=/^Import$/i").all();
  console.log(`found ${importCandidates.length} "Import" text matches`);
  if (importCandidates.length === 0) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    findings.push({
      when: new Date().toISOString(), crew: "C", use_case: "US National Parks itineraries",
      doing: `open /data-v2/${tableId} looking for an Import action`,
      said: "no element with the exact text \"Import\" is present on the table page",
      expected: "an Import action reachable from the table page, per the coordinator's stated path (/data-v2/<tableId> -> Import)",
      page_url: page.url(), page_title: await page.title(),
      body_excerpt: bodyText.slice(0, 1500),
    });
  } else {
    await importCandidates[0].click({ timeout: 5000 }).catch((e) => {
      findings.push({
        when: new Date().toISOString(), crew: "C", use_case: "US National Parks itineraries",
        doing: "click the Import action", said: String(e), expected: "the import dialog to open",
      });
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(OUT_DIR, "parks-2-after-import-click.png"), fullPage: true }).catch(() => {});

    const fileInput = page.locator('input[type="file"]');
    const fileInputCount = await fileInput.count();
    console.log(`file inputs present: ${fileInputCount}`);
    if (fileInputCount === 0) {
      findings.push({
        when: new Date().toISOString(), crew: "C", use_case: "US National Parks itineraries",
        doing: "look for a file-upload input after clicking Import",
        said: "Import was clickable but no <input type=file> appeared on the page",
        expected: "a file picker to upload the CSV",
      });
    } else {
      await fileInput.first().setInputFiles(CSV_PATH);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: resolve(OUT_DIR, "parks-3-after-csv-upload.png"), fullPage: true }).catch(() => {});
      const bodyText = await page.locator("body").innerText().catch(() => "");
      findings.push({
        when: new Date().toISOString(), crew: "C", use_case: "US National Parks itineraries",
        doing: "upload us-national-parks-as-downloaded.csv (messy: month-name dates, acres+km2+footnote in one Area cell, thousands separators) into the import wizard, against a table declared with zero real columns",
        said: "see screenshot parks-3-after-csv-upload.png and body excerpt",
        expected: "the mapper's column/type inference and a preview of the parsed rows",
        body_excerpt: bodyText.slice(0, 3000),
      });

      // The wizard mapped all 4 CSV columns to "no field" (the target table has
      // zero declared columns) yet still offers "Write 51 rows" — click it to
      // see the real, honest outcome rather than guessing from the UI text.
      const writeBtn = page.getByRole("button", { name: /Write \d+ rows/i }).first();
      if (await writeBtn.count()) {
        await writeBtn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(4000);
        await page.screenshot({ path: resolve(OUT_DIR, "parks-4-after-write-click.png"), fullPage: true }).catch(() => {});
        const afterWriteText = await page.locator("body").innerText().catch(() => "");
        findings.push({
          when: new Date().toISOString(), crew: "C", use_case: "US National Parks itineraries",
          doing: "click \"Write 51 rows\" when all 4 CSV columns mapped to \"no field\"",
          said: afterWriteText.slice(0, 2500),
          expected: "either a refusal naming that no columns exist to receive data, or the columns to be offered as new fields to create — not a silent write of 51 empty rows",
        });
      }
    }
  }

  writeFileSync(resolve(OUT_DIR, "import-findings-crew-c.json"), JSON.stringify(findings, null, 2));
  console.log(`wrote ${findings.length} findings to import-findings-crew-c.json`);
  await browser.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
