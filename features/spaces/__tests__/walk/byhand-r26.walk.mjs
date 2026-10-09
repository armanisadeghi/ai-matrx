// Round 26 by-hand rebuild of the tester's flow on a NEW page as test@test.com — every step through the
// UI a person uses (header buttons, "/" menu, Markdown shortcuts, block menu, view menu). Scores the 10
// elements and prints the page id.  node .../byhand-r26.walk.mjs
import { open, newPage, act, slash, setBlockColor, originOf, trashPage } from "./lib.mjs";

const W = Number(process.env.WIDTH ?? 1440);
const { browser, page } = await open({ member: true, width: W, height: 1000 });
const id = process.argv[2] ?? (await newPage(page));
if (process.argv[2]) await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);
const score = {};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    console.log(`[step ${name}]`, e.message.split("\n")[0]);
  }
};
// A column's blocks sit in the group beside its (react-rendered) block content.
const colOuter = () => page.locator(".spaces-editor .bn-block:has(> .react-renderer > .bn-block-content[data-content-type=column])");
// A person's pace: keys 25 ms apart, a beat after Enter.
const type = (t) => page.keyboard.type(t, { delay: 25 });
const enter = async () => {
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
};
const para = (text) => page.locator('.bn-block-content[data-content-type="paragraph"]').filter({ hasText: new RegExp(`^${text}$`) }).first();

