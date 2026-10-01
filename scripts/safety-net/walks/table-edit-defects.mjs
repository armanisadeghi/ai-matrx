// scripts/safety-net/walks/table-edit-defects.mjs — lane TABLE-EDIT-DEFECTS (2026-10-01): the four
// table-page defects the safety net found on live (T28 click-off loses the cell, T26/T29 Undo of a type
// change keeps the new look, T02 no rename, T05 Date & time cannot be added), walked in ten minutes
// instead of tables-life's thirty. Owner seat (admin@admin.com), a disposable table in Cedar Ridge
// Physical Therapy, archived at the end.
//
//   SN_TARGET=clone SN_ORIGIN=http://table-edit-defects.localhost:3001 SN_OUT=<dir> \
//     node scripts/safety-net/walks/table-edit-defects.mjs
//   SN_TARGET=live  SN_OUT=<dir> node scripts/safety-net/walks/table-edit-defects.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { openWalk, bodyText, sleep, until, cloneRead, STAMP, TARGET, OUT } from "../lib/harness.mjs";

const ctx = await openWalk("table-edit-defects");
const TABLE_NAME = `Balance Programs ${STAMP}`;
const TABLE_RENAMED = `Balance and Gait Programs ${STAMP}`;
const R1 = "Single-leg stance";
const R2 = "Tandem walk";
const R3 = "Heel raises";
function cloneSql(sql) {
  if (TARGET !== "clone") return null;
  const r = cloneRead(sql);
  return r == null ? null : [].concat(r).join("\n");
}

