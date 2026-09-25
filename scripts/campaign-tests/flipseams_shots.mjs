/**
 * LANE FLIP-SEAMS — the organization settings page's Data section, from both seats, headless,
 * read-only (nothing is pressed: the shared preview reads the live database, and no switch is
 * flipped on production by a lane).
 *
 *   FLIP_ORIGIN=http://flip-seams.localhost:3001 FLIP_EMAIL_ADMIN=… FLIP_EMAIL_TEST=… FLIP_PASSWORD=… \
 *   node scripts/campaign-tests/flipseams_shots.mjs
 *
 * Opens /organizations/<admin's Workspace>/settings#data as admin@admin.com (owner) and as
 * test@test.com (member), at 1440 and 390 wide, and records what the section says and which
 * controls it offers. Credentials come from the environment and are never printed.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

import { signIn, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.FLIP_ORIGIN ?? "http://flip-seams.localhost:3001";
const ORG = process.env.FLIP_ORG ?? "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const OUT =
  process.env.FLIP_SHOTS ??
  "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/shots/flip-seams";
const PASSWORD = process.env.FLIP_PASSWORD ?? "";
const seats = { admin: process.env.FLIP_EMAIL_ADMIN ?? "", test: process.env.FLIP_EMAIL_TEST ?? "" };
if (!PASSWORD || !seats.admin || !seats.test) {
  console.error("The seats' sign-in is not in the environment (never printed).");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const result = {};
const browser = await chromium.launch({ headless: true });
try {
  for (const [seat, email] of Object.entries(seats)) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text().slice(0, 300));
      });
      const bad = [];
      page.on("response", (r) => {
        if (r.status() >= 400 && /cutover_seam/.test(r.url())) bad.push(`${r.status()} ${r.url().slice(0, 160)}`);
      });
      const who = await signIn(page, ORIGIN, email, PASSWORD, `${seat} seat`);
      if (who !== email) throw new Error(`${seat}: the app says someone else is signed in`);
      await page.goto(`${ORIGIN}/organizations/${ORG}/settings#data`, { waitUntil: "domcontentloaded", timeout: 240000 });
      // The shared preview hot-reloads other lanes' edits, which can remount the page mid-read;
      // read the settled section, retrying a remount rather than reporting it as the screen.
      let said = null;
      let shot = `${OUT}/data-section-${seat}-${width}.png`;
      for (let attempt = 1; attempt <= 4 && !said; attempt++) {
        try {
          await page.waitForSelector("section#data", { timeout: 180000 });
          await page.waitForFunction(
            () => {
              const t = document.querySelector("section#data")?.textContent ?? "";
              return t.includes("Check again") && !t.includes("Checking each switch");
            },
            null,
            { timeout: 120000 },
          );
          await page.locator("section#data").scrollIntoViewIfNeeded();
          await sleep(800);
          const got = await page.evaluate(() => {
            const s = document.querySelector("section#data");
            return {
              text: (s?.innerText ?? "").replace(/\n{2,}/g, "\n").slice(0, 4000),
              buttons: [...(s?.querySelectorAll("button") ?? [])].map((b) => b.innerText.trim()).filter(Boolean),
            };
          });
          await page.locator("section#data").screenshot({ path: shot });
          if (got.text.includes("Check again")) said = got;
        } catch (err) {
          if (attempt === 4) throw err;
          await sleep(3000);
        }
      }
      let dialog = null;
      if (seat === "admin" && width === 1440 && said.buttons.includes("Switch to the new system")) {
        // Open the confirmation and CANCEL it: the dialog must name what switching does. Nothing is pressed.
        await page.locator("section#data button", { hasText: "Switch to the new system" }).first().click();
        const dlg = page.locator("[role='alertdialog'], [role='dialog']").first();
        await dlg.waitFor({ timeout: 15000 });
        dialog = (await dlg.innerText()).replace(/\n+/g, " ").slice(0, 800);
        await page.screenshot({ path: `${OUT}/data-section-admin-confirm-1440.png` });
        await dlg.locator("button", { hasText: "Cancel" }).click();
        await sleep(500);
      }
      result[`${seat}-${width}`] = { ...said, dialog, consoleErrors: errors, doorResponsesOver400: bad, shot };
      console.log(`${seat} @${width}: buttons=${JSON.stringify(said.buttons)} consoleErrors=${errors.length} door>=400=${bad.length}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/census.json`, JSON.stringify(result, null, 2));
console.log(`wrote ${OUT}/census.json`);