await act(page, async () => {
  await step("title", async () => {
    await page.locator(".spaces-title").click();
    await type("Traveling SMM OS by hand");
  });
  await step("icon", async () => {
    await page.locator(".spaces-title").hover();
    await page.getByRole("button", { name: /^Add icon$/ }).click();
    await page.getByPlaceholder("Filter…").fill("plane");
    await page.getByRole("button", { name: /^plane$/ }).first().click();
  });
  await step("cover", async () => {
    await page.locator(".spaces-title").hover();
    await page.getByRole("button", { name: /^Add cover$/ }).click();
    await page.locator("[data-cover-option]").nth(12).click();
  });
  await step("columns", async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.locator(".bn-editor .bn-inline-content").first().click();
    await slash(page, "5 columns");
    await page.waitForTimeout(1200);
  });
  await step("left column", async () => {
    await colOuter().nth(0).locator(".bn-inline-content").first().click();
    const subPage = async () => {
      await type("/page");
      await page.locator(".bn-suggestion-menu").waitFor({ timeout: 5000 });
      await page.keyboard.press("Enter");
      // Notion (round 32): "/page" opens the new sub-page at once. A person comes back with Back and clicks
      // into the line after the sub-page block (the caret's line), then keeps typing.
      await page.waitForURL((u) => u.pathname.includes("/spaces/") && !u.pathname.includes(id), { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      if (!page.url().includes(id)) {
        await page.goBack({ waitUntil: "domcontentloaded" });
        await page.waitForURL((u) => u.pathname.includes(id), { timeout: 30_000 });
      }
      await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
      await page.waitForTimeout(2000);
      const line = colOuter().nth(0).locator('.bn-block-content[data-content-type="paragraph"]').last();
      await line.click();
      if ((await line.innerText()).trim()) {
        await page.keyboard.press("End");
        await enter();
      }
    };
    for (const h of ["CLIENTS", "FULFILLMENT", "TEAM BOARDS"]) {
      await type(`### ${h}`);
      await enter();
      await subPage();
      await subPage();
    }
    for (const h of ["CLIENTS", "FULFILLMENT", "TEAM BOARDS"]) {
      await setBlockColor(page, page.locator('.bn-block-content[data-content-type="heading"]').filter({ hasText: new RegExp(`^${h}$`) }).first(), "Background", "Gray");
    }
  });
  // Round 33 (5): a narrow left column beside wide ones — drag the gutter after the first column leftwards.
  await step("narrow left", async () => {
    const handle = page.locator(".spaces-column-resizer").first();
    await colOuter().nth(0).hover();
    await page.waitForTimeout(300);
    const box = await handle.boundingBox();
    const w0 = (await colOuter().nth(0).boundingBox()).width;
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + box.width / 2 - (w0 * 0.3 * i) / 10, box.y + 20);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(800);
  });
  await step("charts", async () => {
    for (let c = 1; c <= 4; c++) {
      // Into the column's own empty line, as a person clicks it.
      await colOuter().nth(c).locator('.bn-block-content[data-content-type="paragraph"]').first().click({ position: { x: 6, y: 8 } });
      await slash(page, "Chart");
      const dlg = page.getByRole("dialog");
      await dlg.getByRole("button", { name: /^Tasks$/ }).first().click();
      await page.waitForTimeout(2500);
    }
  });
  await step("below", async () => {
    await page.locator(".spaces-page-end").click({ position: { x: 20, y: 10 } });
    await type("## Weekly rhythm");
    await enter();
    await type("> Monday planning");
    await enter();
    await type("Review last week");
    await enter();
    await page.keyboard.press("Backspace"); // out of the toggle
    await enter();
    await type("[] Post the reel");
    await enter();
    await type("Send the report");
    await enter();
    await enter();
    await slash(page, "Database - Inline");
    await page.locator(".spaces-db-frame:not([data-layout=chart])").last().waitFor({ timeout: 120_000 });
    await page.waitForTimeout(3000);
  });
  await step("database props + rows", async () => {
    const frame = page.locator(".spaces-db-frame:not([data-layout=chart])").last();
    for (const [name, search, typeLabel] of [["Tags", "tags", "Multi-select"], ["Due", "date", "Date"]]) {
      await frame.hover();
      await frame.getByRole("button", { name: "View settings" }).click();
      await page.getByText("Properties", { exact: true }).click();
      await page.getByText("New property", { exact: true }).click();
      await page.getByPlaceholder("Property name").fill(name);
      await page.getByPlaceholder("Search for a type…").fill(search);
      await page.getByRole("listbox", { name: "Property types" }).getByText(typeLabel, { exact: true }).click();
      await page.waitForTimeout(2500);
      await page.keyboard.press("Escape");
    }
    for (let i = 0; i < 3; i++) {
      await frame.hover();
      await frame.getByRole("button", { name: /^New$/ }).first().click();
      await page.waitForTimeout(1500);
      await page.keyboard.press("Escape");
    }
  });
  // Round 33 (5): a relation property ("Offer Bought" pointing at another table): New property -> Relation -> a database.
  await step("relation", async () => {
    const frame = page.locator(".spaces-db-frame:not([data-layout=chart])").last();
    await frame.hover();
    await frame.getByRole("button", { name: "View settings" }).click();
    await page.getByText("Properties", { exact: true }).click();
    await page.getByText("New property", { exact: true }).click();
    await page.getByPlaceholder("Property name").fill("Offer Bought");
    await page.getByPlaceholder("Search for a type…").fill("relation");
    await page.getByRole("listbox", { name: "Property types" }).getByText("Relation", { exact: true }).click();
    const dbs = page.getByRole("listbox", { name: "Databases" }).locator("[role=option], button, [data-menu-row]");
    await page.getByRole("listbox", { name: "Databases" }).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(2500);
    const other = page.getByRole("listbox", { name: "Databases" }).getByText(/^(?!.*\(this database\)).+$/).first();
    if (await other.count()) await other.click();
    else await dbs.first().click();
    await page.waitForTimeout(2500);
    await page.keyboard.press("Escape");
  });
  // Round 33 (5): the database's view tabs read "All" plus an added view (rename the open tab, + Add view).
  await step("view tabs", async () => {
    const frame = page.locator(".spaces-db-frame:not([data-layout=chart])").last();
    await frame.getByRole("tab").first().click();
    const name = page.getByRole("textbox", { name: "View name" }).last();
    await name.fill("All");
    await name.press("Enter");
    await page.waitForTimeout(800);
    await frame.hover();
    await frame.getByRole("button", { name: "Add view" }).click();
    await page.waitForTimeout(1500);
    await frame.getByRole("tab", { name: "All" }).click();
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
  });
  // Round 33 (5): a checked to-do is struck through.
  await step("check todo", async () => {
    await page.locator('.bn-block-content[data-content-type="checkListItem"] input[type=checkbox]').first().click();
    await page.waitForTimeout(800);
  });
});