let page;
let tid = null;
const probes = {};
const probe = async (label) => {
  probes[label] = await page
    .evaluate(() =>
      [...document.querySelectorAll("[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[data-radix-popper-content-wrapper],[data-matrx-choice-nudge]")]
        .map((d) => d.outerHTML.replace(/ class="[^"]*"/g, "").replace(/<svg[\s\S]*?<\/svg>/g, ""))
        .join("\n\n")
        .slice(0, 12000),
    )
    .catch((e) => String(e));
  writeFileSync(join(OUT, "table-edit-defects-probes.json"), JSON.stringify(probes, null, 2));
};
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── page helpers ─────────────────────────────────────────────────────────────────────────────────
/** The preview's walk cap parks a host another session needs; a person presses Resume, so does the walk. */
async function paused() {
  return page.url().includes("__dev-walk") || (await page.getByText("This preview was paused").count().catch(() => 0)) > 0;
}
async function unpark() {
  if (!(await paused())) return false;
  const want = page.url().includes("__dev-walk") ? null : page.url();
  await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
  await sleep(6000);
  if (want) await page.goto(want, { waitUntil: "domcontentloaded", timeout: 180000 }).catch(() => {});
  await sleep(4000);
  return true;
}
/** One step; a step the preview's pause interrupted runs once more after Resume (the pause is the tooling, not the product). */
async function step(items, label, fn) {
  let again = false;
  const r = await ctx.step(items, label, page, async () => {
    await unpark();
    let out;
    try {
      out = await fn();
    } catch (e) {
      if (!(await paused())) throw e;
      out = { ok: false, detail: `threw while paused: ${String(e?.message ?? e).slice(0, 200)}` };
    }
    if (!out?.ok && !out?.skip && (await paused())) {
      again = true;
      return { ok: false, detail: `the preview paused during the step (retried): ${out?.detail ?? ""}` };
    }
    return out;
  });
  if (!again) return r;
  ctx.results.pop();
  return ctx.step(items, `${label} (after Resume)`, page, async () => {
    await unpark();
    return fn();
  });
}
/** Open the table (Sheet by default), pressing "Try again" while the store is slow to answer. */
async function open(query = "?view=sheet", { needRows = false } = {}) {
  await ctx.goto(page, `/data-v2/${tid}${query}`);
  for (let k = 0; k < 20; k++) {
    await sleep(4000);
    if (await unpark()) await ctx.goto(page, `/data-v2/${tid}${query}`);
    const ths = await page.locator("thead th").count();
    const named = await page.evaluate(() => [...document.querySelectorAll("thead th")].some((t) => /title/i.test(t.innerText))).catch(() => false);
    if (ths > 1 && named && (!needRows || (await page.locator("tbody tr").count()) > 1)) break;
    const again = page.getByRole("button", { name: "Try again" });
    if (await again.count()) await again.first().click().catch(() => {});
  }
  await sleep(2000);
}
/** Reload the page at its own address (the view state a person built stays in it). */
async function reload() {
  const url = page.url();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until("the grid", async () => (await page.locator("tbody tr").count()) > 1 || (await unpark()), 120000);
  if (page.url() !== url) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until("the grid", async () => (await page.locator("tbody tr").count()) > 1, 120000);
  await sleep(2500);
}
/** Drag a header onto the left half of another, with the browser's own drag events. */
async function dragHeader(from, onto) {
  await page.evaluate(([a, b]) => {
    const th = (n) => [...document.querySelectorAll("thead th")].find((t) => t.innerText.replace(/[↑↓⚿]/g, "").trim() === n);
    const A = th(a);
    const B = th(b);
    if (!A || !B) return false;
    const dt = new DataTransfer();
    const r = B.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 4, clientY: r.top + r.height / 2 };
    (A.querySelector("[draggable=true]") ?? A).dispatchEvent(new DragEvent("dragstart", { ...at, clientX: A.getBoundingClientRect().left + 10 }));
    B.dispatchEvent(new DragEvent("dragenter", at));
    B.dispatchEvent(new DragEvent("dragover", at));
    B.dispatchEvent(new DragEvent("drop", at));
    (A.querySelector("[draggable=true]") ?? A).dispatchEvent(new DragEvent("dragend", at));
    return true;
  }, [from, onto]);
  await sleep(2500);
}
async function sheet() {
  if (await page.locator("[data-sheet-layout]").count()) return;
  await page.getByRole("button", { name: "Sheet", exact: true }).first().click().catch(() => {});
  await until("the Sheet", async () => (await page.locator("[data-sheet-layout]").count()) > 0, 60000);
  await sleep(2500);
}
const headers = () => page.evaluate(() => [...document.querySelectorAll("thead th")].map((t) => t.innerText.replace(/[↑↓⚿]/g, "").trim()).filter(Boolean));
const colIndex = (name) =>
  page.evaluate((n) => [...document.querySelectorAll("thead th")].findIndex((th) => (th.innerText ?? "").replace(/[↑↓⚿]/g, "").trim().toLowerCase() === n.toLowerCase()), name);
async function cellOf(row, col) {
  const i = await colIndex(col);
  if (i < 0) throw new Error(`no column "${col}" in the header (${(await headers()).join(", ")})`);
  return page.locator("tbody tr", { hasText: row }).first().locator("td").nth(i);
}
const cellText = async (row, col) => clean(await (await cellOf(row, col)).innerText().catch(() => "∅"));
const toasts = async () => clean((await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])).join(" | "));

/** Type into a cell as a person does: select it, type (a bare keystroke starts the edit), Enter. */
async function typeInto(row, col, words, { enter = true, replace = true } = {}) {
  const c = await cellOf(row, col);
  await c.click();
  await sleep(500);
  if (replace) {
    await c.dblclick();
    await sleep(500);
    await page.keyboard.press("ControlOrMeta+a");
  }
  await page.keyboard.type(words, { delay: 25 });
  await sleep(600);
  if (enter) await page.keyboard.press("Enter");
  await sleep(2500);
}

