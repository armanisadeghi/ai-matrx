// Data-doctrine crew E2 — try the CSV import wizard on a live unified-store
// table through the real /data-v2 screen (headless Playwright), and log
// exactly what happens (works / partly / absent).
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const HOST = "crewe2.localhost";
const ORIGIN = `http://${HOST}:3001`;
const OUT = resolve(ROOT, "../common-docs-shots-tmp");
mkdirSync(OUT, { recursive: true });

const [, , tableId, orgName, csvPath, shotName] = process.argv;
if (!tableId || !orgName || !csvPath || !shotName) {
  console.error("Usage: node csv-import-entry.mjs <tableId> <orgName> <csvPath> <shotName>");
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(`/data-v2/${tableId}`)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(2500);
  await page.evaluate((name) => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes(name));
    btn?.click();
  }, orgName);
  await page.waitForTimeout(2500);
  await page.waitForSelector("table tbody tr", { timeout: 20000 }).catch(() => {});

  const importBtn = page.locator('button:has-text("Import"):visible').first();
  if (!(await importBtn.count())) {
    console.error("[csv-import] LIMITATION: no 'Import' control on this table's toolbar at all");
    await page.screenshot({ path: resolve(OUT, `${shotName}-no-import-button.png`), fullPage: true });
    await browser.close();
    return;
  }
  await importBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, `${shotName}-dialog.png`), fullPage: true });

  const fileInput = page.locator('input[type="file"]').first();
  if (!(await fileInput.count())) {
    console.error("[csv-import] LIMITATION: Import dialog opened but has no file-upload input");
    await browser.close();
    return;
  }
  await fileInput.setInputFiles(csvPath);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(OUT, `${shotName}-after-upload.png`), fullPage: true });

  // Look for a mapping/preview step and a confirm/import button.
  const confirmBtn = page.locator('button:has-text("Import"), button:has-text("Confirm"), button:has-text("Finish"), button:has-text("Continue")').last();
  if (await confirmBtn.count()) {
    await confirmBtn.click().catch((e) => console.error("[csv-import] LIMITATION: could not click the final import/confirm control:", e.message));
    await page.waitForTimeout(3000);
  } else {
    console.error("[csv-import] LIMITATION: no confirm/finish control found after file upload");
  }
  await page.screenshot({ path: resolve(OUT, `${shotName}-final.png`), fullPage: true });

  await browser.close();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
