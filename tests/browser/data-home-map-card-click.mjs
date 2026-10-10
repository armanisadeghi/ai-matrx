// Real-mouse proof that a card on /data?map=1 opens its table, including a press with a small wobble.
// Usage: node tests/browser/data-home-map-card-click.mjs [member|admin]   (needs `pnpm preview:start`).
// Exit 0 = both the straight click and the wobbling click navigated; 1 = one did not.
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const who = process.argv[2] === "admin" ? "" : "--member";
let failed = false;

for (const wobble of [false, true]) {
  const out = execSync(`pnpm dev-login ${who} "/data?map=1"`, { cwd: process.cwd() }).toString();
  const url = out.match(/OPEN\s*:\s*(\S+)/)[1];
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 170000 });
  await page.waitForSelector("[data-table-map-card]", { timeout: 120000 });
  await page.waitForTimeout(2500);
  const before = page.url();
  const box = await page.locator("[data-table-map-card]").first().boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (wobble) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 2, cy + 1, { steps: 2 });
    await page.mouse.up();
  } else {
    await page.mouse.click(cx, cy);
  }
  const moved = await page
    .waitForURL((u) => u.toString() !== before, { timeout: 90000 })
    .then(() => true)
    .catch(() => false);
  console.log(`${wobble ? "wobbling" : "straight"} click: ${moved ? "opened " + page.url() : "DID NOT OPEN"}`);
  if (!moved) failed = true;
  await browser.close();
}
process.exit(failed ? 1 : 0);