async function columnSettings(col) {
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(600);
  const exact = new RegExp(`^\\s*[⚿]?\\s*${esc(col)}\\s*[↑↓]?\\s*$`, "i");
  await page.locator("thead th", { hasText: exact }).first().click({ button: "right" });
  const cfg = page.locator('[role=menu] [data-alchemy-node="cm:x:grid-col-configure"]').first();
  await until("Column settings…", async () => (await cfg.count()) > 0, 15000);
  const items = page.locator("[role=menu] [role^=menuitem]");
  const texts = await items.allInnerTexts();
  const i = (await cfg.count()) ? 0 : -1;
  if (i < 0) {
    await probe(`header-menu-${col}`);
    await page.keyboard.press("Escape");
    throw new Error(`the header menu of "${col}" has no Column settings: ${texts.join(" | ")}`);
  }
  await cfg.click();
  const d = page.getByRole("dialog").filter({ hasText: `Column · ${col}` });
  await d.waitFor({ timeout: 20000 });
  await sleep(1200);
  return d;
}

/** Pick a look in an open "Shows as" picker (the dialog's first combobox). */
async function pickLook(dlg, look) {
  await dlg.getByRole("combobox").first().click();
  await sleep(700);
  const opt = page.getByRole("option").filter({ has: page.locator("div.font-medium", { hasText: new RegExp(`^${esc(look)}$`) }) });
  if (!(await opt.count())) {
    const all = await page.getByRole("option").allInnerTexts();
    await page.keyboard.press("Escape");
    throw new Error(`no look "${look}" on the picker: ${all.map((t) => t.split("\n")[0]).join(", ")}`);
  }
  await opt.first().click();
  await sleep(700);
}

async function addColumn(name, look, { choices = [], dflt = null, relation = false, several = false } = {}) {
  await page.getByRole("button", { name: /^Column$/ }).first().click();
  const dlg = page.getByRole("dialog").filter({ hasText: "Add New Column" });
  await dlg.waitFor({ timeout: 20000 });
  await dlg.getByPlaceholder("e.g. Total Revenue").fill(name);
  if (look !== "Text") await pickLook(dlg, look);
  for (const w of choices) {
    await dlg.getByPlaceholder("Add an option…").fill(w);
    await page.keyboard.press("Enter");
    await sleep(250);
  }
  let target = null;
  if (relation) {
    const sel = dlg.getByRole("combobox", { name: "Points at the records of" });
    await until("the tables to point at", async () => (await sel.count()) > 0, 30000);
    await sel.click();
    await sleep(700);
    const opts = page.getByRole("option");
    const names = await opts.allInnerTexts();
    // Another Cedar Ridge table with records in it; never this one.
    const pick = names.findIndex((n) => /Clinic Supplies Count/.test(n));
    const at = pick >= 0 ? pick : names.findIndex((n) => !n.includes(STAMP));
    target = names[at];
    await opts.nth(at).click();
    await sleep(500);
    if (several) await dlg.getByRole("switch", { name: "Can point at several records" }).click();
  }
  if (dflt !== null) {
    await dlg.locator("#defaultValue").fill(dflt);
    await sleep(500);
  }
  await dlg.getByRole("button", { name: "Add Column", exact: true }).click();
  const gone = await until("the dialog closes", async () => !(await dlg.isVisible().catch(() => false)), 30000);
  if (!gone.v) {
    const said = clean(await dlg.innerText().catch(() => ""));
    await page.keyboard.press("Escape");
    throw new Error(`Add Column stayed open: ${said.slice(0, 300)}`);
  }
  await until(`the "${name}" header`, async () => (await colIndex(name)) >= 0, 30000);
  await sleep(1500);
  return { target };
}

async function addRow(title) {
  await page.getByRole("button", { name: /^Row$/ }).first().click();
  const form = page.getByRole("dialog").filter({ hasText: "Add New Row" });
  await form.waitFor({ timeout: 20000 });
  await sleep(1200);
  const shown = clean(await form.innerText());
  await form.locator("#title").fill(title);
  await form.getByRole("button", { name: "Add Row", exact: true }).click();
  await until(`the row ${title}`, async () => (await page.locator("tbody tr", { hasText: title }).count()) > 0, 30000);
  await sleep(2000);
  return shown;
}