await page.waitForTimeout(4000);
// Score after a reload (what is stored is what counts).
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(8000);
const m = await page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s);
  const cols = [...q(".spaces-editor .bn-block")].filter((o) => o.querySelector(":scope > .react-renderer > .bn-block-content[data-content-type=column]"));
  const left = cols[0];
  const charts = [...q('.spaces-db-frame[data-layout="chart"]')].map((f) => f.getBoundingClientRect());
  const sameRow = charts.length >= 4 && charts.slice(0, 4).every((r) => Math.abs(r.y - charts[0].y) < 4);
  return {
    title: document.querySelector(".spaces-title")?.textContent,
    icon: !!document.querySelector(".spaces-page-icon"),
    cover: !!document.querySelector(".spaces-cover"),
    columns: cols.length,
    leftHeadings: left ? left.querySelectorAll('[data-content-type="heading"]').length : 0,
    leftPages: left ? left.querySelectorAll('[data-content-type="page"]').length : 0,
    leftGray: left ? left.querySelectorAll('[data-background-color="gray"]').length : 0,
    charts: charts.length,
    chartsInRow: sameRow,
    chartWidths: charts.map((r) => Math.round(r.width)),
    dbRows: document.querySelector(".spaces-db-frame:not([data-layout=chart])")?.querySelectorAll("[data-row-id]").length ?? 0,
    dbHeaders: [...(document.querySelector(".spaces-db-frame:not([data-layout=chart])")?.querySelectorAll("[role=columnheader], th") ?? [])].map((h) => h.textContent?.trim()).filter(Boolean),
    toggles: q('[data-content-type="toggleListItem"]').length,
    todos: q('[data-content-type="checkListItem"]').length,
    headings: q('[data-content-type="heading"]').length,
    leftovers: [...q(".bn-inline-content")].filter((e) => /^\/\w/.test(e.textContent ?? "")).length,
    leftShare: cols.length >= 2 ? +(cols[0].getBoundingClientRect().width / cols.reduce((a, c) => a + c.getBoundingClientRect().width, 0)).toFixed(3) : 0,
    viewTabs: [...(document.querySelector(".spaces-db-frame:not([data-layout=chart])")?.querySelectorAll("[role=tab]") ?? [])].map((t) => t.textContent?.trim()),
    struck: [...q('.bn-block-content[data-content-type="checkListItem"][data-checked="true"] .bn-inline-content')].map((e) => getComputedStyle(e).textDecorationLine),
  };
});
const points = {
  cover: m.cover,
  icon: m.icon,
  title: m.title === "Traveling SMM OS by hand",
  columns: m.columns >= 5,
  linkColumn: m.leftHeadings >= 3 && m.leftPages >= 6 && m.leftGray >= 3,
  chartRow: m.charts >= 4 && m.chartsInRow,
  database: m.dbRows >= 3,
  toggles: m.toggles >= 1,
  todos: m.todos >= 2,
  headings: m.headings >= 4 && m.leftovers === 0,
  leftNarrow: m.leftShare > 0 && m.leftShare < 0.17,
  relation: m.dbHeaders.some((h) => h.includes("Offer Bought")),
  viewTabs: m.viewTabs[0] === "All" && m.viewTabs.length >= 2,
  todoStruck: m.struck.length >= 1 && m.struck.every((d) => d.includes("line-through")),
};
console.log(JSON.stringify(m));
console.log(JSON.stringify({ id, url: `/spaces/${id}`, score: Object.values(points).filter(Boolean).length, points }));
await page.screenshot({ path: process.env.SHOT ?? "/tmp/r26-byhand.png" });
await page.screenshot({ path: (process.env.SHOT ?? "/tmp/r26-byhand.png").replace(".png", "-full.png"), fullPage: true });
const missed = Object.entries(points).filter(([, v]) => !v).map(([k]) => k);
console.log(JSON.stringify({ check: "every by-hand element is on the page after a reload", ok: missed.length === 0, missed }));
if (!process.argv[2] && !process.env.KEEP) console.log(JSON.stringify({ trashed: await act(page, () => trashPage(page)) }));
await browser.close();
process.exit(missed.length ? 1 : 0);
