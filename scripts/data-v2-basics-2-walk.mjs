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
page.on("console", (m) => {
  if (m.type() !== "error") return;
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
    const before = (await rowTexts()).slice(0, 3);
    const itemCell = await cellOf("Nitrile gloves, medium", "Item");
    await itemCell.dblclick();
    await sleep(500);
    await page.keyboard.press("Home");
    await page.keyboard.type("Z ", { delay: 20 });
    await page.keyboard.press("Enter");
    await sleep(2500);
    const after = (await rowTexts()).slice(0, 3);
    await shot("o02-edit-resorts");
    step("sorted by Item, an edit re-sorts", { before, after, url: page.url().replace(ORIGIN, "") });
    if (!after[after.length - 1]?.startsWith("Z Nitrile") && !(await rowTexts()).slice(0, 4).some((t, i, a) => i === a.length - 1 && t.startsWith("Z "))) {
      const all = await rowTexts();
      if (all.findIndex((t) => t.startsWith("Z Nitrile")) !== all.filter((t) => !/^Add row/.test(t)).length - 1) friction(`the edited row did not re-sort to the end: ${all.join(" | ")}`);
    }
    // put it back
    const back = await cellOf("Z Nitrile gloves, medium", "Item");
    if (await back.count()) {
      await back.dblclick();
      await sleep(400);
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("Nitrile gloves, medium", { delay: 10 });
      await page.keyboard.press("Enter");
      await sleep(1500);
    }

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
    const r3 = await nudgeRound("Foam rollers", "Stock Status", "Backordered");
    step("nudge on the native table", r3);
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
    if (!/Backordered/.test(added)) friction(`after Add the cell reads "${added}"`);

    // ── 5 · a new row takes the column's default (Arman's defect) — in the Sheet layout ───────
    await page.getByRole("button", { name: "Sheet", exact: true }).first().click();
    await until("the Sheet", async () => (await page.locator("[data-sheet-layout]").count()) > 0, 60000);
    await sleep(2500);
    await page.getByRole("button", { name: /^Row$/ }).first().click();
    const form = page.getByRole("dialog").filter({ hasText: "Add New Row" });
    await form.waitFor({ timeout: 20000 });
    await sleep(1500);
    const prefilled = await form.innerText();
    await form.locator("#title").fill("Pinch gauges (set of 3)");
    await form.getByRole("button", { name: "Add Row", exact: true }).click();
    await sleep(4000);
    const newRow = (await rowTexts()).find((t) => t.includes("Pinch gauges")) ?? null;
    await shot("o06-row-takes-default");
    step("a new row takes the default", { form_shows_default: /In stock/.test(prefilled), row: newRow });
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

    // ── 7 · colours: colour by Stock Status, Cancel puts it back ───────────────────────────────
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
    step("colour by Stock Status, then Cancel", { tinted_while_open: tinted, tinted_after_cancel: untinted });
    if (untinted > 0) friction("Cancel on Table colors left the rows tinted");

    // ── 8 · a type change and its Undo (on the moved table) ────────────────────────────────────
    await open(T.orders);
    d = await columnSettings("Operatory");
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
    await s.dblclick();
    await sleep(600);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Gym B (east wall)", { delay: 15 });
    await page.keyboard.press("Enter");
    await sleep(2500);
    const now = (await (await cellOf("Foam rollers", "Room")).innerText()).trim();
    step("a member shared as editor edits a cell", { cell: now, popups: await popups() });
    if (!/east wall/.test(now)) friction(`the editor's edit did not land: "${now}"`);
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
    if (PHASE === "breaker") {
    // B-F5/F7: rename, then add the old name; an emoji name beside a real one
    d = await columnSettings("Room");
    await d.locator("#col-name").fill("Treatment area");
    await d.getByRole("button", { name: "Save", exact: true }).click();
    await sleep(3000);
    for (const name of ["Room", "Stock Status 🔥"]) {
      await page.getByRole("button", { name: /^Column$/ }).first().click();
      const add = page.getByRole("dialog").filter({ hasText: "Add New Column" });
      await add.waitFor({ timeout: 20000 });
      await add.getByPlaceholder("e.g. Total Revenue").fill(name);
      await add.getByRole("button", { name: "Add Column", exact: true }).click();
      await sleep(4000);
      step(`B-F5/F7 add "${name}"`, { headers: await headers(), popups: await popups() });
      if (!(await headers()).some((h) => h.startsWith(name.replace(" 🔥", "")))) friction(`"${name}" did not appear`);
      await page.keyboard.press("Escape");
    }
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
    await page.getByRole("button", { name: /^Column$/ }).first().click();
    const add = page.getByRole("dialog").filter({ hasText: "Add New Column" });
    await add.waitFor({ timeout: 20000 });
    await add.getByPlaceholder("e.g. Total Revenue").fill("Supplier");
    await add.getByRole("combobox").nth(1).click();
    await sleep(500);
    await page.getByRole("option", { name: /^Choice/ }).first().click();
    await sleep(600);
    await add.getByRole("button", { name: "Add Column", exact: true }).click();
    await sleep(4000);
    d = await columnSettings("Supplier");
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