/** Open a cell's own editor the way a person does: select it, then click it again / Enter / double-click. */
async function openEditor(row, col) {
  const overlay = page.locator("[data-radix-popper-content-wrapper], [role=dialog], [role=listbox]");
  const before = await overlay.count();
  const c = await cellOf(row, col);
  const inCell = () => c.locator("[data-sheet-relation-editor], input, textarea, button, [role=combobox]").count();
  const opened = async () => (await page.locator("[cmdk-input]").count()) > 0 || (await page.getByRole("button", { name: /^Upload File$/ }).count()) > 0;
  await c.click();
  await sleep(800);
  const inBefore = await inCell();
  for (const how of ["click", "Enter", "dblclick"]) {
    if (how === "click") await c.click();
    else if (how === "Enter") await page.keyboard.press("Enter");
    else await c.dblclick();
    for (let k = 0; k < 6; k++) {
      await sleep(700);
      if ((await opened()) || (await overlay.count()) > before || (await inCell()) > inBefore) return how;
    }
  }
  return null;
}

/** The enum ask after typing an off-list word; returns { asked, keep, add, text }. */
async function askAfterTyping(row, col, word) {
  const c = await cellOf(row, col);
  await c.click();
  await sleep(500);
  await page.keyboard.type(word, { delay: 30 });
  await sleep(900);
  await page.keyboard.press("Enter");
  const ask = page.locator("[data-matrx-choice-nudge], [data-radix-popper-content-wrapper], [role=dialog], [role=alertdialog]").filter({ hasText: "to the choices for" });
  const asked = await until("the ask", async () => (await ask.count()) > 0, 10000);
  if (!asked.v) {
    await probe(`no-ask-${col}`);
    return { asked: false, ask };
  }
  return {
    asked: true,
    ask: ask.first(),
    text: clean(await ask.first().innerText()),
    keep: (await ask.first().getByRole("button", { name: "Keep as typed", exact: true }).count()) > 0,
    add: (await ask.first().getByRole("button", { name: "Add", exact: true }).count()) > 0,
  };
}

const COLS = [
  { name: "Session Notes", look: "Text", type: "Band above the knees, 3 x 12", want: /^Band above the knees, 3 x 12$/ },
  { name: "Reps", look: "Number", type: "12", want: /^12$/ },
  { name: "First Visit", look: "Date", type: "10/6/2026", want: /Oct(ober)?\s+0?6,?\s+2026|10\/0?6\/2026|2026-10-06/ },
  { name: "Next Check-in", look: "Date & time", type: "10/13/2026 9:30 AM", want: /(Oct(ober)?\s+13|10\/13).*9:30/ },
  { name: "Focus Area", look: "Choice", choices: ["Ankle", "Hip", "Trunk"], type: "Hip", want: /^Hip$/ },
];
const ONLY = (process.env.TED_ONLY ?? "T05,T28,T26,T02").split(",");

