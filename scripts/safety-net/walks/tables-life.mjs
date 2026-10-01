// scripts/safety-net/walks/tables-life.mjs — lane SN-T1 (SAFETY-NET, 2026-10-01): THE TABLE AND ITS
// COLUMNS, ONE CHAIN THROUGH THE PRODUCT, OWNER SEAT (admin@admin.com in Cedar Ridge Physical Therapy).
//
// /data-v2 → New table "Home Exercise Plans <STAMP>" → the Sheet: a column of every kind a person
// can make (text, number, currency, percent, date, date & time, yes/no, choice, multi-choice,
// relation, several-record relation, attachments) → + Row (the defaults fill it) → a cell of each
// edited → reload, every value still there → the off-list ASK on a choice and a multi-choice cell →
// a type change on a column holding data (Undo brings the values back; a retype that fits keeps
// them) → sort + filter, an edit, reload: both kept → click-off blur saves → Cmd/Ctrl-Z undoes a
// cell → rename the column and the table → reorder → recolor a choice → retire a column → archive
// the table (Settings rail) → bring it back → archive again (cleanup).
//
// Items: T01–T29 (common-docs/projects/data-doctrine-adoption/v5/SAFETY-NET-COVERAGE.md). T22 (a
// kind / directive cell) is SKIP: no look on the column picker makes one.
//
// Runs unchanged on live (https://www.aimatrx.com) and on the clone preview:
//   node scripts/safety-net/run.mjs --target clone --origin http://safety-net-t1.localhost:3001 --only tables.walk-life
// On the clone it additionally reads the record store with psql for the deciding markers.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { openWalk, bodyText, sleep, until, STAMP, TARGET, REPO, OUT } from "../lib/harness.mjs";

const ctx = await openWalk("tables-life");
const TABLE_NAME = `Home Exercise Plans ${STAMP}`;
const TABLE_RENAMED = `Home Exercise Programs ${STAMP}`;
const R1 = "Clamshells, left hip";
const R2 = "Wall angels";
const R3 = "Bird dog";

