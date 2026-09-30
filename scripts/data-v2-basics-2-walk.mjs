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
  // The header whose words ARE the column's name — "Bin 12" must never open "Bin 12 (old shelf)".
  const exact = new RegExp(`^\\s*${col.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[↑↓]?\\s*$`);
  await page.locator("thead th", { hasText: exact }).first().click({ button: "right" });
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

  if (PHASE === "look-home") {
    await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 300000 });
    await unpark();
    await sleep(8000);
    if (await page.getByText("An organization is needed").count()) {
      await page.getByRole("button", { name: "Choose organization" }).last().click();
      await sleep(1500);
      const pick = page.locator("[data-radix-popper-content-wrapper]").getByText("Cedar Ridge Physical Therapy", { exact: true }).first();
      step("org choices", { found: await pick.count() });
      await pick.click().catch(() => {});
      await sleep(6000);
    }
    await shot("h01-data-home");
    step("data home", { buttons: (await page.getByRole("button").allInnerTexts()).map((b) => b.trim()).filter(Boolean).slice(0, 40) });
    const nt = page.getByRole("button", { name: /^New table/ }).first();
    if (await nt.count()) {
      await nt.click();
      await sleep(2500);
      await shot("h02-new-table");
      step("new table dialog", { text: (await page.getByRole("dialog").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 800) });
      await page.keyboard.press("Escape");
    }
  }

  if (PHASE === "archive") {
    // BREAKER-1 B-F13: archive a 120-record table (three passes), reload in the middle, carry on, Undo.
    // The table is the one this walk imported from scripts/fixtures/stock-count-march.csv.
    const tid = process.env.TABLE ?? "87013986-e75a-44e7-bc4a-124640c991d5";
    const openSettings = async () => {
      await open(tid);
      await page.getByRole("button", { name: "Table menu" }).first().click();
      await sleep(1200);
      const items = await page.locator("[role=menu] [role^=menuitem]").allInnerTexts();
      step("table menu", { items: items.slice(0, 40) });
      const settings = page.locator("[role=menu] [role^=menuitem]").filter({ hasText: /^Settings|Table settings/ }).first();
      if (await settings.count()) await settings.click();
      await sleep(3000);
    };
    // A table left archived by an earlier stopped run is brought back the way a person does.
    await page.goto(`${ORIGIN}/data-v2/${tid}`, { waitUntil: "domcontentloaded", timeout: 300000 });
    await sleep(6000);
    if (await page.getByText("This table is archived").count()) {
      await page.getByRole("button", { name: "Bring it back" }).click();
      await sleep(6000);
      step("brought back from the archived page", { text: (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200) });
    }
    // The run's second pass is held for 12 s, so the reload lands in the middle of it, as a person's would.
    let passes = 0;
    await page.route("**/rpc/table_archive", async (route) => {
      const body = route.request().postData() ?? "";
      if (/"p_chunk":\s*[1-9]/.test(body)) {
        passes += 1;
        if (passes === 2) await new Promise((r) => setTimeout(r, 12000));
      }
      await route.continue().catch(() => {});
    });
    const state = async () => ((await page.locator("[data-archive-state]").first().textContent().catch(() => null)) ?? "").trim();
    const buttonNamed = (name) => page.getByRole("button", { name, exact: true });
    await openSettings();
    await buttonNamed("Archive this table").first().click();
    await until("the confirm", async () => (await state()) !== "", 20000);
    await shot("a02-archive-confirm");
    step("the confirm", { confirm: (await page.locator("[data-archive-confirm]").first().textContent().catch(() => "")), state: await state() });
    if (!/Its 120 records go with it/.test(await state())) friction(`the confirm does not say how many records go: "${await state()}"`);
    // Second press, then a reload while the passes run.
    await buttonNamed("Archive this table").last().click();
    await until("a first pass", async () => /put away/.test(await state()), 20000);
    const during = await state();
    await shot("a03-archiving");
    await page.unroute("**/rpc/table_archive");
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(2000);
    await openSettings();
    await until("the settings", async () => (await state()) !== "", 30000);
    const after = await state();
    const carry = await buttonNamed("Carry on archiving").count();
    await shot("a04-after-reload");
    step("reload in the middle of the run", { during, after, carry_on_offered: carry });
    if (!/started and not finished/.test(after) || !carry) friction(`after a reload mid-run the page did not offer to carry on: "${after}" (carry on ${carry})`);
    if (carry) {
      await buttonNamed("Carry on archiving").first().click();
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: /is archived/ });
      await until("the archived toast", async () => (await toast.count()) > 0, 60000);
      const said = (await toast.first().innerText().catch(() => "")).replace(/\s+/g, " ");
      await shot("a05-archived-with-undo");
      step("archived", { toast: said, url: page.url().replace(ORIGIN, "") });
      if (!/Undo/.test(said)) friction(`the archived notice offers no Undo: "${said}"`);
      await toast.first().getByRole("button", { name: "Undo" }).click().catch(() => {});
      const back = page.locator("[data-sonner-toast]").filter({ hasText: /is back/ });
      await until("the restored toast", async () => (await back.count()) > 0, 60000);
      await shot("a06-undo-brings-it-back");
      step("Undo", { toast: (await back.first().innerText().catch(() => "")).replace(/\s+/g, " ") });
      if (!(await back.count())) friction("Undo on the archived notice did not bring the table back");
      await open(`${tid}?grid=merged`);
      const footer = await page.evaluate(() => document.body.innerText.match(/\d+[–-]\d+ of [\d,]+/)?.[0] ?? null);
      step("the table is back, every record in it", { footer });
      if (!/of 120/.test(footer ?? "")) friction(`after Undo the table reads ${footer}`);
    }
  }

  if (PHASE === "paging") {
    // A native table of 120 records in the records-ui grid: what is asked, what is shown.
    const asked = [];
    page.on("request", (r) => { if (/\/rpc\/read_/.test(r.url())) asked.push({ url: r.url().replace(/^.*\/rpc\//, ""), body: (r.postData() ?? "").slice(0, 400) }); });
    await open(process.env.TABLE ?? "87013986-e75a-44e7-bc4a-124640c991d5");
    await sleep(3000);
    const shown = await rowTexts();
    const footer = await page.evaluate(() => document.body.innerText.match(/\d+[–-]\d+ of [\d,]+|Unknown total|of [\d,]+ (rows|records)/g));
    await shot("p01-paging");
    step("120 records in the grid", { first: shown.slice(0, 3), last: shown.slice(-2), shown: shown.length, footer, asked: asked.slice(0, 6) });
  }

  if (PHASE === "breaker2") {
    // BREAKER-2's steps, re-run on a fresh "Patient Visit Tracker" built through the page's own UI.
    const n = String(Date.now()).slice(-4);
    let tid = process.env.TABLE ?? null;
    if (!tid) {
      const name = `Patient Visit Tracker ${n}`;
      await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 300000 });
      await unpark();
      await sleep(6000);
      if (await page.getByText("An organization is needed").count()) {
        await page.getByRole("button", { name: "Choose organization" }).last().click();
        await sleep(1500);
        await page.locator("[data-radix-popper-content-wrapper]").getByText("Cedar Ridge Physical Therapy", { exact: true }).first().click();
        await sleep(6000);
      }
      await page.getByRole("button", { name: /^New table/ }).first().click();
      await sleep(1200);
      await page.getByPlaceholder("Table name").fill(name);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await until("the new table", async () => /\/data-v2\/[0-9a-f-]{36}/.test(page.url()), 60000);
      tid = page.url().match(/\/data-v2\/([0-9a-f-]{36})/)?.[1];
      step("made the table", { name, tid });

    }
    step("the table", { tid });
    await open(tid, "?view=sheet");
    if (!(await page.locator("[data-sheet-layout]").count())) {
      await page.getByRole("button", { name: "Sheet", exact: true }).first().click().catch(() => {});
      await until("the Sheet", async () => (await page.locator("[data-sheet-layout]").count()) > 0, 60000);
      await sleep(2500);
    }
    const addDialog = async (colName) => {
      await page.getByRole("button", { name: /^Column$/ }).first().click();
      const dlg = page.getByRole("dialog").filter({ hasText: "Add New Column" });
      await dlg.waitFor({ timeout: 20000 });
      await dlg.getByPlaceholder("e.g. Total Revenue").fill(colName);
      return dlg;
    };
    const showsAs = async (dlg, look) => {
      await dlg.getByRole("combobox").nth(1).click();
      await sleep(500);
      await page.getByRole("option", { name: new RegExp(`^${look}`) }).first().click();
      await sleep(600);
    };
    const addChoices = async (dlg, words) => {
      for (const w of words) {
        await dlg.getByPlaceholder("Add an option…").fill(w);
        await page.keyboard.press("Enter");
        await sleep(250);
      }
    };
    const said = async (dlg) => ((await dlg.locator("[data-default-problem], .text-destructive").allInnerTexts()).join(" | ")).replace(/\s+/g, " ");
    const addWith = async (colName, look, extra) => {
      const dlg = await addDialog(colName);
      if (look) await showsAs(dlg, look);
      if (extra) await extra(dlg);
      await dlg.getByRole("button", { name: "Add Column", exact: true }).click();
      await sleep(4500);
      await page.keyboard.press("Escape").catch(() => {});
    };
    await addWith("Visit Status", "Choice", (d) => addChoices(d, ["Scheduled", "Checked in", "Completed", "No-show"]));
    await addWith("Body Areas", "Multi-choice", (d) => addChoices(d, ["Neck", "Shoulder", "Knee"]));
    await addWith("Copay", "Currency");
    await addWith("Insurance Verified", "Yes / No");
    let dtype = null;
    await addWith("Visit Date", "Date", async (d) => {
      dtype = (await d.getByRole("combobox").nth(0).innerText()).trim();
    });
    step("B2-06 Shows as Date makes a date column", { data_type_became: dtype });
    if (!/Date/.test(dtype ?? "")) friction(`Shows as Date left the column storing ${dtype}`);
    // B2-01 / B2-14: a default the column cannot hold is said as it is typed, never sent
    {
      const dlg = await addDialog("Sessions Prescribed");
      await showsAs(dlg, "Whole number");
      await dlg.locator("#defaultValue").fill("abc");
      await sleep(400);
      const problem = await said(dlg);
      await dlg.getByRole("button", { name: "Add Column", exact: true }).click();
      await sleep(1500);
      const stillOpen = await dlg.isVisible();
      await dlg.locator("#defaultValue").fill("12");
      await sleep(300);
      const cleared = await said(dlg);
      await shot("r01-default-said-as-typed");
      await dlg.getByRole("button", { name: "Add Column", exact: true }).click();
      await sleep(4500);
      step("B2-01 a default the column cannot hold", { problem, stayed_open: stillOpen, after_12: cleared });
      if (!/cannot|not one|holds/.test(problem) || !stillOpen) friction(`the default "abc" was not refused as it was typed: ${problem}`);
    }
    // B2-08 / B2-09 / B2-18: names
    {
      const probes = {};
      for (const bad of ["   ", "Visit  Status", "id", "x".repeat(120)]) {
        const dlg = await addDialog(bad);
        await sleep(400);
        probes[bad.length > 20 ? "120 letters" : JSON.stringify(bad)] = await said(dlg);
        await page.keyboard.press("Escape");
        await sleep(500);
      }
      step("B2-08/09/17/18 names said as they are typed", probes);
      for (const [k, v] of Object.entries(probes)) if (!v) friction(`the name ${k} was not refused as it was typed`);
    }
    // + Row: Sessions Prescribed starts at 12
    await page.getByRole("button", { name: /^Row$/ }).first().click();
    const form = page.getByRole("dialog").filter({ hasText: "Add New Row" });
    await form.waitFor({ timeout: 20000 });
    await sleep(1200);
    await form.locator("#title").fill("Grace Kim");
    await form.getByRole("button", { name: "Add Row", exact: true }).click();
    await sleep(4000);
    const grace = (await rowTexts()).find((r) => r.includes("Grace Kim")) ?? "";
    step("B2-01 a new row takes the default", { row: grace });
    if (!/12/.test(grace)) friction(`the new row does not carry the default 12: ${grace}`);
    // B2-02 / B2-03: paste
    {
      await page.getByRole("button", { name: /^Paste$/ }).first().click();
      const dlg = page.getByRole("dialog").filter({ hasText: /Paste Rows|Confirm Pasted Rows/ });
      await dlg.waitFor({ timeout: 20000 });
      const tsv = ["Title\tVisit Status\tBody Areas\tCopay\tInsurance Verified",
        "Mateo Álvarez\tcompleted\tNeck, Shoulder\t$30\tYes",
        "Siobhán O'Neill\tScheduled\tKnee, Ankle\t$25.50\tno",
        "Priya Raman\tRescheduled\tHip\tthirty\tYes"].join("\n");
      await dlg.locator("#pasteData").fill(tsv);
      await dlg.getByRole("button", { name: "Parse", exact: true }).click();
      await sleep(2000);
      const text = (await dlg.innerText()).replace(/\s+/g, " ");
      await shot("r02-paste-one-question");
      step("B2-02/03 the paste reads each cell and asks one question", {
        unreadable: text.match(/\d+ cells? cannot be read[^]*?(?=\d+ words?|Preview)/)?.[0]?.slice(0, 300) ?? null,
        question: text.match(/\d+ words? (is|are) not (a )?choices? yet[^]*?(?=Add them|Preview)/)?.[0]?.slice(0, 300) ?? null,
      });
      if (!/not (a )?choices? yet/.test(text)) friction("the paste did not ask about its new choice words");
      await dlg.getByRole("button", { name: /Add (them|it) and paste/ }).click();
      await sleep(6000);
      const report = (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ");
      await shot("r03-paste-report");
      step("the paste landed", { report: report.match(/Pasted \d+ of \d+[^]{0,200}/)?.[0] ?? report.slice(0, 200) });
      await page.getByRole("button", { name: /^Done$/ }).first().click().catch(() => page.keyboard.press("Escape"));
      await sleep(3000);
      const rows = await rowTexts();
      step("pasted rows", { rows: rows.filter((r) => /Mateo|Siobh|Priya/.test(r)) });
      if (rows.filter((r) => /Mateo|Siobh|Priya/.test(r)).length < 3) friction(`not every pasted row landed: ${rows.join(" | ")}`);
    }
    // B2-04: several choices, a new word, a click elsewhere
    {
      const c = await cellOf("Grace Kim", "Body Areas");
      await c.click();
      await sleep(500);
      await c.click();
      await sleep(1200);
      await shot("r04a-list-open");
      step("focus when the list opened", { active: await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName} ${a.getAttribute("placeholder") ?? ""} ${a.getAttribute("aria-label") ?? ""} ${a.getAttribute("data-grid-type-catcher") !== null ? "catcher" : ""}` : null; }) });
      await page.keyboard.type("Elbow", { delay: 40 });
      await sleep(500);
      await shot("r04b-typed");
      await page.keyboard.press("Enter");
      await sleep(800);
      await shot("r04c-picked");
      // A click on a cell the open list does not cover: the Title of another row.
      await page.locator("tbody tr").first().locator("td").nth(1).click({ position: { x: 20, y: 10 } });
      await sleep(2000);
      const ask = await page.locator("[data-matrx-choice-nudge]").allInnerTexts();
      await shot("r04-several-choices-asks");
      step("B2-04 several choices ask on click-off", { ask: ask.join(" | ").replace(/\s+/g, " ") });
      if (!ask.some((a) => /Elbow/.test(a))) friction("a new word in a several-choice cell was not asked about on click-off");
      await page.locator("[data-matrx-choice-nudge] button", { hasText: "Add" }).first().click().catch(() => {});
      await sleep(2500);
    }
    // B2-10: fast typing
    {
      const c = await cellOf("Priya", "Title");
      await c.click();
      await sleep(300);
      await page.keyboard.type("Alpha0", { delay: 30 });
      await page.keyboard.press("Enter");
      await sleep(3000);
      const got = (await rowTexts()).find((r) => /Alpha0/.test(r)) ?? null;
      step("B2-10 typing at 30 ms a key", { row: got });
      if (!got || !/(^|\s)Alpha0(\s|$)/.test(got)) friction(`fast typing did not land whole: ${got}`);
    }
    // B2-05 / B2-15: Visit Status to Text and back keeps its list; Body Areas to Text keeps its words
    {
      let d = await columnSettings("Body Areas");
      await d.getByRole("combobox").nth(0).click();
      await sleep(400);
      await page.getByRole("option", { name: "Text", exact: true }).first().click();
      await sleep(400);
      await d.getByRole("button", { name: "Save", exact: true }).click();
      await sleep(1200);
      await page.getByRole("button", { name: "Change type", exact: true }).click().catch(() => {});
      await sleep(5000);
      const body = (await rowTexts()).find((r) => /Mateo/.test(r)) ?? "";
      step("B2-05 Body Areas to Text", { mateo: body, popups: await popups() });
      if (!/Neck, Shoulder/.test(body)) friction(`Body Areas as Text reads: ${body}`);
    }
    out.breaker2_table = tid;
  }

  if (PHASE === "home-error") {
    const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 3000)); });
    await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 300000 });
    await sleep(8000);
    if (await page.getByText("An organization is needed").count()) {
      await page.getByRole("button", { name: "Choose organization" }).last().click();
      await sleep(1500);
      await page.locator("[data-radix-popper-content-wrapper]").getByText("Cedar Ridge Physical Therapy", { exact: true }).first().click();
      await sleep(10000);
    }
    await shot("h03-home");
    step("home errors", { errs: errs.filter((e) => /RecordsProvider/.test(e)).slice(0, 1) });
  }

  if (PHASE === "look-org-tables") {
    await page.goto(`${ORIGIN}/organizations/cedar-ridge-physical-therapy/tables`, { waitUntil: "domcontentloaded", timeout: 300000 });
    await sleep(12000);
    await shot("h04-org-tables");
    step("org tables", { buttons: (await page.getByRole("button").allInnerTexts()).map((b) => b.trim()).filter(Boolean).slice(0, 30) });
  }

  if (PHASE === "look-switch") {
    await open(T.supplies, "?view=sheet");
    await page.getByRole("button", { name: /Switch table/ }).first().click();
    await sleep(2000);
    await shot("h05-switch");
    step("switch menu", { text: (await page.locator("[role=menu],[role=dialog],[data-radix-popper-content-wrapper]").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 600) });
  }

  if (PHASE === "multi") {
    await open(process.env.TABLE, "?view=sheet");
    // B2-04: several choices, a new word, a click elsewhere
    {
      const c = await cellOf("Grace Kim", "Body Areas");
      await c.click();
      await sleep(500);
      await c.click();
      await sleep(1200);
      await shot("r04a-list-open");
      step("focus when the list opened", { active: await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName} ${a.getAttribute("placeholder") ?? ""} ${a.getAttribute("aria-label") ?? ""} ${a.getAttribute("data-grid-type-catcher") !== null ? "catcher" : ""}` : null; }) });
      await page.keyboard.type("Elbow", { delay: 40 });
      await sleep(500);
      await shot("r04b-typed");
      await page.keyboard.press("Enter");
      await sleep(800);
      await shot("r04c-picked");
      // A click on a cell the open list does not cover: the Title of another row.
      await page.locator("tbody tr").first().locator("td").nth(1).click({ position: { x: 20, y: 10 } });
      await sleep(2000);
      const ask = await page.locator("[data-matrx-choice-nudge]").allInnerTexts();
      await shot("r04-several-choices-asks");
      step("B2-04 several choices ask on click-off", { ask: ask.join(" | ").replace(/\s+/g, " ") });
      if (!ask.some((a) => /Elbow/.test(a))) friction("a new word in a several-choice cell was not asked about on click-off");
      await page.locator("[data-matrx-choice-nudge] button", { hasText: "Add" }).first().click().catch(() => {});
      await sleep(2500);
    }
  }

  if (PHASE === "b205") {
    await open(process.env.TABLE, "?view=sheet");
    const d = await columnSettings("Body Areas");
    step("Body Areas settings", { text: (await d.innerText()).replace(/\s+/g, " ").slice(0, 500), combos: await d.getByRole("combobox").allInnerTexts() });
    await d.getByRole("combobox").nth(0).click();
    await sleep(500);
    step("Stores offers", { options: await page.getByRole("option").allInnerTexts() });
    await page.getByRole("option", { name: "Text", exact: true }).first().click();
    await sleep(500);
    await d.getByRole("button", { name: "Save", exact: true }).click();
    await sleep(2000);
    await shot("r05a-after-save");
    step("after Save", { dialogs: await popups(), toasts: await page.locator("[data-sonner-toast], li[role=status]").allInnerTexts() });
    const change = page.getByRole("button", { name: "Change type", exact: true });
    if (await change.count()) {
      await change.click();
      await sleep(6000);
    }
    await shot("r05b-after-change");
    step("after Change type", { rows: (await rowTexts()).slice(0, 4), toasts: await page.locator("[data-sonner-toast], li[role=status]").allInnerTexts() });
  }

  if (PHASE === "b215") {
    await open(process.env.TABLE, "?view=sheet");
    const looks = async (col, look) => {
      const d = await columnSettings(col);
      await d.getByRole("combobox").nth(1).click();
      await sleep(600);
      await page.getByRole("option").filter({ hasText: new RegExp(`^${look}`) }).first().click();
      await sleep(1500);
      await d.getByRole("button", { name: "Save", exact: true }).click();
      await sleep(1200);
      const ok = page.getByRole("alertdialog").getByRole("button").filter({ hasNotText: "Cancel" });
      if (await ok.count().catch(() => 0)) await ok.first().click().catch(() => {});
      await sleep(5000);
    };
    if (!process.env.ONLY_RELATION) {
    await looks("Visit Status", "Text");
    const asText = (await rowTexts()).slice(0, 4);
    await looks("Visit Status", "Choice");
    const d = await columnSettings("Visit Status");
    const choices = await d.locator('input[aria-label="Option value"]').evaluateAll((xs) => xs.map((x) => x.value));
    await shot("r06-choice-list-kept");
    step("B2-15 Visit Status to Text and back keeps its list", { as_text: asText, choices_after: choices });
    if (!choices.includes("No-show")) friction(`the list did not come back whole: ${choices.join(", ")}`);
    await page.keyboard.press("Escape");
    await sleep(800);
    }
    // B2-07: a Relation says which table it points at
    await page.getByRole("button", { name: /^Column$/ }).first().click();
    const add = page.getByRole("dialog").filter({ hasText: "Add New Column" });
    await add.waitFor({ timeout: 20000 });
    await add.getByPlaceholder("e.g. Total Revenue").fill("Referring Clinic");
    await add.getByRole("combobox").nth(1).click();
    await sleep(500);
    await page.getByRole("option", { name: /^Relation/ }).first().click();
    await sleep(2500);
    const pointsAt = add.getByRole("combobox", { name: "Points at the records of" });
    await until("Points at", async () => (await pointsAt.count()) > 0 || /no other table/.test(await add.innerText()), 30000);
    const offered = await pointsAt.count();
    step("the Points-at control", { offered, text: (await add.innerText()).replace(/\s+/g, " ").match(/Points at[^]{0,120}/)?.[0] ?? null });
    if (offered) {
      await pointsAt.click();
      await sleep(600);
      await page.getByRole("option", { name: "Clinic Supplies Count", exact: true }).first().click();
      await sleep(500);
    }
    await shot("r07-relation-points-at");
    await add.getByRole("button", { name: "Add Column", exact: true }).click();
    await sleep(6000);
    const toasts = await page.locator("[data-sonner-toast], ol li").allInnerTexts();
    const hs = await headers();
    step("B2-07 a Relation column", { picker_offered: offered, headers: hs, toasts: toasts.filter((x) => /relation|Referring/i.test(x)).slice(0, 2) });
    if (!offered || !hs.includes("Referring Clinic") || toasts.some((x) => /not as relation/i.test(x))) friction("the Relation column was not made with its table");
  }

  if (PHASE === "b3") {
    // BREAKER-3's app-side findings, walked on the lane's own table (TABLE), through the page's UI.
    const n = String(Date.now()).slice(-4);
    await open(process.env.TABLE, "?view=sheet");
    const addDialog = async (colName) => {
      await page.getByRole("button", { name: /^Column$/ }).first().click();
      const dlg = page.getByRole("dialog").filter({ hasText: "Add New Column" });
      await dlg.waitFor({ timeout: 20000 });
      await dlg.getByPlaceholder("e.g. Total Revenue").fill(colName);
      return dlg;
    };
    const showsAs = async (dlg, look) => {
      await dlg.getByRole("combobox").nth(1).click();
      await sleep(500);
      await page.getByRole("option", { name: new RegExp(`^${look}`) }).first().click();
      await sleep(800);
    };
    const made = [];
    const cellAt = async (i, col) => page.locator("tbody tr").nth(i).locator("td").nth(await colIndex(col));
    // ── B3-14: a choice default that is none of the choices is asked ─────────────────────────
    if (!process.env.SKIP_B314) {
      const col = `Priority ${n}`;
      const dlg = await addDialog(col);
      await showsAs(dlg, "Choice");
      for (const w of ["Routine", "Urgent", "Elective"]) {
        await dlg.getByPlaceholder("Add an option…").fill(w);
        await page.keyboard.press("Enter");
        await sleep(250);
      }
      await dlg.locator("#defaultValue").fill("Rutine");
      await sleep(600);
      const asked = (await dlg.locator("[data-matrx-choice-nudge]").allInnerTexts()).join(" | ").replace(/\s+/g, " ");
      await dlg.getByRole("button", { name: "Add Column", exact: true }).click();
      await sleep(1500);
      const heldOpen = await dlg.isVisible();
      await shot("b3-14a-default-asked");
      await dlg.locator("[data-matrx-choice-nudge] button", { hasText: /^Add$/ }).first().click();
      await sleep(600);
      await dlg.getByRole("button", { name: "Add Column", exact: true }).click();
      await sleep(6000);
      made.push(col);
      const d = await columnSettings(col);
      const choices = await d.locator('input[aria-label="Option value"]').evaluateAll((xs) => xs.map((x) => x.value));
      await shot("b3-14b-choice-added");
      await page.keyboard.press("Escape");
      await sleep(800);
      step("B3-14 a choice default that is none of the choices", { asked, held_open_until_answered: heldOpen, choices_after_add: choices });
      if (!/Add "Rutine" to the choices/.test(asked) || !heldOpen || !choices.includes("Rutine")) friction("the off-list default was not asked, or Add did not make it a choice");
    }
    // ── B3-02: a Text column of comma lists changed to several choices ───────────────────────
    if (!process.env.SKIP_B302) {
      const col = `Areas ${n}`;
      const dlg = await addDialog(col);
      await dlg.getByRole("button", { name: "Add Column", exact: true }).click();
      await sleep(5000);
      made.push(col);
      const firstTitle = (await rowTexts())[0]?.split(" ")[0] ?? "";
      const c = await cellAt(0, col);
      await c.click();
      await sleep(300);
      await page.keyboard.type("Lower back, Hip", { delay: 25 });
      await page.keyboard.press("Enter");
      await sleep(3500);
      const d = await columnSettings(col);
      await d.getByRole("combobox").nth(1).click();
      await sleep(600);
      await page.getByRole("option").filter({ hasText: /^Multi-choice/ }).first().click();
      await sleep(3000);
      const offer = (await d.innerText()).replace(/\s+/g, " ").match(/Already in this column[^]{0,160}/)?.[0] ?? null;
      await shot("b3-02a-offer");
      await d.getByRole("button", { name: /^Add all/ }).first().click().catch(() => {});
      await sleep(500);
      await d.getByRole("button", { name: "Save", exact: true }).click();
      await sleep(1200);
      const ok = page.getByRole("alertdialog").getByRole("button").filter({ hasNotText: "Cancel" });
      if (await ok.count().catch(() => 0)) await ok.first().click().catch(() => {});
      await sleep(6000);
      const cellText = await (await cellAt(0, col)).innerText().catch(() => "");
      await shot("b3-02b-two-chips");
      step("B3-02 Text to Multi-choice", { first_row: firstTitle, offer, cell: cellText.replace(/\s+/g, " ") });
      if (!offer || /Lower back, Hip/.test(offer) || /\[/.test(cellText) || !/Lower back/.test(cellText) || !/Hip/.test(cellText)) friction(`comma list not split: offer=${offer} cell=${cellText}`);
    }
    // ── B3-01: a Relation cell picks records with the Grid's picker ─────────────────────────
    if (!process.env.SKIP_B301) {
      const hs = await headers();
      let rel = hs.find((h) => /^Referring Clinic/.test(h))?.replace(/\s*[↑↓]$/, "") ?? null;
      if (!rel) {
        rel = `Referring Clinic ${n}`;
        const dlg = await addDialog(rel);
        await showsAs(dlg, "Relation");
        const pointsAt = dlg.getByRole("combobox", { name: "Points at the records of" });
        await until("Points at", async () => (await pointsAt.count()) > 0, 30000);
        await pointsAt.click();
        await sleep(600);
        await page.getByRole("option", { name: "Clinic Supplies Count", exact: true }).first().click();
        await sleep(500);
        await dlg.getByRole("button", { name: "Add Column", exact: true }).click();
        await sleep(6000);
        made.push(rel);
      }
      const c = await cellAt(0, rel);
      await c.dblclick();
      await sleep(2500);
      const editor = await page.locator("[data-sheet-relation-editor]").count();
      const choiceWords = await page.getByText("No options declared yet").count();
      await shot("b3-01a-relation-editor");
      await page.locator("[data-sheet-relation-editor] button").filter({ hasText: /^(Pick|Change)$/ }).first().click().catch(() => {});
      await sleep(2500);
      const candidates = await page.locator("[data-relation-candidate]").allInnerTexts();
      await shot("b3-01b-relation-picker");
      if (candidates.length > 0) await page.locator("[data-relation-candidate]").first().click();
      await sleep(4000);
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(1500);
      const chip = await (await cellAt(0, rel)).locator("[data-sheet-reference] a, [data-records-reference-chip]").count();
      const cellWords = (await (await cellAt(0, rel)).innerText()).replace(/\s+/g, " ");
      // Typed words on a Relation cell are never offered as choices.
      const c2 = await cellAt(1, rel);
      await c2.click();
      await sleep(300);
      await page.keyboard.type("Call Sean", { delay: 30 });
      await sleep(1200);
      const offeredAsChoice = await page.getByText(/to the choices for/).count();
      await page.keyboard.press("Escape");
      await sleep(1000);
      await shot("b3-01c-relation-chip");
      step("B3-01 the Sheet's Relation cell", { records_picker: editor, choice_list_text: choiceWords, candidates: candidates.slice(0, 4), chip, cell: cellWords, typed_offered_as_choice: offeredAsChoice });
      if (!editor || choiceWords || candidates.length === 0 || !chip || offeredAsChoice) friction("the Relation cell did not pick records with the records picker and chip");
    }
    // ── B3-24: an edit made offline is kept and sent again ──────────────────────────────────
    if (!process.env.SKIP_B324) {
      const col = made.find((m) => /^Areas/.test(m)) ?? null;
      const target = col ? null : (await headers()).find((h) => /^Notes|^Title/.test(h));
      const c = await cellAt(1, "Title");
      const before = (await c.innerText()).trim();
      // The same gesture online first, so every piece of the page it needs is already loaded
      // (offline, a piece loaded on first use cannot arrive — a dev server shows its overlay).
      await c.click();
      await sleep(300);
      await page.keyboard.type(before, { delay: 20 });
      await page.keyboard.press("Enter");
      await sleep(3500);
      await (await cellAt(1, "Title")).click();
      await sleep(400);
      await page.context().setOffline(true);
      await page.keyboard.type(`${before} (offline)`, { delay: 25 });
      await page.keyboard.press("Enter");
      await sleep(4000);
      const notice = (await page.locator("[data-matrx-cell-unsent]").allInnerTexts()).join(" | ").replace(/\s+/g, " ");
      await shot("b3-24a-offline-kept");
      await page.context().setOffline(false);
      await sleep(8000);
      const after = (await page.locator("[data-matrx-cell-unsent]").count());
      await page.reload({ waitUntil: "domcontentloaded" });
      await sleep(12000);
      const stored = ((await rowTexts()).find((r) => r.includes("(offline)")) ?? null);
      await shot("b3-24b-sent-when-back");
      step("B3-24 an edit made offline", { before, notice, notice_left_after_online: after, stored_after_reload: stored, unused: target ?? null });
      if (!/Not saved yet/.test(notice) || after || !stored) friction(`offline edit: notice=${notice} after=${after} stored=${stored}`);
      // Put the title back the way a person would.
      if (stored) {
        const c3 = await cellAt(1, "Title");
        await c3.click();
        await sleep(300);
        await page.keyboard.type(before, { delay: 20 });
        await page.keyboard.press("Enter");
        await sleep(3500);
      }
    }
    // Leave the table as it was: remove the columns this walk made (Delete column…).
    const gone = {};
    for (const col of made) gone[col] = await deleteColumn(col).catch(() => false);
    step("the walk's columns removed", gone);
    out.b3_table = process.env.TABLE;
  }

  if (PHASE === "askai") {
    // BREAKER-2 B2-22 / BREAKER-3 B3-12: Gallery on a table with no file column, Ask AI.
    await open(process.env.TABLE, "?view=sheet");
    await page.goto(`${ORIGIN}/data-v2/${process.env.TABLE}?view=gallery`, { waitUntil: "domcontentloaded", timeout: 300000 });
    await until("the Ask AI offer", async () => (await page.getByRole("button", { name: "Ask AI", exact: true }).count()) > 0, 60000);
    const offer = (await page.locator("main").innerText()).replace(/\s+/g, " ").match(/[^.]*(?:no|needs)[^.]*(?:file|photo|picture|image)[^.]*\./i)?.[0] ?? null;
    await page.getByRole("button", { name: "Ask AI", exact: true }).first().click();
    await sleep(9000);
    await shot("askai-opened");
    const composer = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll("textarea, [contenteditable=true]")];
      return boxes.map((b) => (b instanceof HTMLTextAreaElement ? b.value : b.textContent ?? "").trim()).filter(Boolean);
    });
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll("[data-context-chip], [data-chip], [class*=chip]")].map((c) => c.textContent?.trim() ?? "").filter((t) => t && t.length < 60),
    );
    step("B2-22 Ask AI opens with the ask", { offer, composer, chips: [...new Set(chips)].slice(0, 8) });
    if (!composer.some((t) => t.length > 10)) friction("Ask AI opened with an empty box");
    if (chips.some((c) => /records_|Records T…|Records S…/.test(c))) friction(`Ask AI chips read as keys: ${chips.join(" | ")}`);
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
    for (const width of [1600, 1280, 390]) {
      await open(T.supplies, "?view=sheet", { width, height: width === 390 ? 844 : 1000 });
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
      const search = await page.evaluate(() => {
        const box = [...document.querySelectorAll("input")].find((i) => i.placeholder === "Search rows" || i.placeholder === "Search records");
        return box ? { width: Math.round(box.getBoundingClientRect().width), fits: box.scrollWidth <= box.clientWidth + 1 } : null;
      });
      step(`the search box at ${width}`, { search });
      if (search && search.width < 110) friction(`${width}: the search box is ${search.width}px wide and cuts its words`);
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