try {
  page = await ctx.page("admin");
  if (page.__org !== "Cedar Ridge Physical Therapy") throw new Error(`the account rail does not name Cedar Ridge Physical Therapy (${page.__org})`);

  await step(["T01"], "New table from the data home", async () => {
    await ctx.goto(page, "/data-v2");
    const nt = page.getByRole("button", { name: /^New table/ }).first();
    await until("New table", async () => (await nt.count()) > 0, 90000);
    await nt.click();
    await sleep(1200);
    await page.getByPlaceholder("Table name").fill(TABLE_NAME);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await until("the new table", async () => /\/data-v2\/[0-9a-f-]{36}/.test(page.url()), 120000);
    tid = page.url().match(/\/data-v2\/([0-9a-f-]{36})/)?.[1] ?? null;
    if (!tid) return { ok: false, detail: `Create did not open a table: ${page.url()}` };
    ctx.cleanup(async () => archiveIfLive("cleanup"));
    await open("");
    return { ok: (await bodyText(page, 4000)).includes(TABLE_NAME), detail: `table ${tid}` };
  });
  if (!tid) throw new Error("no table to walk");

  await open("?view=sheet");
  await sheet();
  const made = {};
  for (const c of COLS) {
    await step(c.look === "Date & time" ? ["T05"] : [], `add column "${c.name}" (${c.look})`, async () => {
      await addColumn(c.name, c.look, { choices: c.choices ?? [] });
      made[c.name] = true;
      const db = cloneSql(`select (data ->> 'type') || ' ' || coalesce(data -> 'display_format' ->> 'id', '-') from custom.record where table_id = custom.field_kernel_id() and deleted_at is null and data ->> 'entity_definition_id' = '${tid}' and data ->> 'label' = '${c.name}'`);
      return { ok: true, detail: `header present${db ? `; clone field ${db}` : ""}` };
    });
  }
  for (const r of [R1, R2, R3]) await addRow(r).catch(() => {});

  // ── T28: a typed edit ended by a click on another cell saves, every kind ──
  if (ONLY.includes("T28")) {
    for (const c of COLS) {
      if (!made[c.name]) continue;
      await step(["T28"], `click-off saves a ${c.look} cell ("${c.name}" ← ${c.type})`, async () => {
        await typeInto(R1, c.name, c.type, { enter: false });
        const held = await (await cellOf(R1, c.name)).locator("textarea, input").first().inputValue().catch(() => "(no input)");
        await (await cellOf(R3, "Title")).click();
        await sleep(3500);
        const shown = await cellText(R1, c.name);
        const said = await toasts();
        await reload();
        const now = await cellText(R1, c.name);
        return { ok: c.want.test(now), detail: `editor held "${held}"; after the click-off "${shown}"; after reload "${now}"${said ? `; notices: ${said.slice(0, 160)}` : ""}` };
      });
    }
  }

  // ── T26 / T29: Text → Number with words in it, Undo on the notice, the column is Text again ──
  if (ONLY.includes("T26")) {
    await step(["T26", "T29"], "Session Notes Text → Number, Undo: words back AND the column shows as Text", async () => {
      if ((await cellText(R2, "Session Notes")) === "—") await typeInto(R2, "Session Notes", "Pain 3/10 after the second set");
      const before = await cellText(R2, "Session Notes");
      const d = await columnSettings("Session Notes");
      await pickLook(d, "Number");
      await d.getByRole("button", { name: "Save", exact: true }).click();
      const confirm = page.getByRole("alertdialog");
      await confirm.waitFor({ timeout: 15000 });
      await confirm.getByRole("button", { name: "Change type", exact: true }).click();
      const undo = page.getByRole("button", { name: "Undo", exact: true });
      const offered = await until("Undo", async () => (await undo.count()) > 0, 20000);
      await sleep(2500);
      const whileNumber = await cellText(R2, "Session Notes");
      if (offered.v) await undo.first().click();
      await sleep(7000);
      await open("?view=sheet", { needRows: true });
      await sheet();
      const after = await cellText(R2, "Session Notes");
      const d2 = await columnSettings("Session Notes");
      const look = clean(await d2.getByRole("combobox").first().innerText());
      await d2.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => page.keyboard.press("Escape"));
      await sleep(800);
      const db = cloneSql(`select (data ->> 'type') || ' ' || coalesce(data -> 'display_format' ->> 'id', '-') from custom.record where table_id = custom.field_kernel_id() and deleted_at is null and data ->> 'entity_definition_id' = '${tid}' and data ->> 'label' = 'Session Notes'`);
      const ok = !!offered.v && after === before && /^Text/.test(look) && (db == null || /^text -$/.test(db));
      return { ok, detail: `while Number "${whileNumber}"; Undo offered ${!!offered.v}; after Undo + reload "${after}" (was "${before}"), shows as ${look}${db ? `; clone field ${db}` : ""}` };
    });
    await step(["T28"], "after that Undo, a click-off on Session Notes saves words", async () => {
      const words = "Heel-to-toe, 10 steps, twice";
      await typeInto(R3, "Session Notes", words, { enter: false });
      await (await cellOf(R1, "Title")).click();
      await sleep(3500);
      await reload();
      const now = await cellText(R3, "Session Notes");
      return { ok: now === words, detail: `after reload "${now}"` };
    });
  }

  // ── T02: rename the table from the table menu ──
  if (ONLY.includes("T02")) {
    await step(["T02"], `rename the table from the table menu → "${TABLE_RENAMED}"`, async () => {
      await open("");
      const menu = page.getByRole("button", { name: "Table menu" });
      await menu.first().click();
      await sleep(1200);
      const items = (await page.locator("[role=menu] [role^=menuitem]").allInnerTexts()).map(clean);
      const ri = items.findIndex((t) => /^Rename/i.test(t));
      if (ri < 0) {
        await page.keyboard.press("Escape");
        return { ok: false, detail: `the table menu has no Rename: ${items.join(" | ").slice(0, 300)}` };
      }
      await page.locator("[role=menu] [role^=menuitem]").nth(ri).click();
      await sleep(1200);
      const box = page.getByRole("textbox", { name: /table name/i }).first();
      if (!(await box.count())) return { ok: false, detail: `Rename opened no box named "Table name"` };
      const held = await box.inputValue();
      await box.fill(TABLE_RENAMED);
      await page.keyboard.press("Enter");
      await sleep(4000);
      await open("");
      const t = await bodyText(page, 3000);
      const db = cloneSql(`select data ->> 'name' from custom.record where id = '${tid}'`);
      return { ok: t.includes(TABLE_RENAMED), detail: `box held "${held}"; after reload the page names "${t.includes(TABLE_RENAMED) ? TABLE_RENAMED : t.includes(TABLE_NAME) ? TABLE_NAME : "neither"}"${db ? `; clone ${db}` : ""}` };
    });
  }
} catch (e) {
  await ctx.step([], "walk aborted", page ?? null, async () => ({ ok: false, detail: String(e?.message ?? e).slice(0, 400) }));
} finally {
  await ctx.finish();
}

