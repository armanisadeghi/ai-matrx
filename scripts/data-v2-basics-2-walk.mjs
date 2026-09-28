// scripts/data-v2-basics-2-walk.mjs — lane DATA-V2-BASICS-2, the table page's certification walk.
//
// Signs in through the app's own login form (scripts/lib/seat-browser.mjs, headless) on the shared
// preview (live database) and walks /data-v2 as a person does. Test beds (admin@admin.com's test
// organizations, never Arman's):
//   Harbor Dental Group  — "Insurance Plan Accounts" 377b783a… (moved from /data, Sheet)
//                           "Operatory Supply Orders" a224d20e… (moved, Sheet)
//   Cedar Ridge Physical Therapy — "Clinic Supplies Count" 5b5d2f87… (native; Stock Status choice,
//                           default "In stock"), "Clinic Equipment Log" 46ae8d53… (native, imported)
//
//   PHASE=owner    sort, edit re-sorts, click-off clears, the enum nudge (ask / Cancel / ask again /
//                  Add), a column with a default + a row, a column named after an old key, colours
//                  with Cancel, a type change with Undo, the row menu (stable, Delete confirm names
//                  the row), 1600 / 390, light / dark
//   PHASE=member   test@test.com: an organization table as a member (viewer), a table shared to
//                  them as editor (edit a cell)
//   PHASE=breaker  BREAKER-1's steps: rename then add the old name, an emoji name beside a real
//                  one, rename onto another column's name, a choice column with no choices, Configure
//                  Table save keeps the grid, + Row draws choice / date inputs
//
//   ORIGIN=http://data-v2-basics-2.localhost:3001 PHASE=owner node scripts/data-v2-basics-2-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://data-v2-basics-2.localhost:3001";
const PHASE = process.env.PHASE ?? "owner";
const SHOTS =
  process.env.SHOTS ??
  "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/data-v2-basics-2/certification";
