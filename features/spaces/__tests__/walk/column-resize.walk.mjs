// Column resize by hand (round 28, item 3): on a scratch page, make a 2-column split, drag the divider
// from 50/50 to about 30/70, reload, and confirm the widths stuck. Also reports whether hovering the
// gutter shows the bar. The scratch page goes to Trash at the end. Exit 1 on failure.
//   MEMBER=1 SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/column-resize.walk.mjs
import { open, newPage, act, slash, trashPage, originOf, chooseOrgIfAsked } from "./lib.mjs";

const { browser, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
const id = await newPage(page);
await chooseOrgIfAsked(page).catch(() => {});
const cols = () => page.locator(".spaces-editor .bn-block-outer:has(> .bn-block > .react-renderer > .bn-block-content[data-content-type=column])");
const widths = () => cols().evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
let ok = false;
try {
  await act(page, async () => {
    await page.locator(".spaces-title").click();
    await page.keyboard.type("Column resize probe", { delay: 20 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await slash(page, "2 columns");
    await page.waitForTimeout(1200);
    await cols().nth(0).locator(".bn-inline-content").first().click();
    await page.keyboard.type("Left", { delay: 20 });
    await cols().nth(1).locator(".bn-inline-content").first().click();
    await page.keyboard.type("Right", { delay: 20 });
    await page.waitForTimeout(1500);
  });
  const before = await widths();
  const handle = page.locator(".spaces-column-resizer").first();
  await cols().nth(0).hover();
  await page.waitForTimeout(300);
  const bar = await handle.evaluate((h) => getComputedStyle(h, "::after").backgroundColor);
  const box = await handle.boundingBox();
  const total = before[0] + before[1];
  await act(page, async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.waitForTimeout(150);
    const barHover = await handle.evaluate((h) => `${getComputedStyle(h, "::after").backgroundColor} ${getComputedStyle(h, "::after").width}`);
    console.log(JSON.stringify({ step: "hover", columnHoverBar: bar, gutterHoverBar: barHover, handle: box && [Math.round(box.x), Math.round(box.width)] }));
    await page.mouse.down();
    const dx = -(total * 0.2);
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + box.width / 2 + (dx * i) / 10, box.y + 20);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
  });
  await page.waitForTimeout(500);
  const after = await widths();
  // Wait for the host save, then reload.
  await page.waitForTimeout(5000);
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
  await cols().first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4000);
  const reloaded = await widths();
  const share = (w) => +(w[0] / (w[0] + w[1])).toFixed(3);
  ok = Math.abs(share(after) - 0.3) < 0.05 && Math.abs(share(reloaded) - share(after)) < 0.01;
  console.log(JSON.stringify({ page: id, before, after, reloaded, leftShareAfter: share(after), leftShareReloaded: share(reloaded), ok }));
} finally {
  await trashPage(page).then((t) => console.log(JSON.stringify({ trashed: t })));
  await browser.close();
}
process.exit(ok ? 0 : 1);