async function archiveTable() {
  // A menu on the page that reaches "Archive this table", if this build draws one (B4-01 says no).
  await open("?rail=settings");
  await sleep(2500);
  const btn = page.getByRole("button", { name: "Archive this table", exact: true });
  const there = await until("Archive this table", async () => (await btn.count()) > 0, 30000);
  if (!there.v) {
    await probe("no-archive-button");
    return { ok: false, detail: "the Settings rail shows no Archive this table" };
  }
  await btn.first().click();
  await sleep(1500);
  const confirm = clean(await page.locator("[data-archive-confirm], [data-archive-state]").first().textContent().catch(() => ""));
  await btn.last().click();
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: /archived/i });
  const done = await until("the archived notice", async () => (await toast.count()) > 0 || (await page.getByText("This table is archived").count()) > 0, 120000);
  const said = clean(await toast.first().innerText().catch(() => ""));
  const db = cloneSql(`select coalesce(deleted_at::text, 'live') from custom.record where id = '${tid}'`);
  return { ok: !!done.v, detail: `confirm "${confirm.slice(0, 140)}"; notice "${said.slice(0, 140)}"${db ? `; clone ${db}` : ""}` };
}

async function archiveIfLive(why) {
  if (!tid || !page) return;
  await ctx.goto(page, `/data-v2/${tid}`);
  await sleep(6000);
  if (await page.getByText("This table is archived").count()) return;
  const r = await archiveTable();
  console.log(`[tables-life] ${why}: ${r.ok ? "archived" : "NOT archived"} — ${r.detail}`);
  if (!r.ok) throw new Error(`could not archive the fixture table ${tid}: ${r.detail}`);
}
