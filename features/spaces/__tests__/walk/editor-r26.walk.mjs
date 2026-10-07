// Round 26 editor checks on a scratch page (test@test.com): D4/D5 "/" after a block-menu colour change,
// "/Page" stays on the page, D6 block menu on a divider, D10 every Notion markdown shortcut.
// Prints one JSON line per check; exit 1 when any fails.
//   SPACES_WALK_ORG="Oak & River" node features/spaces/__tests__/walk/editor-r26.walk.mjs [pageId]
import { open, newPage, act, setBlockColor, lastBlock, originOf } from "./lib.mjs";

const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
let id = process.argv[2];
if (id) await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
else id = await newPage(page);
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);
const menuOpen = () => page.locator(".bn-suggestion-menu").isVisible().catch(() => false);
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const only = (process.env.ONLY ?? "pickers,slash,page,divider,markdown").split(",");
const endLine = async () => {
  await page.locator(".bn-editor .bn-inline-content").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
};

await act(page, async () => {
  if (only.includes("pickers")) {
    // D1: "Add icon" opens the picker and sets nothing until a pick; search finds an icon; Remove clears it.
    const iconNow = () => page.locator(".spaces-page-icon").count();
    await page.locator(".spaces-title").hover();
    await page.getByRole("button", { name: /^Add icon$/ }).click();
    await page.waitForTimeout(400);
    const pickerOpen = await page.getByRole("tab", { name: "Icons" }).isVisible().catch(() => false);
    const setOnOpen = await iconNow();
    await page.getByPlaceholder("Filter…").fill("rocket");
    await page.getByRole("button", { name: /^rocket$/ }).first().click();
    await page.waitForTimeout(400);
    check("Add icon opens the picker, sets only the pick", pickerOpen && setOnOpen === 0 && (await iconNow()) === 1, { pickerOpen, setOnOpen });
    // D2: "Add cover" opens the gallery; a pick sets it; Change cover offers Remove.
    await page.locator(".spaces-title").hover();
    await page.getByRole("button", { name: /^Add cover$/ }).click();
    await page.waitForTimeout(400);
    const options = await page.locator("[data-cover-option]").count();
    const coverOnOpen = await page.locator(".spaces-cover").count();
    await page.locator("[data-cover-option]").first().click();
    await page.waitForTimeout(400);
    check("Add cover opens the gallery, sets only the pick", options >= 8 && coverOnOpen === 0 && (await page.locator(".spaces-cover").count()) === 1, { options, coverOnOpen });
  }
  if (only.includes("slash")) {
    await endLine();
    await page.keyboard.type("CLIENTS");
    await setBlockColor(page, lastBlock(page, "paragraph"), "Background", "Gray");
    // D5: the caret is back in the block; "/" opens the menu at once.
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await page.waitForTimeout(400);
    check("slash after colour change", await menuOpen(), { focus: await page.evaluate(() => document.activeElement?.className.slice(0, 24)) });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Backspace");
  }
  if (only.includes("page")) {
    await endLine();
    const before = page.url();
    await page.keyboard.type("/page", { delay: 40 });
    await page.locator(".bn-suggestion-menu").waitFor({ timeout: 5000 }).catch(() => {});
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);
    const blocks = await page.locator('.bn-block-content[data-content-type="page"]').count();
    check("/Page stays on this page and adds the block", page.url() === before && blocks > 0, { url: page.url().slice(-36), blocks });
    if (page.url() !== before) await page.goto(before, { waitUntil: "domcontentloaded" }), await page.locator(".bn-editor").first().waitFor();
  }
  if (only.includes("divider")) {
    await endLine();
    await page.keyboard.type("---");
    await page.waitForTimeout(300);
    const divider = page.locator('.bn-block-content[data-content-type="divider"]').last();
    const isDivider = await divider.count();
    let opened = false;
    if (isDivider) {
      for (let i = 0; i < 3 && !opened; i++) {
        await page.mouse.move(0, 0);
        await divider.hover({ position: { x: 20, y: 4 } });
        await page.waitForTimeout(350);
        const handle = page.locator(".bn-side-menu [draggable=true]").first();
        if (await handle.isVisible().catch(() => false)) {
          await handle.click();
          opened = await page.locator(".spaces-block-menu").isVisible({ timeout: 1500 }).catch(() => false);
        }
      }
      await page.keyboard.press("Escape");
    }
    check("--- makes a divider and its block menu opens", !!isDivider && opened, { isDivider });
  }
  if (only.includes("markdown")) {
    const cases = [
      ["# ", "heading", '[data-level="1"]'],
      ["## ", "heading", '[data-level="2"]'],
      ["### ", "heading", '[data-level="3"]'],
      ["- ", "bulletListItem"],
      ["* ", "bulletListItem"],
      ["1. ", "numberedListItem"],
      ["[] ", "checkListItem"],
      ["> ", "toggleListItem"],
      [`" `, "quote"],
      ["```", "codeBlock"],
    ];
    for (const [typed, type, extra] of cases) {
      await endLine();
      // A line after a list item is a list item: get back to text first.
      await page.keyboard.press("Enter");
      await page.waitForTimeout(150);
      await page.keyboard.type(typed);
      await page.keyboard.type("md");
      await page.waitForTimeout(250);
      const got = await page.evaluate(() => {
        const sel = getSelection()?.anchorNode;
        const el = (sel instanceof Element ? sel : sel?.parentElement)?.closest("[data-content-type]");
        return { type: el?.getAttribute("data-content-type"), level: el?.getAttribute("data-level"), text: el?.textContent };
      });
      const ok = got.type === type && (type === "codeBlock" || (!extra || `[data-level="${got.level ?? "1"}"]` === extra) && got.text === "md");
      check(`markdown "${typed}"`, ok, got);
      if (type === "codeBlock") await page.keyboard.press("Escape");
    }
  }
});
console.log(JSON.stringify({ id, failed }));
await browser.close();
process.exit(failed ? 1 : 0);
