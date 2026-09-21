// Data-doctrine crew E2 — enter one table's data through the real /data-v2 app
// screens (headless Playwright), against the shared dev server on :3001, using
// this session's own hostname so we don't evict another agent's cookie jar.
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const HOST = "crewe2.localhost";
const PORT = 3001;
const ORIGIN = `http://${HOST}:${PORT}`;
const OUT = resolve(ROOT, "../common-docs-shots-tmp");
mkdirSync(OUT, { recursive: true });

const [, , tableId, mode, shotName, orgName] = process.argv;
if (!tableId) {
  console.error("Usage: node screens-entry.mjs <tableId> <mode: view|add-row> <shotName> [orgNameToSelect]");
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
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  console.log(`[screens-entry] signed in as ${who?.email}`);
  if (who?.email !== "admin@admin.com") throw new Error(`wrong identity: ${JSON.stringify(who)}`);

  await page.waitForTimeout(2500);

  if (orgName) {
    // The org card list is a scrollable <ul class="max-h-72 overflow-y-auto">
    // (max-h-72 clips it to 288px while scrollHeight can be ~3000px for a
    // real admin membership list) — the target org's button is laid out
    // below the fold of that inner scroll container, so Playwright's own
    // actionability check reports it "not visible" even though
    // scrollIntoViewIfNeeded() runs without error. Do the scroll + click by
    // hand via evaluate, which respects the ancestor's own overflow clip.
    const clicked = await page.evaluate((name) => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes(name));
      if (!btn) return "not-found";
      btn.scrollIntoView({ block: "center" });
      btn.click();
      return "clicked";
    }, orgName);
    console.log(`[screens-entry] org picker result: ${clicked}`);
    if (clicked !== "clicked") {
      console.error(`[screens-entry] LIMITATION: organization "${orgName}" not clickable via evaluate() either (${clicked})`);
    }
    await page.waitForTimeout(2500);
  }

  await page.waitForSelector("table tbody tr, [role='row']", { timeout: 30000 }).catch((e) => console.error("no grid rows found:", e.message));

  const shot = resolve(OUT, `${shotName}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`[screens-entry] screenshot: ${shot}`);

  if (mode === "add-row") {
    // Try to find an "Add row" affordance — a plus/new-row control at the
    // bottom of the grid, or a toolbar "New" button. Log what we find either way.
    const candidates = [
      'button:has-text("New")',
      'button:has-text("Add row")',
      '[aria-label="Add row"]',
      'button:has-text("+")',
    ];
    let clicked = false;
    for (const sel of candidates) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        try {
          await el.click({ timeout: 5000 });
          clicked = true;
          console.log(`[screens-entry] clicked add-row control: ${sel}`);
          break;
        } catch (e) {
          console.error(`[screens-entry] found but could not click ${sel}: ${e.message}`);
        }
      }
    }
    if (!clicked) console.error("[screens-entry] LIMITATION: no add-row control matched any known selector");
    await page.waitForTimeout(2000);

    // Log the platform's own error banner if the "New record" click surfaced one.
    const errBanner = page.locator('text=/already exists|refused|error/i').first();
    if (await errBanner.count()) {
      const txt = await errBanner.locator("..").innerText().catch(() => errBanner.innerText());
      console.error(`[screens-entry] LIMITATION: platform showed an error after New record: ${JSON.stringify(txt).slice(0, 300)}`);
    }

    // Click the title-field cell of the newest row (first data row under the
    // header, first column), then type into the input it reveals.
    const firstDataRow = page.locator("table tbody tr, [role='row']").nth(1);
    const firstCell = firstDataRow.locator("td, [role='cell']").first();
    if (await firstCell.count()) {
      await firstCell.click().catch(() => {});
      await page.waitForTimeout(300);
      const cellInput = page.locator("input").first();
      if (await cellInput.count()) {
        await cellInput.fill(process.env.SCREEN_ENTRY_VALUE || "New Screen-Entered Row").catch(() => {});
        await page.keyboard.press("Enter").catch(() => {});
        await page.waitForTimeout(1500);
      } else {
        console.error("[screens-entry] LIMITATION: clicking the new row's title cell did not reveal an editable input");
      }
    }

    await page.screenshot({ path: resolve(OUT, `${shotName}-after-add.png`), fullPage: true });
  }

  await browser.close();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
