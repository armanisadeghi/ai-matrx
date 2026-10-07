// Round 27 item 9 / N-19: a Spaces page load logs no `[tap-target]` console error, and an embedded table
// draws no magnifier of its own (the block's toolbar holds it). Reads the admin's sample (READ ONLY: no
// click, no key) and test@test.com's copy. Exit 1 on any `[tap-target]` line or a grid magnifier.
//   node features/spaces/__tests__/walk/no-tap-target-errors.walk.mjs
import { open, originOf, SAMPLE_PAGES } from "./lib.mjs";

let failed = 0;
for (const [sample, member] of [[SAMPLE_PAGES[0], false], [SAMPLE_PAGES[1], true]]) {
  const { browser, page } = await open({ next: `/spaces/${sample}`, member, width: 1440, height: 1000 });
  const lines = [];
  page.on("console", (m) => {
    if (m.text().includes("[tap-target]")) lines.push(m.text().slice(0, 200));
  });
  await page.goto(`${originOf(page)}/spaces/${sample}`, { waitUntil: "domcontentloaded" });
  await page.locator(".spaces-db-frame").first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(12_000);
  const r = await page.evaluate(() => ({
    tables: document.querySelectorAll(".spaces-db-frame").length,
    gridMagnifiers: document.querySelectorAll(".spaces-db-frame .matrx-tap-search, .spaces-db-frame [data-records-entity-search]").length,
    blockMagnifiers: document.querySelectorAll('.spaces-db-frame button[aria-label="Search"]').length,
  }));
  if (lines.length || r.gridMagnifiers) failed++;
  console.log(JSON.stringify({ sample, member, ...r, tapTargetLines: lines }));
  await browser.close();
}
process.exit(failed ? 1 : 0);