mkdirSync(SHOTS, { recursive: true });
const T = {
  plans: "377b783a-f18a-40c3-bf2b-7617691d0091",
  orders: "a224d20e-33d8-4535-9653-e569469607d6",
  supplies: "5b5d2f87-ced4-43ac-8c36-d426dcb96c47",
  equipment: "46ae8d53-4068-4593-9439-fb2b656767f1",
};
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const out = { origin: ORIGIN, phase: PHASE, started: new Date().toISOString(), steps: [], console_errors: [], frictions: [] };
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 400));
};
const friction = (what) => {
  out.frictions.push(what);
  console.log(`  ✗ FRICTION: ${what}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
// The walk's own Resume request (the preview's walk cap) answers 409 when the host is already
// running; that is the tooling, before the person signs in, and is not counted.
let counting = false;
page.on("console", (m) => {
  if (m.type() !== "error" || !counting) return;
  const t = m.text();
  // The dev server's hot-reload socket and its own compile overlay are the preview, not the page.
  if (/_next\/hmr|WebSocket connection/.test(t)) return;
  out.console_errors.push({ at: page.url().replace(ORIGIN, ""), text: t.slice(0, 300) });
});
page.on("pageerror", (e) => out.console_errors.push({ at: page.url().replace(ORIGIN, ""), text: `PAGEERROR ${String(e).slice(0, 300)}` }));
const shot = async (name) => {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
};

/** The walk cap's explicit Resume, asked from the page itself (same origin), before signing in. */
async function resumeWalk() {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
  const answer = await page
    .evaluate(async () => {
      const body = new FormData();
      body.set("returnTo", "/login");
      const r = await fetch("/__dev-walk", { method: "POST", body, redirect: "manual" });
      return r.status;
    })
    .catch((e) => String(e));
  console.log(`[walk] resume asked: ${answer}`);
}

/** The walk cap parks an idle preview host; a person presses Resume, and so does the walk. */
async function unpark() {
  if (!page.url().includes("__dev-walk")) return;
  await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
  await sleep(6000);
}

async function open(tableId, query = "", { width = 1600, height = 1000, dark = false } = {}) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
  await page.goto(`${ORIGIN}/data-v2/${tableId}${query}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await unpark();
  if (page.url().includes("__dev-walk")) await page.goto(`${ORIGIN}/data-v2/${tableId}${query}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  const ready = await until("the grid", async () => (await page.locator("thead th").count()) > 1, 240000);
  if (!ready.v) throw new Error(`the table ${tableId} did not draw`);
  await sleep(2500);
}

const headers = () => page.evaluate(() => [...document.querySelectorAll("thead th")].map((t) => t.innerText.trim()).filter(Boolean));
const rowTexts = () => page.evaluate(() => [...document.querySelectorAll("tbody tr")].map((t) => t.innerText.replace(/\s+/g, " ").trim()));
const colIndex = (name) =>
  page.evaluate((n) => [...document.querySelectorAll("thead th")].findIndex((th) => (th.textContent ?? "").trim().toLowerCase().startsWith(n.toLowerCase())), name);
async function cellOf(row, col) {
  const i = await colIndex(col);
  return page.locator("tbody tr", { hasText: row }).first().locator("td").nth(i);
}
const popups = () =>
  page.evaluate(() => [...document.querySelectorAll("[role=dialog],[role=alertdialog],[data-matrx-choice-nudge]")].map((d) => d.innerText.replace(/\s+/g, " ").slice(0, 300)));

async function columnSettings(col) {
  await page.locator("thead th", { hasText: col }).first().click({ button: "right" });
  await sleep(800);
  const items = page.locator("[role=menu] [role^=menuitem]");
  const texts = await items.allInnerTexts();
  await items.nth(texts.findIndex((t) => /Column settings/i.test(t))).click();
  const d = page.getByRole("dialog").filter({ hasText: `Column · ${col}` });
  await d.waitFor({ timeout: 20000 });
  await sleep(1200);
  return d;
}

/** Delete a column the way a person does: its settings → Delete column… → Remove column. */
async function deleteColumn(col) {
  await sleep(1500);
  const d = await columnSettings(col).catch(async () => {
    // The header row redraws after the previous removal; one more look, as a person would.
    await page.keyboard.press("Escape");
    await sleep(2500);
    return columnSettings(col);
  });
  await d.getByRole("button", { name: /^Delete column/ }).click();
  const ask = page.getByRole("alertdialog").filter({ hasText: `Remove "${col}"?` });
  await ask.waitFor({ timeout: 15000 });
  await ask.getByRole("button", { name: "Remove column", exact: true }).click();
  await sleep(3500);
  return !(await headers()).includes(col);
}

/** Stock Status back to a Choice column from its own settings, its values added as its choices. */
async function stockBackToChoice() {
  const d = await columnSettings("Stock Status");
  const shows = d.getByRole("combobox").nth(1);
  if (/Choice/.test(await shows.innerText())) {
    await page.keyboard.press("Escape");
    return "already a choice";
  }
  await shows.click();
  await sleep(700);
  await page.getByRole("option").filter({ hasText: /^Choice/ }).first().click();
  await sleep(2500);
  const addAll = d.getByRole("button", { name: /^Add all/ });
  if (await addAll.count()) await addAll.first().click();
  await sleep(400);
  await d.getByRole("button", { name: "Save", exact: true }).click();
  const ok = page.getByRole("alertdialog").getByRole("button").filter({ hasNotText: "Cancel" });
  if (await ok.count().catch(() => 0)) await ok.first().click().catch(() => {});
  await sleep(5000);
  return "changed back";
}

async function nudgeRound(row, col, word) {
  const c = await cellOf(row, col);
  await c.click();
  await sleep(400);
  await page.keyboard.type(word, { delay: 30 });
  await sleep(800);
  await page.keyboard.press("Enter");
  // The Sheet's question and the records-ui grid's question read the same words.
  const ask = page.locator("[data-matrx-choice-nudge], [data-radix-popper-content-wrapper]").filter({ hasText: "to the choices for" });
  const asked = await until("the ask", async () => (await ask.count()) > 0, 8000);
  return { asked: !!asked.v, text: asked.v ? (await ask.first().innerText()).replace(/\s+/g, " ") : null };
}

try {
  const who = PHASE === "member" ? "member" : "admin";
  const email = who === "admin" ? env.AI_ADMIN_USERNAME : env.AI_MEMBER_USERNAME;
  const pw = who === "admin" ? env.AI_ADMIN_PASSWORD : env.AI_MEMBER_PASSWORD;
  await resumeWalk();
  out.signed_in_as = await signIn(page, ORIGIN, email, pw, who);
  counting = true;
  step("signed in", { as: out.signed_in_as });

  if (PHASE === "owner") {
    // ── 1 · first look, the moved Sheet, 1600 light ─────────────────────────────────────────────
    await open(T.plans);
    await shot("o01-plans-1600-light");
    step("moved table opens in the Sheet", { headers: (await headers()).slice(0, 12), url: page.url().replace(ORIGIN, "") });
    if (page.url().includes("sort=")) friction(`opening wrote a sort into the address: ${page.url()}`);

    // ── 2 · sort, then an edit re-sorts (Arman: sort after edit) ────────────────────────────────
    await open(T.orders);
    await page.locator("thead th", { hasText: "Item" }).first().click({ button: "right" });
    await sleep(800);
    const sortItems = page.locator("[role=menu] [role^=menuitem]");
    const sortTexts = await sortItems.allInnerTexts();
    const asc = sortTexts.findIndex((t) => /^Sort/i.test(t.trim()) && /(A\s*[→-]\s*Z|ascending|smallest|oldest|first)/i.test(t));
    if (asc >= 0) await sortItems.nth(asc).click();
    else { friction(`no sort item in the header menu: ${sortTexts.slice(0, 6).join(" | ")}`); await page.keyboard.press("Escape"); }
    await sleep(2000);
    // The gloves row's Item, typed as a person types it (whatever an earlier stopped walk left).
    const nameGloves = async (to) => {
      const cell = await cellOf("Nitrile gloves", "Item");
      await cell.dblclick();
      await sleep(400);
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type(to, { delay: 10 });
      await page.keyboard.press("Enter");
      await sleep(2500);
    };
    const dataRows = async () => (await rowTexts()).filter((r) => !/^Add row/.test(r));
    if (!(await dataRows()).some((r) => r.startsWith("Nitrile gloves, medium"))) await nameGloves("Nitrile gloves, medium");
    const before = (await dataRows()).slice(0, 3);
    await nameGloves("Z Nitrile gloves, medium");
    const after = await dataRows();
    await shot("o02-edit-resorts");
    step("sorted by Item, an edit re-sorts", { before, after, url: page.url().replace(ORIGIN, "") });
    if (!before[0]?.startsWith("Nitrile gloves")) friction(`sorted by Item, the gloves row was not first before the edit: ${before.join(" | ")}`);
    if (!after[after.length - 1]?.startsWith("Z Nitrile gloves, medium")) friction(`the edited row did not re-sort to the end: ${after.join(" | ")}`);
    // put it back
    await nameGloves("Nitrile gloves, medium");

    // ── 3 · click-off clears a range and grid focus ─────────────────────────────────────────────
    const a1 = await cellOf("Saliva ejectors", "Operatory");
    const a2 = await cellOf("Prophy paste", "Quantity");
    await a1.click();
    await a2.click({ modifiers: ["Shift"] });
    await sleep(500);
    const selected = await page.evaluate(() => document.querySelectorAll("[data-selected=true], [aria-selected=true]").length);
    await page.locator("header, [data-shell-header]").first().click({ position: { x: 700, y: 20 } }).catch(() => {});
    await sleep(600);
    const afterOff = await page.evaluate(() => document.querySelectorAll("[data-selected=true], [aria-selected=true]").length);
    step("a range, then a click off the table", { selected, afterOff });
    if (afterOff > 0) friction(`a click off the table left ${afterOff} cells selected`);

    // ── 4 · the enum nudge: ask, Cancel, ask again, then Add (on the native table) ─────────────
    await open(T.plans);
    const r1 = await nudgeRound("Careington", "Plan Type", "EPO");
    step("nudge 1 (Plan Type, EPO)", r1);
    await page.locator("[data-matrx-choice-nudge] button", { hasText: "Cancel" }).first().click().catch(() => {});
    await sleep(800);
    const r2 = await nudgeRound("Humana Dental Value", "Plan Type", "EPO");
    step("nudge 2 after a Cancel", r2);
    await page.locator("[data-matrx-choice-nudge] button", { hasText: "Cancel" }).first().click().catch(() => {});
    await sleep(800);
    if (!r1.asked || !r2.asked) friction("the nudge did not ask both times");
    await shot("o04-nudge-asks-again");
    await open(T.supplies);
    // The native table: a word that is none of the choices asks, and Add makes it one.
    const r3 = await nudgeRound("Foam rollers", "Stock Status", "Special order");
    step("nudge on the native table", r3);
    if (!r3.asked) friction(`typing "Special order" on the native table did not ask: ${JSON.stringify(r3)}`);
    await page
      .locator("[data-matrx-choice-nudge], [data-radix-popper-content-wrapper]")
      .filter({ hasText: "to the choices for" })
      .getByRole("button", { name: "Add", exact: true })
      .first()
      .click()
      .catch(() => {});
    await sleep(3000);
    const added = (await (await cellOf("Foam rollers", "Stock Status")).innerText()).trim();
    await shot("o05-nudge-added");
    step("Add: the cell holds the new choice", { cell: added });
    if (!/Special order/.test(added)) friction(`after Add the cell reads "${added}"`);
    // Put the row back (an existing choice: no question) and take the new choice out of the list
    // again from the column's settings — choice editing, walked (Arman).
    const back3 = await nudgeRound("Foam rollers", "Stock Status", "Backordered");
    if (back3.asked) friction("typing an existing choice asked as if it were new");
    await sleep(2000);
    const restored = (await (await cellOf("Foam rollers", "Stock Status")).innerText()).trim();
    {
      // The column's settings live in the Sheet.
      if (!(await page.locator("[data-sheet-layout]").count())) {
        await page.getByRole("button", { name: "Sheet", exact: true }).first().click();
        await until("the Sheet", async () => (await page.locator("[data-sheet-layout]").count()) > 0, 60000);
        await sleep(2500);
      }
      const cs = await columnSettings("Stock Status");
      const remove = cs.getByRole("button", { name: "Remove Special order", exact: true });
      const had = await remove.count();
      if (had) await remove.first().click();
      await sleep(600);
      await cs.getByRole("button", { name: "Save", exact: true }).click();
      await sleep(3500);
      const again = await columnSettings("Stock Status");
      const left = await again.getByRole("button", { name: "Remove Special order", exact: true }).count();
      await shot("o05b-choice-removed");
      step("choice editing: the added choice removed from the column's settings", { cell_back: restored, was_listed: had, still_listed: left });
      if (!had || left) friction(`removing the "Special order" choice from settings: listed ${had}, still ${left}`);
      await again.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => page.keyboard.press("Escape"));
      await sleep(800);
    }

    // ── 5 · a new row takes the column's default (Arman's defect) — in the Sheet layout ───────
    if (!(await page.locator("[data-sheet-layout]").count())) {
      await page.getByRole("button", { name: "Sheet", exact: true }).first().click();
      await until("the Sheet", async () => (await page.locator("[data-sheet-layout]").count()) > 0, 60000);
      await sleep(2500);
    }
    await page.getByRole("button", { name: /^Row$/ }).first().click();
    const form = page.getByRole("dialog").filter({ hasText: "Add New Row" });
    await form.waitFor({ timeout: 20000 });
    await sleep(1500);
    const prefilled = await form.innerText();
    await shot("o06a-add-row-form-shows-the-default");
    await form.locator("#title").fill("Pinch gauges (set of 3)");
    await form.getByRole("button", { name: "Add Row", exact: true }).click();
    await sleep(4000);
    const newRow = (await rowTexts()).find((t) => t.includes("Pinch gauges")) ?? null;
    await shot("o06-row-takes-default");
    step("a new row takes the default", { form_shows_default: /In stock/.test(prefilled), row: newRow });
    if (!/In stock/.test(prefilled)) friction(`the + Row form does not show the column's default: ${prefilled.replace(/\s+/g, " ").slice(0, 400)}`);
    if (!newRow || !/In stock/.test(newRow)) friction(`the new row does not read In stock: ${newRow}`);

    // ── 6 · add a column named after an old key (Arman): add "Bin N", rename it, add "Bin N" again ──
    const bin = `Bin ${String(Date.now()).slice(-4)}`;
    const addColumn = async (name) => {
      await page.getByRole("button", { name: /^Column$/ }).first().click();
      const dlg = page.getByRole("dialog").filter({ hasText: "Add New Column" });
      await dlg.waitFor({ timeout: 20000 });
      await dlg.getByPlaceholder("e.g. Total Revenue").fill(name);
      await dlg.getByRole("button", { name: "Add Column", exact: true }).click();
      await sleep(4000);
    };
    await addColumn(bin);
    let d = await columnSettings(bin);
    await d.locator("#col-name").fill(`${bin} (old shelf)`);
    await d.getByRole("button", { name: "Save", exact: true }).click();
    await sleep(3000);
    await addColumn(bin);
    const hdrs = await headers();
    await shot("o07-column-after-old-key");
    step(`added "${bin}", renamed it, added "${bin}" again`, { headers: hdrs, dialogs: await popups() });
    if (!hdrs.includes(bin) || !hdrs.includes(`${bin} (old shelf)`)) friction(`headers after the add: ${hdrs.join(", ")}`);
    // And both go again the way a person removes a column (Delete column…), so the table ends as it began.
    const gone = { [bin]: await deleteColumn(bin), [`${bin} (old shelf)`]: await deleteColumn(`${bin} (old shelf)`) };
    step("both removed (Delete column…)", gone);
    if (Object.values(gone).some((v) => v !== true)) friction(`a column did not go: ${JSON.stringify(gone)}`);

    // ── 7 · colours: colour by Stock Status, Cancel puts it back ───────────────────────────────
    // Each row's paint before the dialog opens — Cancel must put back exactly this.
    const paint = () => page.evaluate(() => [...document.querySelectorAll("tbody tr")].map((tr) => (tr.className.match(/(^|\s)bg-[\w-]+-50\b/g) ?? []).join(" ").trim()));
    const paintBefore = await paint();
    await page.getByRole("button", { name: /^Colors/ }).first().click();
    const colors = page.getByRole("dialog").filter({ hasText: "Table colors" });
    await colors.waitFor({ timeout: 20000 });
    await colors.getByRole("combobox", { name: "Column to color by" }).click();
    await sleep(500);
    // The first column the table can be coloured by (a choice or a tick box).
    await page.getByRole("option").nth(1).click();
    await sleep(1500);
    const tinted = await page.evaluate(() => [...document.querySelectorAll("tbody tr")].filter((tr) => /(^|\s)bg-\w+-50(\s|$)/.test(tr.className)).length);
    await shot("o08-colour-preview");
    await colors.getByRole("button", { name: "Cancel", exact: true }).click();
    await sleep(2500);
    const untinted = await page.evaluate(() => [...document.querySelectorAll("tbody tr")].filter((tr) => /(^|\s)bg-\w+-50(\s|$)/.test(tr.className)).length);
    const paintAfter = await paint();
    step("colour by another column, then Cancel", { tinted_before: paintBefore.filter(Boolean).length, tinted_while_open: tinted, tinted_after_cancel: untinted, same_paint_as_before: JSON.stringify(paintBefore) === JSON.stringify(paintAfter) });
    if (JSON.stringify(paintBefore) !== JSON.stringify(paintAfter)) friction(`Cancel on Table colors did not put the rows' colours back: before ${JSON.stringify(paintBefore)} after ${JSON.stringify(paintAfter)}`);

    // ── 8 · a type change and its Undo (on the moved table) ────────────────────────────────────
    await open(T.orders);
    d = await columnSettings("Operatory");
    if (/Number/.test(await d.getByRole("combobox").nth(0).innerText())) {
      // A stopped earlier run left it a Number: changing it back is the other half of the promise.
      await d.getByRole("combobox").nth(0).click();
      await sleep(500);
      await page.getByRole("option", { name: "Text", exact: true }).first().click();
      await sleep(600);
      await d.getByRole("button", { name: "Save", exact: true }).click();
      await sleep(1200);
      await page.getByRole("button", { name: "Change type", exact: true }).click().catch(() => {});
      await sleep(5000);
      await open(T.orders);
      const back = (await rowTexts()).slice(0, 3);
      step("Operatory changed back to Text first", { rows: back });
      if (!back.some((r) => /Op \d/.test(r))) friction(`changed back to Text, the set-aside values did not come back: ${back.join(" | ")}`);
      d = await columnSettings("Operatory");
    }
    await d.getByRole("combobox").nth(0).click();
    await sleep(500);
    await page.getByRole("option", { name: "Number", exact: true }).first().click();
    await sleep(600);
    await d.getByRole("button", { name: "Save", exact: true }).click();
    await sleep(1200);
    const confirmText = (await page.getByRole("alertdialog").innerText().catch(() => "")).replace(/\s+/g, " ");
    await page.getByRole("button", { name: "Change type", exact: true }).click();
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const offered = await until("Undo", async () => (await undo.count()) > 0, 12000);
    const whileNumber = (await rowTexts()).slice(0, 3);
    await shot("o09-type-change-notice");
    if (offered.v) await undo.first().click();
    await sleep(6000);
    // The preview's walk cap may park the host meanwhile; the table is read again as it is now.
    if (page.url().includes("__dev-walk")) await open(T.orders);
    const afterUndo = (await rowTexts()).slice(0, 3);
    step("Operatory to Number, then Undo", { confirm: confirmText, undo_offered: !!offered.v, whileNumber, afterUndo });
    if (!afterUndo.some((t) => t.includes("Op 3"))) friction("Undo did not bring Op 3 back");

    // ── 9 · the row's right-click menu: stable, Delete apart, confirm names the row ─────────────
    const row = page.locator("tbody tr", { hasText: "Saliva ejectors" }).first();
    await row.locator("td").nth(1).click({ button: "right" });
    await sleep(300);
    const early = await page.locator("[role=menu] [role^=menuitem]").allInnerTexts();
    await sleep(1800);
    const late = await page.locator("[role=menu] [role^=menuitem]").allInnerTexts();
    await shot("o10-row-menu");
    const moved = early.filter((t, i) => late[i] !== t).length;
    step("row menu opened; items 0.3 s vs 2.1 s after", { items: late.length, moved_under_pointer: moved });
    if (moved > 0) friction(`${moved} menu items moved after the menu opened`);
    await page.keyboard.press("Escape");
    await sleep(500);

    // ── 9b · Delete from the row's menu: apart from Duplicate and Edit, the confirm names the row ─
    // The walk's own "Pinch gauges (set of 3)" rows (step 5 adds one each run) go this way.
    await open(T.supplies, "?view=sheet");
    let deletions = 0;
    for (let k = 0; k < 12; k++) {
      const pinch = page.locator("tbody tr", { hasText: "Pinch gauges (set of 3)" }).first();
      if (!(await pinch.count())) break;
      await pinch.locator("td").nth(1).click({ button: "right" });
      await sleep(900);
      // The row's own actions are in its "Row · <name>" submenu.
      await page.locator("[role=menu] [role^=menuitem]").filter({ hasText: /^Row · / }).first().hover();
      await sleep(900);
      const shape = await page.evaluate(() => {
        const menus = [...document.querySelectorAll("[role=menu]")];
        const menu = menus[menus.length - 1];
        if (!menu) return null;
        return [...menu.querySelectorAll("[role^=menuitem], [role=separator]")].map((x) => (x.getAttribute("role") === "separator" ? "|" : x.innerText.trim().split("\n")[0]));
      });
      const di = shape?.findIndex((s) => /^Delete/.test(s)) ?? -1;
      const near = shape ? shape.slice(Math.max(0, di - 2), di + 1) : [];
      if (k === 0) {
        await shot("o10b-row-menu-delete-apart");
        step("the row menu: where Delete sits", { around_delete: near, duplicate_at: shape?.findIndex((s) => /^Duplicate/.test(s)), edit_at: shape?.findIndex((s) => /^Edit/.test(s)), delete_at: di });
        if (di < 0) friction(`the row menu has no Delete: ${JSON.stringify(shape)}`);
        else if (!shape.slice(Math.min(...[shape.findIndex((s) => /^Duplicate/.test(s)), shape.findIndex((s) => /^Edit/.test(s))].filter((x) => x >= 0)), di).includes("|"))
          friction(`Delete is not set apart from Duplicate/Edit: ${JSON.stringify(shape)}`);
      }
      await page.locator("[role=menu]").last().locator("[role^=menuitem]").filter({ hasText: /^Delete/ }).first().click();
      const ask = page.getByRole("alertdialog");
      await ask.waitFor({ timeout: 15000 });
      const asked = (await ask.innerText()).replace(/\s+/g, " ");
      if (k === 0) {
        await shot("o10c-delete-names-the-row");
        step("Delete asks, naming the row", { asked: asked.slice(0, 300) });
        if (!/Pinch gauges \(set of 3\)/.test(asked)) friction(`the Delete confirm does not name the row: ${asked.slice(0, 200)}`);
      }
      await ask.getByRole("button").filter({ hasText: /^Delete/ }).last().click();
      await sleep(3500);
      deletions++;
    }
    const deleteNotice = await page.evaluate(() => [...document.querySelectorAll("li, [role=status], [data-sonner-toast]")].map((x) => x.innerText.replace(/\s+/g, " ")).filter((x) => /Undo/.test(x)).slice(0, 1));
    step("the walk's rows deleted from the row menu", { deletions, notice: deleteNotice, left: await page.locator("tbody tr", { hasText: "Pinch gauges (set of 3)" }).count() });

    // ── 10 · widths and themes ─────────────────────────────────────────────────────────────────
    for (const [w, h, dark, name] of [
      [390, 844, false, "o11-plans-390-light"],
      [390, 844, true, "o12-plans-390-dark"],
      [1600, 1000, true, "o13-plans-1600-dark"],
    ]) {
      await open(T.plans, "", { width: w, height: h, dark });
      await shot(name);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      step(`look ${name}`, { page_scrolls_sideways_by: overflow });
      if (overflow > 2) friction(`${name}: the page scrolls sideways by ${overflow}px`);
    }
  }

  if (PHASE === "share") {
    // The owner shares "Clinic Supplies Count" with test@test.com as Editor, through the page's Share.
    await open(T.supplies);
    await page.getByRole("button", { name: /^Share$/ }).first().click();
    await sleep(2500);
    const dlg = page.getByRole("dialog").filter({ hasText: "Share Table" }).first();
    await dlg.getByPlaceholder("user@example.com").fill(env.AI_MEMBER_USERNAME);
    await dlg.getByText("Permission Level", { exact: true }).click().catch(() => {});
    await sleep(400);
    // The label opens the level picker (it is the select's label).
    await page.getByRole("option", { name: "Editor", exact: true }).click();
    await sleep(500);
    await dlg.getByRole("button", { name: /Share with User/ }).last().click();
    await sleep(4000);
    await shot("s01-shared-as-editor");
    step("shared with the member as Editor", { dialog: (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 600) });
  }

  if (PHASE === "member") {
    // test@test.com is a member of Cedar Ridge Physical Therapy (invited by lane HANDOVER).
    await open(T.equipment);
    await shot("m01-member-org-table");
    const c = await cellOf("Pulse oximeter", "Room");
    await c.dblclick().catch(() => {});
    await sleep(1200);
    const editorOpen = await page.locator("[data-matrx-cell-editor], tbody textarea, tbody input[type=text]").count();
    step("a member on an organization table", { headers: (await headers()).slice(0, 10), editor_opened: editorOpen, text: (await page.evaluate(() => document.body.innerText.match(/Viewer[^\n]{0,160}|can view[^\n]{0,160}|view only[^\n]{0,160}/i)?.[0] ?? null)) });
    await c.click().catch(() => {});
    await page.keyboard.type("G", { delay: 20 });
    await sleep(1500);
    const said = await page.evaluate(() => [...document.querySelectorAll("[role=status], [role=alert], li, [data-sonner-toast], [role=tooltip]")].map((x) => x.innerText.replace(/\s+/g, " ")).filter((t) => /change|edit|view|read/i.test(t)).slice(0, 3));
    await shot("m01b-viewer-types");
    step("a viewer types into a cell", { said });
    if (said.length === 0) friction("a viewer typed into a cell and nothing said why it cannot change");
    await page.keyboard.press("Escape");
    await open(T.supplies);
    await shot("m02-member-shared-editor");
    const s = await cellOf("Foam rollers", "Room");
    const was = (await s.innerText()).trim();
    // A different value each run, so the edit is proven to land (not already there).
    const typed = /east wall/.test(was) ? "Gym B (west wall)" : "Gym B (east wall)";
    await s.dblclick();
    await sleep(600);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(typed, { delay: 15 });
    await page.keyboard.press("Enter");
    await sleep(2500);
    const now = (await (await cellOf("Foam rollers", "Room")).innerText()).trim();
    await open(T.supplies);
    const reread = (await (await cellOf("Foam rollers", "Room")).innerText()).trim();
    step("a member shared as editor edits a cell", { was, typed, cell: now, after_reload: reread, popups: await popups() });
    if (now !== typed || reread !== typed) friction(`the editor's edit did not land: was "${was}", typed "${typed}", reads "${now}", after reload "${reread}"`);
  }

  if (PHASE === "breaker" || PHASE === "bf9") {
    // The Sheet is where the breaker walked (the column dialogs, + Row, Configure Table).
    await open(T.supplies, "?view=sheet");
    if (!(await page.locator("[data-sheet-layout]").count())) {
      await page.getByRole("button", { name: "Sheet", exact: true }).first().click();
      await until("the Sheet", async () => (await page.locator("[data-sheet-layout]").count()) > 0, 60000);
      await sleep(2500);
    }
    let d;
    // Names of this run, so the walk can be run again and again on the same table.
    const n = String(Date.now()).slice(-4);
    if (PHASE === "breaker") {
    const addNamed = async (name) => {
      await page.getByRole("button", { name: /^Column$/ }).first().click();
      const add = page.getByRole("dialog").filter({ hasText: "Add New Column" });
      await add.waitFor({ timeout: 20000 });
      await add.getByPlaceholder("e.g. Total Revenue").fill(name);
      await sleep(400);
      return add;
    };
    // B-F5: add a column, rename it, then add its old name again
    let add = await addNamed(`Room ${n}`);
    await add.getByRole("button", { name: "Add Column", exact: true }).click();
    await sleep(4000);
    d = await columnSettings(`Room ${n}`);
    await d.locator("#col-name").fill(`Treatment area ${n}`);
    await d.getByRole("button", { name: "Save", exact: true }).click();
    await sleep(3000);
    // B-F7: the old name again, then an emoji name beside a real one
    for (const name of [`Room ${n}`, `Room ${n} 🔥`]) {
      add = await addNamed(name);
      await add.getByRole("button", { name: "Add Column", exact: true }).click();
      await sleep(4000);
      const hs = await headers();
      step(`B-F5/F7 add "${name}"`, { found: hs.filter((h) => h.includes(n)), popups: await popups() });
      if (!hs.includes(name)) friction(`"${name}" did not appear: ${hs.filter((h) => h.includes(n)).join(", ")}`);
      await page.keyboard.press("Escape");
    }
    // A name another column already has is said as it is typed, and never sent.
    add = await addNamed(`Treatment area ${n}`);
    const said = (await add.innerText()).replace(/\s+/g, " ").match(/You already have a column called "[^"]+"/)?.[0] ?? null;
    await add.getByRole("button", { name: "Add Column", exact: true }).click();
    await sleep(1500);
    await shot("b00-a-taken-name-is-said");
    step("a taken name is said before it is sent", { said, dialog_still_open: await add.isVisible() });
    if (!said) friction(`adding "Treatment area ${n}" again did not say the name is taken`);
    await page.keyboard.press("Escape");
    await sleep(500);
    // B-F8: rename onto another column's name
    d = await columnSettings("Stock Count");
    await d.locator("#col-name").fill("Title");
    await d.getByRole("button", { name: "Save", exact: true }).click();
    await sleep(2500);
    const refusal = await page.evaluate(() => [...document.querySelectorAll("li, [role=status], [role=dialog]")].map((x) => x.innerText.replace(/\s+/g, " ")).filter((t) => /already/i.test(t)).slice(0, 2));
    await shot("b01-rename-onto-a-name");
    step("B-F8 rename Stock Count to Title", { refusal, headers: await headers() });
    if (refusal.length === 0) friction("renaming onto another column's name was not refused by name");
    await page.keyboard.press("Escape");
    // B-F1: a choice column with no choices stays a choice
    add = await addNamed(`Vendor ${n}`);
    await add.getByRole("combobox").nth(1).click();
    await sleep(500);
    await page.getByRole("option", { name: /^Choice/ }).first().click();
    await sleep(600);
    await add.getByRole("button", { name: "Add Column", exact: true }).click();
    await sleep(4000);
    d = await columnSettings(`Vendor ${n}`);
    const showsAs = (await d.innerText()).match(/Shows as\s*\n?\s*(\w[\w ]*)/)?.[1] ?? null;
    await shot("b02-choice-with-no-choices");
    step("B-F1 a choice column with no choices", { shows_as: showsAs });
    if (!/Choice/.test(showsAs ?? "")) friction(`the empty choice column shows as ${showsAs}`);
    await page.keyboard.press("Escape");
    }
    // B-F9: Configure Table save keeps the grid
    const before = (await headers()).length;
    await page.locator('[aria-label="Table settings"]').click();
    const cfg = page.getByRole("dialog").filter({ hasText: "Configure Table" });
    await cfg.waitFor({ timeout: 20000 });
    await sleep(1500);
    // The breaker's exact step: a Choice column turned into Text, saved from Configure Table.
    const fieldIdx = await cfg.evaluate((x) =>
      [...x.querySelectorAll("input")].filter((i) => i.type === "text" || !i.getAttribute("type")).findIndex((i) => i.value === "Stock Status"),
    );
    step("B-F9 the Stock Status card", { fieldIdx });
    const showsAsBox = cfg.getByRole("combobox").nth(fieldIdx * 2 + 1);
    await showsAsBox.click();
    await sleep(600);
    await page.getByRole("option", { name: /^Text/ }).first().click();
    await sleep(600);
    await cfg.getByRole("button", { name: /Save Changes/ }).click().catch(() => {});
    const confirmBtn = page.getByRole("alertdialog").getByRole("button").filter({ hasNotText: "Cancel" });
    if (await confirmBtn.count()) await confirmBtn.first().click();
    const snaps = [];
    for (const ms of [400, 1500, 4000]) {
      await sleep(ms);
      snaps.push({ headers: (await headers()).length, dash_rows: (await rowTexts()).filter((t) => /^(— ?)+$/.test(t)).length });
    }
    await shot("b03-configure-save-keeps-the-grid");
    step("B-F9 Configure Table save", { before, snaps });
    if (snaps.some((s) => s.headers < before - 1)) friction(`after Save Changes the grid showed ${Math.min(...snaps.map((s) => s.headers))} of ${before} columns`);
    await page.keyboard.press("Escape");
    // B-F3: + Row draws a chooser for a choice column
    await page.getByRole("button", { name: /^Row$/ }).first().click();
    const form = page.getByRole("dialog").filter({ hasText: "Add New Row" });
    await form.waitFor({ timeout: 20000 });
    await sleep(1500);
    const kinds = await form.evaluate((x) => x.innerText.split("\n").filter((l) => /^(Text|Choice|Number|Whole number|Date|Date & time|Yes \/ No|string|number|datetime)$/.test(l)));
    const choosers = await form.locator("[role=combobox]").count();
    await shot("b04-add-row-form");
    step("B-F3 + Row form", { kind_words: kinds, choosers });
    if (kinds.some((k) => /^(string|number|datetime)$/.test(k))) friction("the + Row form prints storage words");
    await page.keyboard.press("Escape");
    await sleep(800);
    // The table ends as it began: B-F9's Text back to a Choice, and this run's columns removed.
    const stock = await stockBackToChoice();
    await open(T.supplies, "?view=sheet");
    const i = await colIndex("Stock Status");
    const cells = await page.evaluate((ix) => [...document.querySelectorAll("tbody tr")].map((tr) => tr.querySelectorAll("td")[ix]?.innerText.trim()).filter(Boolean), i);
    step("Stock Status back to a Choice", { stock, cells });
    if (cells.some((c) => /_/.test(c))) friction(`Stock Status shows a hidden key: ${cells.join(" | ")}`);
    if (PHASE === "breaker") {
      const removed = {};
      for (const col of [`Room ${n} 🔥`, `Room ${n}`, `Treatment area ${n}`, `Vendor ${n}`]) removed[col] = await deleteColumn(col).catch((e) => String(e).slice(0, 120));
      step("this run's columns removed (Delete column…)", removed);
      if (Object.values(removed).some((v) => v !== true)) friction(`a column this run added did not go: ${JSON.stringify(removed)}`);
    }
  }
  if (PHASE === "menu-dom") {
    await open(T.supplies, "?view=sheet");
    await page.locator("tbody tr").first().locator("td").nth(1).click({ button: "right" });
    await sleep(900);
    await page.locator("[role=menu] [role^=menuitem]").filter({ hasText: /^Row · / }).first().hover();
    await sleep(1200);
    const html = await page.evaluate(() => { const m = [...document.querySelectorAll("[role=menu]")]; return m[m.length - 1]?.outerHTML.replace(/class="[^"]*"/g, "").slice(0, 3000); });
    step("submenu dom", { html });
    await page.keyboard.press("Escape");
  }

  if (PHASE === "tidy") {
    // Columns earlier walks added and left on the test table, removed the way a person removes them.
    await open(T.supplies, "?view=sheet");
    const leftovers = (await headers()).filter((h) => /^(Bin \d{4}( \(old shelf\))?|Stock Status 🔥|(Room|Treatment area|Vendor) \d{4}( 🔥)?)$/.test(h));
    const removed = {};
    for (const col of leftovers) removed[col] = await deleteColumn(col).catch((e) => String(e).slice(0, 120));
    step("walk leftovers removed", { removed, headers_now: await headers() });
    if (Object.values(removed).some((v) => v !== true)) friction(`a leftover column did not go: ${JSON.stringify(removed)}`);
  }

  if (PHASE === "look-stock") {
    await open(T.supplies, "?view=sheet");
    const d = await columnSettings("Stock Status");
    await shot("c01-stock-status-settings");
    step("Stock Status settings", { text: (await d.innerText()).replace(/\s+/g, " ").slice(0, 1500), combos: await d.getByRole("combobox").allInnerTexts() });
    await d.getByRole("combobox").nth(1).click();
    await sleep(800);
    const options = await page.getByRole("option").allInnerTexts();
    step("Shows as offers", { options });
    const pick = options.findIndex((o) => /^(Choice|Single select|Select|Dropdown)/i.test(o.trim()));
    if (pick >= 0) {
      await page.getByRole("option").nth(pick).click();
      await sleep(1500);
      await shot("c02-shows-as-choice");
      step("after picking a choice look", { text: (await d.innerText()).replace(/\s+/g, " ").slice(0, 1800) });
    }
    await page.keyboard.press("Escape");
  }

  if (PHASE === "choicetext") {
    // A choice column changed to Text and back, with data present (the Sheet on a native table).
    const stockCells = async () => {
      const i = await colIndex("Stock Status");
      return page.evaluate((ix) => [...document.querySelectorAll("tbody tr")].map((tr) => tr.querySelectorAll("td")[ix]?.innerText.trim()).filter((t) => t !== undefined), i);
    };
    await open(T.supplies, "?view=sheet");
    step("Stock Status before", { cells: await stockCells() });
    // 1 · Text → Choice from the column's own settings: its values are offered.
    let d = await columnSettings("Stock Status");
    const shows = d.getByRole("combobox").nth(1);
    if (!/Choice/.test(await shows.innerText())) {
      await shows.click();
      await sleep(700);
      await page.getByRole("option").filter({ hasText: /^Choice/ }).first().click();
      await sleep(2500);
    }
    const offered = await d.evaluate((x) => (x.innerText.match(/Already in this column[\s\S]*?(?=\n\s*Allow other|$)/)?.[0] ?? "").replace(/\s+/g, " "));
    await shot("c03-text-to-choice-offers-values");
    step("Text → Choice offers the column's values", { offered });
    if (!/Already in this column/.test(offered)) friction("Column settings → Choice did not offer the values already in the column");
    for (const word of ["In stock", "Backordered"]) {
      const chip = d.locator("button", { hasText: new RegExp(`^\\s*${word}\\s*\\d*\\s*$`) }).first();
      if (await chip.count()) await chip.click();
      await sleep(300);
    }
    await d.getByRole("button", { name: "Save", exact: true }).click();
    const ok = page.getByRole("alertdialog").getByRole("button").filter({ hasNotText: "Cancel" });
    if (await ok.count().catch(() => 0)) await ok.first().click().catch(() => {});
    await sleep(5000);
    const asChoice = await stockCells();
    await shot("c04-now-a-choice");
    step("now a Choice", { cells: asChoice, popups: await popups() });
    if (asChoice.some((c) => /_/.test(c))) friction(`a choice cell shows a key: ${asChoice.join(" | ")}`);
    // 2 · Choice → Text from Configure Table (the breaker's route): the words stay words.
    await page.locator('[aria-label="Table settings"]').click();
    const cfg = page.getByRole("dialog").filter({ hasText: "Configure Table" });
    await cfg.waitFor({ timeout: 20000 });
    await sleep(1500);
    const fieldIdx = await cfg.evaluate((x) =>
      [...x.querySelectorAll("input")].filter((i) => i.type === "text" || !i.getAttribute("type")).findIndex((i) => i.value === "Stock Status"),
    );
    await cfg.getByRole("combobox").nth(fieldIdx * 2 + 1).click();
    await sleep(600);
    await page.getByRole("option", { name: /^Text/ }).first().click();
    await sleep(600);
    await cfg.getByRole("button", { name: /Save Changes/ }).click().catch(() => {});
    const ok2 = page.getByRole("alertdialog").getByRole("button").filter({ hasNotText: "Cancel" });
    if (await ok2.count().catch(() => 0)) await ok2.first().click().catch(() => {});
    await sleep(6000);
    await page.keyboard.press("Escape");
    await open(T.supplies, "?view=sheet");
    const asText = await stockCells();
    await shot("c05-choice-to-text-keeps-words");
    step("Choice → Text", { cells: asText });
    if (asText.some((c) => /_/.test(c))) friction(`changed to Text, a cell reads a hidden key: ${asText.join(" | ")}`);
    // 3 · and back to a Choice, so the table ends as it began
    d = await columnSettings("Stock Status");
    await d.getByRole("combobox").nth(1).click();
    await sleep(700);
    await page.getByRole("option").filter({ hasText: /^Choice/ }).first().click();
    await sleep(2500);
    const addAll = d.getByRole("button", { name: /^Add all/ });
    if (await addAll.count()) await addAll.first().click();
    await sleep(400);
    await d.getByRole("button", { name: "Save", exact: true }).click();
    const ok3 = page.getByRole("alertdialog").getByRole("button").filter({ hasNotText: "Cancel" });
    if (await ok3.count().catch(() => 0)) await ok3.first().click().catch(() => {});
    await sleep(5000);
    const back = await stockCells();
    await shot("c06-back-to-a-choice");
    step("back to a Choice", { cells: back });
    if (back.some((c) => /_/.test(c))) friction(`back to a Choice, a cell shows a key: ${back.join(" | ")}`);
  }

  if (PHASE === "toolbar") {
    // The Sheet's toolbar row: no control drawn over another, none cut off, at 1600 and 1280.
    for (const width of [1600, 1280]) {
      await open(T.supplies, "?view=sheet", { width });
      if (!(await page.locator("[data-sheet-layout]").count())) {
        await page.getByRole("button", { name: "Sheet", exact: true }).first().click();
        await until("the Sheet", async () => (await page.locator("[data-sheet-layout]").count()) > 0, 60000);
        await sleep(2500);
      }
      const report = await page.evaluate(() => {
        const table = document.querySelector("thead");
        const top = table ? table.getBoundingClientRect().top : 200;
        const els = [...document.querySelectorAll("button, [role=combobox], input")]
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 4 && r.height > 4 && r.bottom < top && r.top > 40)
          // records-ui keeps an invisible place for the view's look controls so the row never jumps.
          .filter(({ el }) => !el.closest("[aria-hidden=true]") && getComputedStyle(el).visibility !== "hidden");
        const clipped = [];
        for (const { el, r } of els) {
          let p = el.parentElement;
          while (p && p !== document.body) {
            const s = getComputedStyle(p);
            if (/(hidden|auto|scroll|clip)/.test(s.overflowX)) {
              const pr = p.getBoundingClientRect();
              if (r.left < pr.left - 1 || r.right > pr.right + 1) clipped.push({ what: (el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30), left: Math.round(r.left), right: Math.round(r.right), box: [Math.round(pr.left), Math.round(pr.right)], scrollLeft: p.scrollLeft });
              break;
            }
            p = p.parentElement;
          }
        }
        const overlaps = [];
        for (let i = 0; i < els.length; i++)
          for (let j = i + 1; j < els.length; j++) {
            const a = els[i], b = els[j];
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
            const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
            const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
            if (w > 2 && h > 2) overlaps.push([(a.el.innerText || a.el.getAttribute("aria-label") || "").trim().slice(0, 24), (b.el.innerText || b.el.getAttribute("aria-label") || "").trim().slice(0, 24), Math.round(w)]);
          }
        // A control with no words, no name and nothing drawn is a dead one.
        const nameless = els
          .filter(({ el }) => el.tagName === "BUTTON" && !(el.innerText || "").trim() && !el.getAttribute("aria-label") && !el.getAttribute("title") && !el.querySelector("svg"))
          .map(({ el }) => ({ html: el.outerHTML.slice(0, 400), parent: el.parentElement?.outerHTML.slice(0, 200) }));
        return { controls: els.map(({ el, r }) => `${(el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 18)}@${Math.round(r.left)}-${Math.round(r.right)}`), overlaps, clipped, nameless };
      });
      await shot(`t01-sheet-toolbar-${width}`);
      step(`the Sheet toolbar at ${width}`, report);
      if (report.overlaps.length) friction(`${width}: toolbar controls drawn over each other: ${JSON.stringify(report.overlaps)}`);
      if (report.clipped.length) friction(`${width}: toolbar controls cut off: ${JSON.stringify(report.clipped)}`);
      if (report.nameless.length) friction(`${width}: a toolbar control with no words, name or icon: ${JSON.stringify(report.nameless)}`);
    }
  }
} catch (e) {
  out.error = String(e?.stack ?? e).slice(0, 1500);
  console.log("WALK ERROR", out.error);
  await shot(`${PHASE}-error`).catch(() => {});
}
out.finished = new Date().toISOString();
writeFileSync(join(SHOTS, `walk-${PHASE}.json`), JSON.stringify(out, null, 2));
console.log(`\n${PHASE}: ${out.steps.length} steps, ${out.frictions.length} frictions, ${out.console_errors.length} console errors${out.error ? ", STOPPED" : ""}`);
await browser.close();