// ── the clone's record store, read for the deciding marker (clone only) ──────────────────────────
const CLONE_DSN = (() => {
  if (TARGET !== "clone") return null;
  const f = join(REPO, ".env.local");
  if (!existsSync(f)) return null;
  return (readFileSync(f, "utf8").match(/^CLONE_DATABASE_URL=(.*)$/m)?.[1] ?? "").replace(/^"|"$/g, "") || null;
})();
const PSQL = ["/opt/homebrew/opt/libpq/bin/psql", "/opt/homebrew/opt/postgresql@17/bin/psql"].find(existsSync);
function cloneSql(sql) {
  if (!CLONE_DSN || !PSQL) return null;
  const r = spawnSync(PSQL, [CLONE_DSN, "-At", "-v", "ON_ERROR_STOP=1", "-c", `begin read only; ${sql}; commit;`], { encoding: "utf8", timeout: 60000 });
  return r.status === 0 ? r.stdout.split("\n").filter((l) => l && !/^(BEGIN|COMMIT)$/.test(l)).join("\n") : `ERR ${r.stderr.slice(0, 200)}`;
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
  writeFileSync(join(OUT, "tables-life-probes.json"), JSON.stringify(probes, null, 2));
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
  const exact = new RegExp(`^\\s*[⚿]?\\s*${esc(col)}\\s*[↑↓]?\\s*$`, "i");
  await page.locator("thead th", { hasText: exact }).first().click({ button: "right" });
  await sleep(900);
  const items = page.locator("[role=menu] [role^=menuitem]");
  const texts = await items.allInnerTexts();
  const i = texts.findIndex((t) => /Column settings/i.test(t));
  if (i < 0) {
    await probe(`header-menu-${col}`);
    await page.keyboard.press("Escape");
    throw new Error(`the header menu of "${col}" has no Column settings: ${texts.join(" | ")}`);
  }
  await items.nth(i).click();
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
  const overlay = page.locator("[data-radix-popper-content-wrapper], [role=dialog]");
  const before = await overlay.count();
  const c = await cellOf(row, col);
  await c.click();
  await sleep(600);
  for (const how of ["click", "Enter", "dblclick"]) {
    if (how === "click") await c.click();
    else if (how === "Enter") await page.keyboard.press("Enter");
    else await c.dblclick();
    await sleep(1500);
    if ((await overlay.count()) > before || (await c.locator("input, textarea, button").count()) > 1) return how;
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

// The column names, one per kind a person can make (T05), and what each cell is given (T10–T21).
const COLS = [
  { name: "Patient Notes", look: "Text", item: "T10", type: "Pain 3/10 after the second set", want: /Pain 3\/10 after the second set/ },
  { name: "Sets", look: "Number", item: "T11", dflt: "3", type: "4", want: /^4$/ },
  { name: "Copay", look: "Currency", item: "T12", type: "35", want: /\$\s?35(\.00)?/ },
  { name: "Adherence", look: "Percent", item: "T13", type: "80", want: /80\s?%/ },
  { name: "Start Date", look: "Date", item: "T14", type: "10/6/2026", want: /Oct(ober)?\s+0?6,?\s+2026|10\/0?6\/2026|2026-10-06/ },
  { name: "Next Check-in", look: "Date & time", item: "T15", type: "10/13/2026 9:30 AM", want: /(Oct(ober)?\s+13|10\/13).*9:30/ },
  { name: "Handout Given", look: "Yes / No", item: "T16" },
  { name: "Body Area", look: "Choice", item: "T17", choices: ["Neck", "Shoulder", "Knee", "Hip"], dflt: "Knee", type: "Hip", want: /^Hip$/ },
  { name: "Equipment", look: "Multi-choice", item: "T18", choices: ["Resistance band", "Foam roller", "Exercise ball"], type: "Resistance band", want: /Resistance band/ },
  { name: "Supply Item", look: "Relation", item: "T19", relation: true },
  { name: "Supplies Used", look: "Relation", item: "T20", relation: true, several: true },
  { name: "Handout PDF", look: "Attachments", item: "T21" },
];

try {
  page = await ctx.page("admin");
  if (page.__org !== "Cedar Ridge Physical Therapy") throw new Error(`the account rail does not name Cedar Ridge Physical Therapy (${page.__org})`);

  // LEFTOVERS: `SN_T1_ARCHIVE=<id,id>` archives fixture tables an interrupted run left, through the
  // product, and walks nothing else.
  if (process.env.SN_T1_ARCHIVE) {
    for (const id of process.env.SN_T1_ARCHIVE.split(",").filter(Boolean)) {
      tid = id;
      await ctx.step([], `archive leftover fixture ${id}`, page, async () => {
        await archiveIfLive("leftover");
        return { ok: true, detail: "archived (or already archived)" };
      });
    }
    tid = null;
    throw new Error("leftover mode: done");
  }

  // ── T01 create a table ─────────────────────────────────────────────────────────────────────────
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
    const named = (await bodyText(page, 4000)).includes(TABLE_NAME);
    const db = cloneSql(`select organization_id || ' | ' || (data ->> 'name') from custom.record where id = '${tid}' and table_id = custom.table_kernel_id()`);
    return { ok: named, detail: `table ${tid}; page names it: ${named}${db ? `; clone: ${db}` : ""}` };
  });
  if (!tid) throw new Error("no table to walk");

  // ── T05 add a column of every kind ─────────────────────────────────────────────────────────────
  await open("?view=sheet");
  await sheet();
  const made = {};
  for (const c of COLS) {
    await step(["T05"], `add column "${c.name}" (${c.look})`, async () => {
      const r = await addColumn(c.name, c.look, { choices: c.choices ?? [], dflt: c.dflt ?? null, relation: c.relation, several: c.several });
      made[c.name] = true;
      return { ok: true, detail: `header present${r.target ? `; points at ${r.target}` : ""}` };
    });
  }
  await step(["T22"], "a kind / directive column", async () => ({ skip: "no look on the Shows as picker makes a kind or directive column (the picker lists Text … Attachments, Formula, JSON); nothing for a person to edit" }));

  // ── T25 default values fill a new record ───────────────────────────────────────────────────────
  await step(["T25"], "+ Row: the defaults fill the new record (Sets 3, Body Area Knee)", async () => {
    const form = await addRow(R1);
    const sets = await cellText(R1, "Sets");
    const area = await cellText(R1, "Body Area");
    const ok = sets === "3" && /Knee/.test(area);
    return { ok, detail: `form showed default 3: ${/\b3\b/.test(form)}, Knee: ${/Knee/.test(form)}; row reads Sets "${sets}", Body Area "${area}"` };
  });
  await addRow(R2).catch(() => {});
  await addRow(R3).catch(() => {});

  // ── T10–T18 edit a cell of each plain kind ─────────────────────────────────────────────────────
  for (const c of COLS.filter((x) => x.type)) {
    if (!made[c.name]) continue;
    await step([c.item], `edit ${c.look} cell "${c.name}" → ${c.type}`, async () => {
      await typeInto(R1, c.name, c.type);
      // A choice cell offers its list; Enter took the typed choice. Close anything left open.
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(800);
      const now = await cellText(R1, c.name);
      return { ok: c.want.test(now), detail: `cell reads "${now}"` };
    });
  }
  if (made["Handout Given"]) {
    await step(["T16"], "edit Yes / No cell \"Handout Given\" (one click ticks)", async () => {
      const c = await cellOf(R1, "Handout Given");
      const box = c.getByRole("checkbox");
      await c.click();
      await sleep(400);
      await box.click();
      await sleep(2500);
      const state = await box.getAttribute("data-state");
      return { ok: state === "checked", detail: `box ${state}` };
    });
  }
  // T19 / T20 relation cells: the picker lists the target table's records; pick one (two for several).
  for (const [col, item, n] of [["Supply Item", "T19", 1], ["Supplies Used", "T20", 2]]) {
    if (!made[col]) continue;
    await step([item], `edit relation cell "${col}" (pick ${n})`, async () => {
      const how = await openEditor(R1, col);
      await probe(`relation-picker-${col}`);
      const opts = page.locator("[role=listbox] [role=option], [cmdk-item], [role=dialog] [role=option]");
      await until("the records to pick", async () => (await opts.count()) > 0, 20000);
      const names = (await opts.allInnerTexts()).map(clean).filter(Boolean);
      if (!names.length) return { ok: false, detail: `no record offered to pick (editor opened by ${how ?? "nothing"})` };
      for (let k = 0; k < n && k < names.length; k++) {
        await opts.nth(k).click();
        await sleep(1200);
      }
      // A several-record picker may stay open with a Done.
      const done = page.getByRole("button", { name: /^(Done|Save|Apply)$/ });
      if (await done.count()) await done.first().click().catch(() => {});
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(2500);
      const now = await cellText(R1, col);
      const want = names.slice(0, n).map((x) => x.split(" ")[0]);
      return { ok: want.every((w) => now.includes(w)) && !/[0-9a-f]{8}-[0-9a-f]{4}/.test(now), detail: `picked ${names.slice(0, n).join(" + ")}; cell reads "${now}"` };
    });
  }
  // T21 attachments: the cell's Add files… goes through the platform file picker.
  if (made["Handout PDF"]) {
    await step(["T21"], "edit attachments cell \"Handout PDF\"", async () => {
      const how = await openEditor(R1, "Handout PDF");
      const add = page.getByRole("button", { name: /Add files/ });
      if (!(await add.count())) {
        await probe("attachment-editor");
        return { ok: false, detail: `the attachments cell opened no Add files… (editor opened by ${how ?? "nothing"})` };
      }
      const chooser = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null);
      await add.first().click();
      const fc = await chooser;
      if (!fc) {
        await probe("attachment-picker");
        await page.keyboard.press("Escape");
        return { skip: "Add files… opens the platform file picker (a library dialog, no browser file chooser); a headless walk cannot hand it a file — manual by Arman: attach a PDF to an Attachments cell" };
      }
      const f = join(OUT, "home-exercise-handout.txt");
      writeFileSync(f, "Clamshells: 3 sets of 12, left side lying, band above the knees.\n");
      await fc.setFiles(f);
      await until("the file chip", async () => /home-exercise-handout/.test(await bodyText(page)), 60000);
      const done = page.getByRole("button", { name: /^Done$/ });
      if (await done.count()) await done.first().click();
      await sleep(3000);
      const now = await cellText(R1, "Handout PDF");
      return { ok: /home-exercise-handout/.test(now), detail: `cell reads "${now}"` };
    });
  }

  // Every edit read back after a reload (the deciding marker on live: what the page shows).
  await step(["T10", "T11", "T12", "T13", "T14", "T15", "T16", "T17", "T18"], "after a reload every edited cell still reads its value", async () => {
    await open("?view=sheet", { needRows: true });
    await sheet();
    const bad = [];
    const seen = {};
    for (const c of COLS.filter((x) => x.type && made[x.name])) {
      const v = await cellText(R1, c.name);
      seen[c.name] = v;
      if (!c.want.test(v)) bad.push(`${c.name} "${v}"`);
    }
    const tick = made["Handout Given"] ? await (await cellOf(R1, "Handout Given")).getByRole("checkbox").getAttribute("data-state") : "n/a";
    if (made["Handout Given"] && tick !== "checked") bad.push(`Handout Given ${tick}`);
    let db = "";
    if (CLONE_DSN) db = `; clone: ${cloneSql(`select (r.data - '_values')::text from custom.record r where r.table_id = '${tid}' and r.deleted_at is null and r.data::text like '%Clamshells%' limit 1`)}`.slice(0, 600);
    return { ok: bad.length === 0, detail: bad.length ? `after reload: ${bad.join("; ")}` : `all kept: ${JSON.stringify(seen).slice(0, 300)}${db}` };
  });

  // ── T23 enum ASK, single choice ────────────────────────────────────────────────────────────────
  await step(["T23"], "Body Area: an off-list word asks; Add makes it a choice", async () => {
    const r = await askAfterTyping(R2, "Body Area", "Lumbar spine");
    if (!r.asked) return { ok: false, detail: `typing "Lumbar spine" asked nothing; cell reads "${await cellText(R2, "Body Area")}"` };
    await r.ask.getByRole("button", { name: "Add", exact: true }).first().click();
    await sleep(3500);
    const now = await cellText(R2, "Body Area");
    const d = await columnSettings("Body Area");
    const listed = await d.getByRole("button", { name: "Remove Lumbar spine", exact: true }).count();
    await d.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => page.keyboard.press("Escape"));
    await sleep(800);
    return { ok: /Lumbar spine/.test(now) && listed > 0, detail: `asked "${r.text.slice(0, 120)}" (keep offered: ${r.keep}); cell "${now}"; now in the list: ${listed > 0}` };
  });
  // ── T24 enum ASK, multi choice ─────────────────────────────────────────────────────────────────
  await step(["T24"], "Equipment: an off-list word typed in the chooser asks; Keep as typed (or Add) saves it", async () => {
    const how = await openEditor(R2, "Equipment");
    const search = page.locator("[cmdk-input]").last();
    if (!(await search.count())) {
      await probe("multi-chooser");
      return { ok: false, detail: `the Equipment cell opened no chooser (by ${how ?? "nothing"})` };
    }
    await search.fill("Ankle weights");
    await sleep(1200);
    await probe("multi-chooser-typed");
    const ask = page.locator("[data-matrx-choice-nudge], [data-radix-popper-content-wrapper], [role=dialog], [role=alertdialog]").filter({ hasText: "to the choices for" });
    if (!(await ask.count())) {
      // The chooser's own offer for a word that is none of its choices, then Enter.
      const offer = page.locator("[cmdk-item]").filter({ hasText: "Ankle weights" });
      if (await offer.count()) await offer.first().click();
      else await page.keyboard.press("Enter");
      await sleep(1500);
    }
    const asked = await until("the ask", async () => (await ask.count()) > 0, 10000);
    if (!asked.v) {
      await probe("multi-no-ask");
      await page.keyboard.press("Escape").catch(() => {});
      return { ok: false, detail: `typing "Ankle weights" in the Equipment chooser asked nothing; cell reads "${await cellText(R2, "Equipment")}"` };
    }
    const text = clean(await ask.first().innerText());
    const keep = (await ask.first().getByRole("button", { name: "Keep as typed", exact: true }).count()) > 0;
    const pick = keep ? "Keep as typed" : "Add";
    await ask.first().getByRole("button", { name: pick, exact: true }).first().click();
    await sleep(3000);
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(1500);
    await reload();
    const now = await cellText(R2, "Equipment");
    return { ok: /Ankle weights/.test(now), detail: `asked "${text.slice(0, 120)}"; answered ${pick}; after reload the cell reads "${now}"` };
  });

  // ── T26 + T29 type change with data: values set aside, Undo brings them back ───────────────────
  await step(["T26", "T29"], "Patient Notes (text) → Number: the words are set aside; Undo on the notice brings them back", async () => {
    const before = await cellText(R1, "Patient Notes");
    const d = await columnSettings("Patient Notes");
    await pickLook(d, "Number");
    await d.getByRole("button", { name: "Save", exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.waitFor({ timeout: 15000 });
    const said = clean(await confirm.innerText());
    await confirm.getByRole("button", { name: "Change type", exact: true }).click();
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const offered = await until("Undo", async () => (await undo.count()) > 0, 20000);
    await sleep(2500);
    const whileNumber = await cellText(R1, "Patient Notes");
    if (offered.v) await undo.first().click();
    await sleep(7000);
    await open("?view=sheet", { needRows: true });
    await sheet();
    const after = await cellText(R1, "Patient Notes");
    const d2 = await columnSettings("Patient Notes");
    const look = clean(await d2.getByRole("combobox").first().innerText());
    await d2.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => page.keyboard.press("Escape"));
    await sleep(800);
    const db = cloneSql(`select data ->> 'type' from custom.record where table_id = custom.field_kernel_id() and deleted_at is null and data ->> 'entity_definition_id' = '${tid}' and data ->> 'label' = 'Patient Notes'`);
    const ok = /set aside/.test(said) && !!offered.v && after === before && /Text/.test(look);
    return { ok, detail: `confirm "${said.slice(0, 140)}"; while Number the cell read "${whileNumber}"; Undo offered ${!!offered.v}; after Undo + reload "${after}" (was "${before}"), shows as ${look}${db ? `; clone field type ${db}` : ""}` };
  });
  await step(["T26"], "Sets (number) → Text: a value that fits is kept", async () => {
    const before = await cellText(R1, "Sets");
    const d = await columnSettings("Sets");
    await pickLook(d, "Text");
    await d.getByRole("button", { name: "Save", exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.waitFor({ timeout: 15000 });
    await confirm.getByRole("button", { name: "Change type", exact: true }).click();
    await sleep(6000);
    await open("?view=sheet", { needRows: true });
    await sheet();
    const after = await cellText(R1, "Sets");
    const after2 = await cellText(R2, "Sets");
    return { ok: after === before && after2 === "3", detail: `Sets read "${before}" → "${after}" as Text; ${R2} "${after2}"` };
  });

  // ── T28 click-off blur saves the cell ──────────────────────────────────────────────────────────
  await step(["T28"], "type into a cell, click another cell (no Enter): the value is saved", async () => {
    const words = "Band above the knees, 3 x 12";
    await typeInto(R2, "Patient Notes", words, { enter: false });
    await (await cellOf(R3, "Copay")).click();
    await sleep(3500);
    const shown = await cellText(R2, "Patient Notes");
    await reload();
    const now = await cellText(R2, "Patient Notes");
    return { ok: now === words, detail: `right after the click-off the cell read "${shown}"; after a reload "${now}"` };
  });

  // ── T29 undo a cell edit with Cmd/Ctrl-Z ───────────────────────────────────────────────────────
  await step(["T29"], "edit a cell, Cmd/Ctrl-Z: the old value is back (and stays after reload)", async () => {
    const before = await cellText(R2, "Copay");
    await typeInto(R2, "Copay", "45");
    const mid = await cellText(R2, "Copay");
    await (await cellOf(R2, "Copay")).click();
    await sleep(400);
    await page.keyboard.press("ControlOrMeta+z");
    await sleep(3500);
    const t = await toasts();
    await open("?view=sheet", { needRows: true });
    await sheet();
    const after = await cellText(R2, "Copay");
    return { ok: /45/.test(mid) && after === before, detail: `"${before}" → "${mid}" → Cmd-Z → after reload "${after}"; notice: ${t.slice(0, 140)}` };
  });

  // ── T27 sort and filter persist after an edit ──────────────────────────────────────────────────
  await step(["T27"], "sort by Title Z to A and filter Title contains \"l\", edit a cell, reload: both still applied", async () => {
    const menuItem = async (col, node) => {
      const exact = new RegExp(`^\\s*[⚿]?\\s*${esc(col)}\\s*[↑↓]?\\s*$`, "i");
      await page.locator("thead th", { hasText: exact }).first().click({ button: "right" });
      const item = page.locator(`[role=menu] [data-alchemy-node="${node}"]`).first();
      await item.waitFor({ timeout: 15000 });
      await item.click();
      await sleep(1500);
    };
    const order = async () =>
      (await page.locator("tbody tr").allInnerTexts()).map(clean).map((r) => (r.includes(R1) ? "R1" : r.includes(R2) ? "R2" : r.includes(R3) ? "R3" : null)).filter(Boolean);
    await menuItem("Title", "cm:x:grid-col-sort-desc");
    const sorted = await order();
    await menuItem("Title", "cm:x:grid-col-filter");
    await probe("title-filter");
    const box = page.locator("[data-radix-popper-content-wrapper] input, [role=dialog] input").filter({ hasNot: page.locator("[type=checkbox]") }).last();
    if (!(await box.count())) return { ok: false, detail: `sorted ${sorted.join(">")}; "Filter this column…" opened no box to type in` };
    await box.fill("l");
    await page.keyboard.press("Enter");
    await sleep(2500);
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(800);
    const filtered = await order();
    await typeInto(R1, "Copay", "40");
    const afterEdit = await order();
    const url = page.url().replace(ctx.origin, "");
    await reload();
    const afterReload = await order();
    const copay = await cellText(R1, "Copay");
    // Z→A: Wall angels (R2) above Clamshells (R1); "l" keeps both and hides Bird dog (R3).
    const want = "R2,R1";
    const ok = sorted.join() === "R2,R3,R1" && filtered.join() === want && afterEdit.join() === want && afterReload.join() === want && /40/.test(copay);
    return { ok, detail: `sorted ${sorted.join(">")}; filtered ${filtered.join(">")}; after the edit ${afterEdit.join(">")}; after reload ${afterReload.join(">")} (Copay "${copay}", address ${url.slice(0, 160)})` };
  });

  // ── T06 rename a column ────────────────────────────────────────────────────────────────────────
  await step(["T06"], "rename Patient Notes → Patient Comments; values stay", async () => {
    const d = await columnSettings("Patient Notes");
    await d.locator("#col-name").fill("Patient Comments");
    await d.getByRole("button", { name: "Save", exact: true }).click();
    await sleep(4000);
    await open("?view=sheet", { needRows: true });
    await sheet();
    const hs = await headers();
    const v = (await colIndex("Patient Comments")) >= 0 ? await cellText(R1, "Patient Comments") : "∅";
    return { ok: hs.includes("Patient Comments") && !hs.includes("Patient Notes") && /Pain 3\/10/.test(v), detail: `headers ${hs.join(", ").slice(0, 200)}; ${R1} reads "${v}"` };
  });

  // ── T09 recolor a choice ───────────────────────────────────────────────────────────────────────
  await step(["T09"], "recolor the Body Area choice Hip from its column settings", async () => {
    const paint = () => page.evaluate(() => [...document.querySelectorAll("tbody td")].map((td) => td.innerHTML).find((h) => />Hip</.test(h))?.match(/(bg|text|border)-[a-z]+-\d+/g)?.join(" ") ?? "");
    const before = await paint();
    const d = await columnSettings("Body Area");
    const rows = d.locator("div", { has: page.locator('input[aria-label="Option value"]') }).filter({ has: page.getByRole("combobox", { name: "Option color" }) });
    const values = await d.locator('input[aria-label="Option value"]').evaluateAll((els) => els.map((e) => e.value));
    const i = values.indexOf("Hip");
    if (i < 0) return { ok: false, detail: `no choice Hip in Body Area's settings (${values.join(", ")})` };
    void rows;
    await d.getByRole("combobox", { name: "Option color" }).nth(i).click();
    await sleep(800);
    const opts = page.getByRole("option");
    const names = (await opts.allInnerTexts()).map(clean);
    const target = names.findIndex((n) => /^Green$/i.test(n)) >= 0 ? names.findIndex((n) => /^Green$/i.test(n)) : names.findIndex((n) => n && !/^Plain$/i.test(n));
    if (target < 0) return { ok: false, detail: `the colour list offers nothing but ${names.join(", ")}` };
    await opts.nth(target).click();
    await sleep(600);
    await d.getByRole("button", { name: "Save", exact: true }).click();
    await sleep(4000);
    await reload();
    const after = await paint();
    const d2 = await columnSettings("Body Area");
    const said = clean(await d2.getByRole("combobox", { name: "Option color" }).nth(i).innerText());
    await d2.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => page.keyboard.press("Escape"));
    await sleep(800);
    return { ok: said === names[target] && after !== before, detail: `Hip set to ${names[target]}; settings now read "${said}"; chip paint "${before}" → "${after}" after reload` };
  });

  // ── T08 reorder columns ────────────────────────────────────────────────────────────────────────
  await step(["T08"], "move Copay up past Sets (Settings rail's field list); the Sheet shows the new order after reload", async () => {
    const before = await headers();
    await open("?rail=settings");
    const up = page.getByRole("button", { name: "Move Copay up", exact: true });
    await until("the field list", async () => (await up.count()) > 0, 40000);
    const viaRail = (await up.count()) > 0;
    if (!viaRail) {
      // The Sheet's own gesture: drag the Copay header onto the left half of Sets.
      await open("?view=sheet", { needRows: true });
      await sheet();
      await dragHeader("Copay", "Sets");
    } else {
      await up.first().click();
      await sleep(3500);
    }
    await open("?view=sheet", { needRows: true });
    await sheet();
    const after = await headers();
    return { ok: after.indexOf("Copay") >= 0 && after.indexOf("Copay") < after.indexOf("Sets"), detail: `${viaRail ? "Move Copay up" : "header drag"}: before ${before.join(", ").slice(0, 120)} → after ${after.join(", ").slice(0, 120)}` };
  });

  // ── T07 retire a column ────────────────────────────────────────────────────────────────────────
  await step(["T07"], "retire Adherence (Delete column… → Remove column); gone after reload", async () => {
    const d = await columnSettings("Adherence");
    await d.getByRole("button", { name: /^Delete column/ }).click();
    const ask = page.getByRole("alertdialog").filter({ hasText: "Adherence" });
    await ask.waitFor({ timeout: 15000 });
    const said = clean(await ask.innerText());
    await ask.getByRole("button", { name: /^Remove column$/ }).click();
    await sleep(4000);
    await open("?view=sheet", { needRows: true });
    await sheet();
    const hs = await headers();
    const db = cloneSql(`select count(*) filter (where deleted_at is null) || ' live / ' || count(*) || ' rows' from custom.record where table_id = custom.field_kernel_id() and data ->> 'entity_definition_id' = '${tid}' and data ->> 'label' = 'Adherence'`);
    return { ok: !hs.includes("Adherence"), detail: `confirm "${said.slice(0, 160)}"; headers now ${hs.join(", ").slice(0, 200)}${db ? `; clone live/all Adherence fields ${db}` : ""}` };
  });

  // ── T02 rename the table ───────────────────────────────────────────────────────────────────────
  await step(["T02"], `rename the table → "${TABLE_RENAMED}"`, async () => {
    const tried = [];
    // 1. The table page's own menu (the "…" beside Share).
    await open("");
    const menu = page.getByRole("button", { name: "Table menu" });
    if (await menu.count()) {
      await menu.first().click();
      await sleep(1200);
      const items = (await page.locator("[role=menu] [role^=menuitem]").allInnerTexts()).map(clean);
      tried.push(`table menu: ${items.join(" | ")}`);
      const ri = items.findIndex((t) => /Rename/i.test(t));
      if (ri >= 0) await page.locator("[role=menu] [role^=menuitem]").nth(ri).click();
      else await page.keyboard.press("Escape");
      await sleep(1000);
    }
    // 2. A box holding the table's name (the Settings rail, or one the menu opened).
    let box = page.locator(`input`).filter({ hasNot: page.locator("x") });
    let idx = await box.evaluateAll((els, n) => els.findIndex((e) => e.value === n), TABLE_NAME);
    if (idx < 0) {
      await open("?rail=settings");
      await sleep(3000);
      box = page.locator("input");
      idx = await box.evaluateAll((els, n) => els.findIndex((e) => e.value === n), TABLE_NAME);
      tried.push(`settings rail: ${idx < 0 ? "no box holding the table's name" : "a name box"}`);
    }
    // 3. The header's title (it opens the table switcher).
    if (idx < 0) {
      const title = page.getByRole("button", { name: new RegExp(esc(TABLE_NAME)) }).first();
      if (await title.count()) {
        await title.click();
        await sleep(1200);
        const sw = clean(await page.locator("[data-table-switcher-content]").first().innerText().catch(() => ""));
        tried.push(`header title: ${sw ? "opens the table switcher (Find a table)" : "opens nothing"}`);
        await page.keyboard.press("Escape");
      }
      return { ok: false, detail: `no control renames the table: ${tried.join("; ").slice(0, 400)}` };
    }
    await box.nth(idx).fill(TABLE_RENAMED);
    await page.keyboard.press("Enter");
    await sleep(2500);
    const save = page.getByRole("button", { name: /^(Save|Rename)$/ });
    if (await save.count()) await save.first().click().catch(() => {});
    await sleep(3000);
    await open("");
    const t = await bodyText(page, 3000);
    return { ok: t.includes(TABLE_RENAMED), detail: `after reload the page names "${t.includes(TABLE_RENAMED) ? TABLE_RENAMED : t.includes(TABLE_NAME) ? TABLE_NAME : "neither"}"` };
  });

  // ── T03 archive (Settings rail; the table menu is B4-01) + T04 restore ─────────────────────────
  await step(["T03"], "archive the table from the Settings rail (two presses)", async () => {
    const r = await archiveTable();
    return r;
  });
  await step(["T04"], "bring the archived table back", async () => {
    await ctx.goto(page, `/data-v2/${tid}`);
    const back = page.getByRole("button", { name: "Bring it back" });
    await until("the archived page", async () => (await back.count()) > 0 || (await page.getByText(/archived/i).count()) > 0, 90000);
    if (!(await back.count())) {
      await probe("archived-page");
      return { ok: false, detail: `the archived table's page offers no Bring it back: ${clean(await bodyText(page, 600))}` };
    }
    await back.first().click();
    await sleep(6000);
    await open("?view=sheet", { needRows: true });
    const rows = await page.locator("tbody tr", { hasText: R1 }).count();
    const db = cloneSql(`select coalesce(deleted_at::text, 'live') from custom.record where id = '${tid}'`);
    return { ok: rows > 0, detail: `back: ${R1} row shown ${rows > 0}${db ? `; clone ${db}` : ""}` };
  });
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
