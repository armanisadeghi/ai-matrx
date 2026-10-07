// Chart tiles in narrow columns (round 26, item 5 + tile names): per chart frame — width, height, the
// name's shown width vs its full width, and whether at least its first word shows. Read-only.
//   node features/spaces/__tests__/walk/chart-tiles.walk.mjs <pageId> [width...]
import { open, originOf } from "./lib.mjs";

const id = process.argv[2];
const widths = (process.argv.slice(3).length ? process.argv.slice(3) : ["1280", "1440"]).map(Number);
const { browser, page } = await open({ member: !process.env.ADMIN, width: widths[0], height: 1000 });
let failed = 0;
for (const w of widths) {
  await page.setViewportSize({ width: w, height: 1000 });
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
  await page.locator('.spaces-db-frame[data-layout="chart"]').first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(5000);
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}-${w}.png` });
  const tiles = await page.evaluate(() =>
    [...document.querySelectorAll('.spaces-db-frame[data-layout="chart"]')].map((f) => {
      const r = f.getBoundingClientRect();
      const col = f.closest(".bn-block-column, [data-content-type=column]")?.getBoundingClientRect();
      const span = f.querySelector(".spaces-chart-title > span");
      const name = span?.textContent ?? "";
      // How much of the name shows: measure the text that fits in the span's box.
      let shown = name;
      if (span && span.scrollWidth > span.clientWidth) {
        const range = document.createRange();
        const node = span.firstChild;
        let fit = 0;
        for (let i = 1; node && i <= name.length; i++) {
          range.setStart(node, 0);
          range.setEnd(node, i);
          if (range.getBoundingClientRect().width > span.clientWidth - 8) break;
          fit = i;
        }
        shown = name.slice(0, fit);
      }
      const firstWord = name.split(/\s+/)[0];
      return { name, shown, firstWordShows: shown.length >= Math.min(firstWord.length, name.length), w: Math.round(r.width), h: Math.round(r.height), col: col ? Math.round(col.width) : null };
    }),
  );
  for (const t of tiles) if (!t.firstWordShows) failed++;
  console.log(JSON.stringify({ viewport: w, tiles }));
}
console.log(JSON.stringify({ id, failed }));
await browser.close();
process.exit(failed ? 1 : 0);
