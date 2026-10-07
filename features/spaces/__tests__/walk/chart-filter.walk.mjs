// Walk: a chart tile counts what its view's filter keeps. Opens a page (argv[2]), finds the chart tile
// named argv[3] (e.g. "ACTIVE CLIENTS"), sets "<field> is <value>" (argv[4], argv[5]) from the tile's
// Filter and saves it for everyone, then reads the ring's middle number before and after.
//   node features/spaces/__tests__/walk/chart-filter.walk.mjs <spaceId> "ACTIVE CLIENTS" Status Active [shot.png]
import { act, open } from "./lib.mjs";

const [id, tile, field, value, out] = process.argv.slice(2);
const { browser, page } = await open({ next: `/spaces/${id}`, width: 1600, height: 1100 });
for (let i = 0; i < 40 && !(await page.locator(".bn-editor").first().isVisible().catch(() => false)); i++) {
  const r = page.getByRole("button", { name: /Resume/ });
  if (await r.isVisible().catch(() => false)) await r.click().catch(() => {});
  await page.waitForTimeout(5000);
}
await page.waitForTimeout(6000);
const frame = page.locator(".spaces-db-frame", { has: page.locator(".spaces-chart-title", { hasText: tile }) }).first();
const ring = () => frame.locator(".spaces-chart-center").textContent();
const before = await ring();
await act(page, async () => {
  await frame.hover();
  await frame.getByRole("button", { name: "Filter" }).click();
  await page.locator("[data-radix-popper-content-wrapper]").getByText(field, { exact: true }).click();
  // A choice column lists its options; any other column takes the typed value.
  const typed = page.getByLabel("Filter value");
  if (await typed.isVisible().catch(() => false)) {
    await typed.fill(value);
    await typed.press("Enter");
  } else await page.locator("[data-radix-popper-content-wrapper]").getByText(value, { exact: true }).click();
  await page.getByRole("button", { name: "Save for everyone" }).click();
});
await page.keyboard.press("Escape");
await page.waitForTimeout(4000);
const after = await ring();
console.log(JSON.stringify({ tile, before, after }));
if (out) await frame.screenshot({ path: out });
await browser.close();
