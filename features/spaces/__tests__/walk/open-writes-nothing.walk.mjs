// Opening a page never writes a version (needs job 5, 2026-10-07). Opens the admin's sample (READ ONLY:
// no click, no key) at three window widths it has never been painted at, waits past the size hold and
// the save cadence each time, and prints what the page says its version is. The owner compares
// content.document.content_version before and after (it must not move).
//   node features/spaces/__tests__/walk/open-writes-nothing.walk.mjs [w1,w2,w3]
import { open, originOf, SAMPLE_PAGES } from "./lib.mjs";

const WIDTHS = (process.argv[2] ?? "1123,1347,1571").split(",").map(Number);
const sample = SAMPLE_PAGES[0];
const writes = [];
for (const width of WIDTHS) {
  const { browser, page } = await open({ next: `/spaces/${sample}`, width, height: 1000 });
  page.on("request", (r) => {
    if (r.method() !== "GET" && /rpc\/space_save\b|space_payload/.test(r.url())) writes.push({ width, url: r.url().replace(/\?.*/, "") });
  });
  if (!page.url().includes(sample)) await page.goto(`${originOf(page)}/spaces/${sample}`, { waitUntil: "domcontentloaded" });
  await page.locator(".bn-editor").first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(15_000);
  console.log(JSON.stringify({ width, dbBlocks: await page.locator(".spaces-db-host, [data-block-id]").count() }));
  await browser.close();
}
console.log(JSON.stringify({ writes }));
process.exit(writes.length ? 1 : 0);
