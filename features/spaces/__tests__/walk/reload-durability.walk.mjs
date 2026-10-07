// Every edit survives a reload at any moment (round 26, item 1). On a NEW page as test@test.com:
// type a title + body text, set a cover, then reload after 200 ms / 500 ms / 1 s; the edits must be
// there after the reload, with no "Unsaved changes restored" toast. Exit 1 on any loss.
//   node features/spaces/__tests__/walk/reload-durability.walk.mjs [pageId]
import { open, newPage, act, originOf, trashPage } from "./lib.mjs";

const DELAYS = (process.env.DELAYS ?? "200,500,1000").split(",").map(Number);
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
let id = process.argv[2];
if (id) await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
else id = await newPage(page);
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(Number(process.env.SETTLE ?? 1500));

const read = () => page.evaluate(() => ({
  title: document.querySelector(".spaces-title")?.textContent ?? "",
  body: document.querySelector(".bn-editor")?.textContent ?? "",
  cover: !!document.querySelector(".spaces-cover"),
  toasts: [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent),
}));

let failed = 0;
for (const ms of DELAYS) {
  const tag = `t${ms}x${Math.random().toString(36).slice(2, 6)}`;
  await act(page, async () => {
    const title = page.locator(".spaces-title");
    await title.click();
    await page.keyboard.press("End");
    await page.keyboard.type(` ${tag}`);
    await page.waitForTimeout(150);
    await page.locator(".bn-editor .bn-inline-content").last().click();
    if (process.env.DEBUG) console.log(await page.evaluate(() => document.activeElement?.className));
    await page.keyboard.press("End");
    // No leading space: a space on an empty line opens Ask AI (Notion).
    await page.keyboard.type(`body-${tag} `);
  });
  await page.waitForTimeout(ms);
  const before = await read();
  if (!before.body.includes(`body-${tag}`)) console.log("typed body not in editor before reload:", before.body.slice(-80));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(2500);
  const r = await read();
  const ok = r.title.includes(tag) && r.body.includes(`body-${tag}`);
  const restoredToast = r.toasts.some((t) => /Unsaved changes/i.test(t ?? ""));
  if (!ok || restoredToast) failed++;
  console.log(JSON.stringify({ ms, tag, ok, restoredToast, title: r.title.slice(-60), body: r.body.slice(-60) }));
}
// Cover: Add cover then reload at 300 ms.
if (!process.env.SKIP_COVER) {
  await act(page, async () => {
    await page.locator(".spaces-title").hover();
    await page.getByRole("button", { name: /Add cover/ }).first().click();
    // A gallery opens: pick the first swatch when it does.
    const swatch = page.locator("[data-cover-option]").first();
    if (await swatch.isVisible({ timeout: 1500 }).catch(() => false)) await swatch.click();
  });
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(2500);
  const r = await read();
  if (!r.cover) failed++;
  console.log(JSON.stringify({ cover: r.cover }));
}
// Another device (no device copy): the store itself holds the last edit.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState: await page.context().storageState({ indexedDB: false }) });
  const other = await ctx.newPage();
  await page.waitForTimeout(6000);
  await other.addInitScript(() => { try { for (const k of Object.keys(localStorage)) if (k.startsWith("spaces:unsaved:")) localStorage.removeItem(k); } catch {} });
  await other.goto(page.url(), { waitUntil: "domcontentloaded" });
  await other.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
  await other.waitForTimeout(2500);
  const body = await other.evaluate(() => document.querySelector(".bn-editor")?.textContent ?? "");
  const last = DELAYS.at(-1);
  const stored = body.includes(`body-t${last}x`);
  if (!stored) failed++;
  console.log(JSON.stringify({ otherDeviceHasLastEdit: stored, body: body.slice(-60) }));
  await ctx.close();
}
console.log(JSON.stringify({ id, failed }));
if (process.env.WALK_TRASH) console.log("trashed", await trashPage(page));
await browser.close();
process.exit(failed ? 1 : 0);
