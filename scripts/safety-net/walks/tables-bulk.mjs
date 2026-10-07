// scripts/safety-net/walks/tables-bulk.mjs — lane SN-T2 (SAFETY-NET, 2026-10-01): BULK IN, BULK OUT AND
// THE ONE RECORD, THROUGH THE PRODUCT. admin@admin.com (owner) in Cedar Ridge Physical Therapy, plus
// test@test.com where the item says editor / viewer.
//
// The clinic's visit log. One owner chain:
//   New table "Visit log <STAMP>" → Import a CSV (the importer, ?rail=import) then an XLSX (T33)
//   → paste a block of cells into the Grid (T30) → the Sheet's Paste (T31)
//   → Export CSV / XLSX / JSON — the file holds the rows (T34)
//   → open a record (?record=<id>), edit a field in the panel, the Grid shows it (T43)
//   → the panel's History lists the edit with who and when; put a version back (T58)
//   → the table page's visible text carries no column keys, ids or secrets, owner and viewer (T59)
//   New table "Visit log 300 <STAMP>" → paste 300 visits into the EMPTY Grid as the owner (T32) →
//   every one of the 300 reachable page by page, the pager honest (T35)
//   New table "Intake <STAMP>" → shared to test@test.com as Editor through the Share dialog → the
//   Editor pastes 4 columns × 3 rows into it → the values land (T32, editor; BREAKER-4 B4-03).
//
// Items: T30 T31 T32 T33 T34 T35 T43 T58 T59 (common-docs/projects/data-doctrine-adoption/v5/SAFETY-NET-COVERAGE.md).
// Every fixture carries STAMP and is ARCHIVED in cleanup (Settings rail → Archive this table).
// Runs unchanged on live and on the clone preview:
//   node scripts/safety-net/run.mjs --target clone --origin http://safety-net-t2.localhost:3001 --only tables.walk-bulk
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readWorkbook } from "@ai-matrx/alchemy/operate/read";
import { writeWorkbookBytes } from "@ai-matrx/alchemy/operate/formats/xlsx";

import { openWalk, bodyText, cloneRead, sleep, until, STAMP, TARGET, OUT } from "../lib/harness.mjs";

const ctx = await openWalk("tables-bulk");
const T_A = `Visit log ${STAMP}`;
const T_300 = `Visit log 300 ${STAMP}`;
const T_ED = `Intake ${STAMP}`;

// ── the clone's record store, read for the deciding marker (clone only; the harness's one safe reader) ──
const cloneSql = (sql) => (TARGET === "clone" ? cloneRead(sql) : null);
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// ── the clinic's data ────────────────────────────────────────────────────────────────────────────
const CSV_ROWS = [
  ["Mateo Álvarez", "2026-09-14", 45, "Yes"],
  ["Siobhán O'Neill", "2026-09-15", 30, "No"],
  ["Zoë Brennan", "2026-09-15", 60, "Yes"],
  ["Renée Dubois", "2026-09-16", 40, "Yes"],
];
const XLSX_ROWS = [
  ["Nguyễn Thị Lan", "2026-09-17", 50, "No"],
  ["Björn Lindqvist", "2026-09-18", 35, "Yes"],
  ["Amara Okafor", "2026-09-18", 45, "Yes"],
];
const SHEET_ROWS = [
  ["José Hernández", "2026-09-21", 55, "Yes"],
  ["Åsa Bergström", "2026-09-22", 30, "No"],
  ["Chloé Martin", "2026-09-23", 45, "Yes"],
];
const GRID_BLOCK = [
  [31, "2026-10-01"],
  [41, "2026-10-02"],
];
const PATIENTS = ["María José Fernández", "Zoë Brennan", "Siobhán O'Neill", "Mateo Álvarez", "Renée Dubois", "Nguyễn Thị Lan", "Björn Lindqvist", "Amara Okafor", "José Hernández", "Åsa Bergström", "Chloé Martin", "Dmitri Volkov", "Aiko Tanaka", "Priya Raman", "Luis Ortega", "Dana Whitfield", "Léa Moreau", "Tomás Castillo", "Ingrid Solberg", "Kofi Mensah"];
const csvText = ["Patient,Visit date,Minutes,Paid", ...CSV_ROWS.map((r) => r.map((c) => (/[,"]/.test(String(c)) ? `"${c}"` : c)).join(","))].join("\n") + "\n";
const xlsxBuffer = Buffer.from(await writeWorkbookBytes({ sheets: [{ name: "Visits", rows: [["Patient", "Visit date", "Minutes", "Paid"], ...XLSX_ROWS] }] }));

const visit = (k) => `V-${String(k).padStart(4, "0")}`;
const BIG = Array.from({ length: 300 }, (_, i) => {
  const k = ((i * 157) % 300) + 1; // scrambled, so order proves nothing
  return [visit(k), PATIENTS[(k * 7) % PATIENTS.length], 30 + ((k * 5) % 35), `2026-09-${String(1 + (k % 28)).padStart(2, "0")}`, k % 3 === 0 ? "No" : "Yes"];
});
const bigPaste = ["Visit\tPatient\tMinutes\tVisit date\tPaid", ...BIG.map((r) => r.join("\t"))].join("\n");
const INTAKE = [
  ["Dana Whitfield", "Knee rehab, 6 weeks", 12, "2026-10-05"],
  ["Luis Ortega", "Shoulder, 8 weeks", 16, "2026-10-07"],
  ["Aiko Tanaka", "Back pain, 4 weeks", 8, "2026-10-12"],
];
const intakePaste = ["Client\tPackage\tSessions\tStart", ...INTAKE.map((r) => r.join("\t"))].join("\n");

// ── page helpers ─────────────────────────────────────────────────────────────────────────────────
let admin;
let member;
const fixtures = []; // { id, name }

async function settle(page, query, { needFile = false } = {}) {
  for (let k = 0; k < 20; k++) {
    await sleep(3000);
    if (page.url().includes("__dev-walk")) {
      await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
      await sleep(5000);
    }
    const t = await bodyText(page, 6000);
    if (/could not find out where this table is|The record store did not answer/.test(t)) {
      await page.getByRole("button", { name: "Try again" }).first().click().catch(() => {});
      await sleep(5000);
      continue;
    }
    if (needFile ? await page.locator("input[type=file]").count() : (await page.locator("thead th").count()) > 1 || /No records yet|This table has no rows|Add the first row|Add your first column/.test(t)) break;
  }
  await sleep(1500);
}
async function open(page, tid, query = "?view=grid", opts = {}) {
  await ctx.goto(page, `/data/${tid}${query}`);
  await settle(page, query, opts);
}
async function newTable(name) {
  await ctx.goto(admin, "/data");
  const nt = admin.getByRole("button", { name: "New table", exact: true }).first();
  await until("New table", async () => (await nt.count()) > 0, 90000);
  // The header button is server-rendered before the page hydrates; a click that lands first is lost
  // (live 15:00 and 15:34 PT: no dialog, ever). Click again until the dialog is up, never after.
  const nameInput = admin.getByPlaceholder("Table name");
  const opened = await until("the New table dialog", async () => {
    if ((await nameInput.count()) > 0) return true;
    await nt.click().catch(() => {});
    await sleep(1500);
    return (await nameInput.count()) > 0;
  }, 60000);
  if (!opened.v) throw new Error("New table never opened the dialog after repeated clicks");
  await nameInput.fill(name);
  await admin.getByRole("button", { name: "Create", exact: true }).click();
  await until("the new table", async () => /\/data\/[0-9a-f-]{36}/.test(admin.url()), 120000);
  const id = admin.url().match(/\/data\/([0-9a-f-]{36})/)?.[1] ?? null;
  if (id) fixtures.push({ id, name });
  return id;
}
async function archive(id) {
  await ctx.goto(admin, `/data/${id}?rail=settings`);
  await sleep(7000);
  if (await admin.getByText("This table is archived").count()) return "already archived";
  const btn = admin.getByRole("button", { name: "Archive this table", exact: true });
  const there = await until("Archive this table", async () => (await btn.count()) > 0, 60000);
  if (!there.v) throw new Error(`no Archive this table on the Settings rail of ${id}`);
  await btn.first().click();
  await sleep(1500);
  await btn.last().click();
  const toast = admin.locator("[data-sonner-toast]").filter({ hasText: /archived/i });
  const done = await until("archived", async () => (await toast.count()) > 0 || (await admin.getByText("This table is archived").count()) > 0, 120000);
  if (!done.v) throw new Error(`table ${id} did not archive`);
  return "archived";
}
/** The rows the page draws: [{ id, text }]. */
const rowsOf = (page) =>
  page.evaluate(() => [...document.querySelectorAll("tbody tr[data-row-id]")].map((t) => ({ id: t.getAttribute("data-row-id"), text: t.innerText.replace(/\s+/g, " ").trim() })));
/** Every row of the CURRENT page of the grid: the table draws only the rows in view, so scroll it top to bottom. */
const collectPage = (page) =>
  page.evaluate(async () => {
    const tb = document.querySelector("tbody");
    let sc = tb;
    while (sc && !(sc.scrollHeight > sc.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    const out = new Map();
    const grab = () => document.querySelectorAll("tbody tr[data-row-id]").forEach((t) => out.set(t.getAttribute("data-row-id"), t.innerText.replace(/\s+/g, " ").trim()));
    if (!sc) {
      grab();
      return [...out.values()];
    }
    sc.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 400));
    for (let k = 0; k < 60; k++) {
      grab();
      const before = sc.scrollTop;
      sc.scrollTop = before + Math.max(120, sc.clientHeight * 0.6);
      await new Promise((r) => setTimeout(r, 300));
      if (sc.scrollTop === before) break;
    }
    grab();
    sc.scrollTop = 0;
    return [...out.values()];
  });
const headers = (page) => page.evaluate(() => [...document.querySelectorAll("thead th")].map((t) => t.innerText.replace(/\s+/g, " ").trim()).filter(Boolean));
const footer = async (page) => clean((await bodyText(page, 30000)).match(/\d[\d,]*\s*[–-]\s*\d[\d,]*\s+of\s+[\d,]+|Unknown total/g)?.join(" | "));
const colIndex = (page, name) =>
  page.evaluate((n) => [...document.querySelectorAll("thead th")].findIndex((th) => (th.innerText ?? "").trim().toLowerCase().startsWith(n.toLowerCase())), name);
/** A paste event with `text` as the clipboard, sent to the grid's own wrapper or the focused cell. */
async function pasteEvent(page, selector, text) {
  return page.evaluate(
    ({ selector, text }) => {
      const el = selector ? document.querySelector(selector) : document.activeElement;
      if (!el) return "no element";
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      return `${el.tagName} ${el.getAttribute("data-records-grid-wrap") ?? el.getAttribute("data-cell") ?? ""}`.trim();
    },
    { selector, text },
  );
}
/** The importer on the page (rail or the empty-grid paste wizard): confirm and wait for its report. */
async function runImporter(page, scope, label, expected) {
  const go = scope.getByRole("button", { name: /^Import \d+ rows?/ }).first();
  const have = await until("the Import button", async () => (await go.count()) > 0, 60000);
  if (!have.v) throw new Error(`${label}: no Import button; page says: ${clean(await scope.innerText().catch(() => "")).slice(0, 500)}`);
  const mode = scope.locator("select").filter({ has: page.locator('option[value="create"]') }).first();
  let policy = "(no question asked)";
  if (await mode.count()) {
    policy = await mode.inputValue().catch(() => "?");
    if (policy !== "create") await mode.selectOption("create").catch(() => {});
  }
  await go.click();
  const rep = await until("the import report", async () => new RegExp(`\\d+ landed[^.]*of ${expected} rows offered`).test(clean(await scope.innerText().catch(() => ""))), 300000);
  const said = clean(await scope.innerText().catch(() => ""));
  if (!rep.v) throw new Error(`${label}: no report; page says: ${said.slice(0, 500)}`);
  return { said, policy };
}

// ── T59: what a person must never read on a table page ──────────────────────────────────────────
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const SNAKE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
const FIELD_ID = /\bfield-[0-9a-f]{8}\b/gi;
const SECRET = /\b(?:sk|pk|rk|key|tok)[-_][A-Za-z0-9]{16,}\b|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|\bBearer\s+[A-Za-z0-9._-]{16,}|\bAKIA[0-9A-Z]{16}\b|\bsbp_[A-Za-z0-9]{20,}/g;
async function keysSeen(page) {
  const text = await page.evaluate(() => {
    const roots = [...document.querySelectorAll("main, [data-rail-column], [role=dialog], [role=menu]")];
    const seen = new Set();
    return roots
      .filter((r) => !roots.some((o) => o !== r && o.contains(r)))
      .map((r) => r.innerText)
      .join("\n");
  });
  const hits = new Set();
  for (const re of [UUID, SNAKE, FIELD_ID, SECRET]) for (const m of text.match(re) ?? []) hits.add(m);
  return [...hits];
}

let tidA = null;
let tid300 = null;
let tidEd = null;
const probes = {};

try {
  admin = await ctx.page("admin");
  if (admin.__org !== "Cedar Ridge Physical Therapy") throw new Error(`the account rail does not name Cedar Ridge Physical Therapy (${admin.__org})`);

  // SN_T2_TAIL=1 skips sections A–F (a development aid for re-running G and H on their own).
  if (!process.env.SN_T2_TAIL) {
  // ═══ A. the visit log: import ═════════════════════════════════════════════════════════════════
  tidA = await newTable(T_A);
  ctx.cleanup(async () => console.log(`[tables-bulk] cleanup ${T_A}: ${await archive(tidA)}`));
  if (!tidA) throw new Error("Create did not open a table");

  await ctx.step(["T33"], "import a CSV through the importer (?rail=import)", admin, async () => {
    await open(admin, tidA, "?view=grid&rail=import", { needFile: true });
    await admin.locator("input[type=file]").first().setInputFiles({ name: "visit-log-sept.csv", mimeType: "text/csv", buffer: Buffer.from(csvText) });
    await sleep(3000);
    const wiz = admin.locator("[data-rail-column], main").first();
    const said = clean(await wiz.innerText().catch(() => ""));
    const r = await runImporter(admin, admin.locator("body"), "csv import", CSV_ROWS.length);
    await open(admin, tidA, "?view=grid");
    const rows = await rowsOf(admin);
    const missing = CSV_ROWS.filter(([p, , m]) => !rows.some((x) => x.text.includes(p) && x.text.includes(String(m))));
    const hs = await headers(admin);
    const db = cloneSql(`select count(*) from custom.record r where r.table_id = '${tidA}' and r.deleted_at is null`);
    return {
      ok: missing.length === 0 && rows.length >= CSV_ROWS.length,
      detail: `${rows.length} rows drawn, columns ${hs.join(" / ")}; ${missing.length ? `MISSING ${missing.map((x) => x[0]).join(", ")}` : "all four patients with their minutes"}; importer: ${r.said.match(/\d+ landed[^.]*?of \d+ rows offered/)?.[0] ?? ""}${db ? `; clone has ${db} live records` : ""}`,
    };
  });

  await ctx.step(["T33"], "import an XLSX through the importer", admin, async () => {
    await open(admin, tidA, "?view=grid&rail=import", { needFile: true });
    await admin.locator("input[type=file]").first().setInputFiles({ name: "visit-log-sept-2.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: xlsxBuffer });
    await sleep(3000);
    const r = await runImporter(admin, admin.locator("body"), "xlsx import", XLSX_ROWS.length);
    await open(admin, tidA, "?view=grid");
    const rows = await rowsOf(admin);
    const missing = XLSX_ROWS.filter(([p, , m]) => !rows.some((x) => x.text.includes(p) && x.text.includes(String(m))));
    return { ok: missing.length === 0, detail: `${rows.length} rows now; ${missing.length ? `MISSING ${missing.map((x) => x[0]).join(", ")}` : "all three spreadsheet patients with their minutes"}; importer: ${r.said.match(/\d+ landed[^.]*?of \d+ rows offered/)?.[0] ?? ""}` };
  });

  // ═══ B. paste into the Grid (a block of cells at the selected cell) ═══════════════════════════
  await ctx.step(["T30"], "paste a block of cells into the Grid", admin, async () => {
    await open(admin, tidA, "?view=grid");
    const before = await rowsOf(admin);
    const target = before.slice(0, GRID_BLOCK.length);
    const ci = await colIndex(admin, "Minutes");
    if (ci < 0) return { ok: false, detail: `no Minutes column in the Grid: ${(await headers(admin)).join(" / ")}` };
    await admin.locator("tbody tr[data-row-id]").first().locator("td").nth(ci).click();
    await sleep(600);
    const sent = await pasteEvent(admin, null, GRID_BLOCK.map((r) => r.join("\t")).join("\n"));
    await sleep(3000);
    // A paste that needs a question answered (new choice words, rows past the end) asks it in a dialog.
    const dlg = admin.getByRole("dialog");
    let asked = "";
    if (await dlg.count()) {
      asked = clean(await dlg.first().innerText().catch(() => ""));
      const ok = dlg.first().getByRole("button", { name: /^(Paste|Apply|Confirm|Yes|Add|Continue)/ }).first();
      if (await ok.count()) await ok.click().catch(() => {});
      await sleep(3000);
    }
    await open(admin, tidA, "?view=grid");
    const after = await rowsOf(admin);
    const bad = [];
    target.forEach((t, i) => {
      const row = after.find((a) => a.id === t.id);
      const [mins] = GRID_BLOCK[i];
      if (!row || !new RegExp(`\\b${mins}\\b`).test(row.text) || !/Oct\s+0?[12],\s+2026|2026-10-0[12]|10\/0?[12]\/2026/.test(row.text)) bad.push(`${t.text.slice(0, 30)} → ${row?.text.slice(0, 60) ?? "gone"}`);
    });
    return { ok: bad.length === 0, detail: `pasted on ${sent}${asked ? `; it asked "${asked.slice(0, 160)}"` : ""}; ${bad.length ? `NOT LANDED: ${bad.join(" | ")}` : `both rows carry ${GRID_BLOCK.map((g) => g[0]).join(" and ")} minutes and their new dates`}` };
  });

  // ═══ C. paste into the Sheet (the Paste dialog) ═══════════════════════════════════════════════
  await ctx.step(["T31"], "paste three visits into the Sheet (Paste dialog)", admin, async () => {
    await open(admin, tidA, "?view=sheet");
    await admin.getByRole("button", { name: /^Paste$/ }).first().click();
    const dlg = admin.getByRole("dialog").filter({ hasText: /Paste Rows|Confirm Pasted Rows/ });
    await dlg.waitFor({ timeout: 30000 });
    await dlg.locator("#pasteData").fill(["Patient\tVisit date\tMinutes\tPaid", ...SHEET_ROWS.map((r) => r.join("\t"))].join("\n"));
    await dlg.getByRole("button", { name: "Parse", exact: true }).click();
    await sleep(2500);
    const wizard = clean(await dlg.innerText());
    await dlg.locator("[data-matrx-import-confirm]").last().click();
    const rep = await until("the paste report", async () => /Pasted \d+ of \d+/.test(await dlg.innerText().catch(() => "")), 40000);
    const report = rep.v ? (clean(await dlg.innerText().catch(() => "")).match(/Pasted \d+ of \d+[^]{0,160}/)?.[0] ?? "") : `(no "Pasted n of n" line; dialog said "${clean(await dlg.innerText().catch(() => "(dialog gone)")).slice(0, 200)}")`;
    await admin.getByRole("button", { name: /^Done$/ }).first().click().catch(() => admin.keyboard.press("Escape"));
    await sleep(2000);
    await open(admin, tidA, "?view=sheet");
    const text = clean(await bodyText(admin, 30000));
    const missing = SHEET_ROWS.filter(([p]) => !text.includes(p));
    return { ok: missing.length === 0, detail: `wizard "${wizard.match(/\d+ of \d+ pasted columns[^]{0,40}/)?.[0] ?? wizard.slice(0, 120)}"; report "${report}"; ${missing.length ? `MISSING ${missing.map((x) => x[0]).join(", ")}` : "all three names are in the Sheet after a reload"}` };
  });

  // ═══ D. export ═══════════════════════════════════════════════════════════════════════════════
  const wanted = [...CSV_ROWS, ...XLSX_ROWS, ...SHEET_ROWS].map((r) => r[0]);
  const exportRail = async () => {
    await open(admin, tidA, "?view=grid");
    await admin.getByRole("button", { name: "Table menu" }).first().click();
    await sleep(1000);
    await admin.getByRole("menuitemcheckbox", { name: "Export" }).click();
    await admin.locator("[data-rail-column]").getByRole("button", { name: "CSV", exact: true }).waitFor({ timeout: 60000 });
  };
  await ctx.step(["T34"], "export the table as CSV", admin, async () => {
    await exportRail();
    const dl = admin.waitForEvent("download", { timeout: 60000 });
    await admin.locator("[data-rail-column]").getByRole("button", { name: "CSV", exact: true }).click();
    const d = await dl;
    const file = join(OUT, "tables-bulk-export.csv");
    await d.saveAs(file);
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n").filter(Boolean);
    const missing = wanted.filter((p) => !text.includes(p));
    return { ok: missing.length === 0, detail: `${d.suggestedFilename()}: ${lines.length - 1} rows, header "${lines[0]}"${missing.length ? `; MISSING ${missing.join(", ")}` : `; all ${wanted.length} patients are in the file`}` };
  });
  await ctx.step(["T34"], "export the table as XLSX", admin, async () => {
    await exportRail();
    const dl = admin.waitForEvent("download", { timeout: 60000 });
    await admin.locator("[data-rail-column]").getByRole("button", { name: "XLSX", exact: true }).click();
    const d = await dl;
    const file = join(OUT, "tables-bulk-export.xlsx");
    await d.saveAs(file);
    const wb = await readWorkbook(readFileSync(file));
    const rows = wb.sheets[0].grid();
    const flat = JSON.stringify(rows);
    const missing = wanted.filter((p) => !flat.includes(p));
    return { ok: missing.length === 0, detail: `${d.suggestedFilename()}: ${rows.length - 1} rows, header ${JSON.stringify(rows[0])}${missing.length ? `; MISSING ${missing.join(", ")}` : `; all ${wanted.length} patients are in the workbook`}` };
  });
  await ctx.step(["T34"], "export the table as JSON (Copy as → Download → JSON)", admin, async () => {
    await exportRail();
    await admin.locator("[data-rail-column]").getByRole("button", { name: /Copy, transform or export/ }).first().click();
    await sleep(1200);
    await admin.getByText("Download", { exact: true }).first().click();
    await sleep(700);
    const dl = admin.waitForEvent("download", { timeout: 60000 });
    await admin.getByText("JSON", { exact: true }).first().click();
    const d = await dl;
    const file = join(OUT, "tables-bulk-export.json");
    await d.saveAs(file);
    const text = readFileSync(file, "utf8");
    let n = null;
    try {
      const j = JSON.parse(text);
      n = Array.isArray(j) ? j.length : Object.keys(j).length;
    } catch {}
    const missing = wanted.filter((p) => !text.includes(p));
    return { ok: missing.length === 0 && n !== null, detail: `${d.suggestedFilename()}: ${n ?? "unparseable"} records${missing.length ? `; MISSING ${missing.join(", ")}` : `; all ${wanted.length} patients are in the file`}` };
  });

  // ═══ E. the record panel, its history ═════════════════════════════════════════════════════════
  let recId = null;
  let recText = "";
  await ctx.step(["T43"], "open a record (?record=<id>), edit Minutes in the panel, the Grid shows it", admin, async () => {
    await open(admin, tidA, "?view=grid");
    const rows = await rowsOf(admin);
    const row = rows.find((r) => r.text.includes("Zoë Brennan"));
    if (!row) return { ok: false, detail: `no Zoë Brennan row: ${rows.map((r) => r.text.slice(0, 30)).join(" | ")}` };
    recId = row.id;
    await open(admin, tidA, `?view=grid&record=${recId}`);
    await sleep(2500);
    const panel = admin.locator("[data-rail-column]").filter({ hasText: "History" }).first();
    const opened = await until("the record panel", async () => (await panel.count()) > 0, 60000);
    if (!opened.v) return { ok: false, detail: `?record=${recId} drew no record panel: ${clean(await bodyText(admin, 400))}` };
    recText = clean(await panel.innerText());
    await panel.getByRole("button", { name: "Edit", exact: true }).first().click();
    await sleep(1200);
    const mins = panel.locator("input[id^='field-']").nth(1);
    // The panel's inputs are in column order: Title, Minutes, Visit date (Paid is a button).
    const inputs = await panel.locator("input[id^='field-']").evaluateAll((es) => es.map((e) => e.value));
    const at = inputs.findIndex((v) => v === "60");
    if (at < 0) return { ok: false, detail: `no Minutes input holding 60 in the panel: ${JSON.stringify(inputs)}` };
    const box = panel.locator("input[id^='field-']").nth(at);
    await box.fill("50");
    await panel.getByRole("button", { name: "Save", exact: true }).first().click();
    await sleep(3000);
    await open(admin, tidA, "?view=grid");
    const after = (await rowsOf(admin)).find((r) => r.id === recId);
    return { ok: !!after && /\b50\b/.test(after.text) && !/\b60\b/.test(after.text), detail: `record ${recId.slice(0, 8)}…; panel opened with "${recText.slice(0, 120)}"; after the save the Grid row reads "${after?.text ?? "gone"}"` };
  });

  await ctx.step(["T58"], "the panel's History lists the edit with who and when", admin, async () => {
    if (!recId) return { skip: "no record was opened" };
    await open(admin, tidA, `?view=grid&record=${recId}`);
    const list = admin.getByRole("listbox", { name: /Versions of this record/ });
    const there = await until("History list", async () => (await list.count()) > 0, 60000);
    if (!there.v) return { ok: false, detail: `the panel's History shows no versions list: ${clean(await bodyText(admin, 20000)).match(/History[^]{0,200}/)?.[0] ?? ""}` };
    const entries = await list.getByRole("option").evaluateAll((es) => es.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
    const edit = entries.find((e) => /edited/i.test(e) && /Minutes/i.test(e));
    const ok = !!edit && !/somebody/i.test(edit) && /(just now|minute|hour|ago|\b[A-Z][a-z]{2}\b)/.test(edit);
    return { ok, detail: `${entries.length} versions: ${entries.map((e) => `"${e.slice(0, 90)}"`).join(" ; ")}${edit ? "" : " — NO edit of Minutes listed"}` };
  });
  await ctx.step(["T58"], "put the record back to its first version", admin, async () => {
    if (!recId) return { skip: "no record was opened" };
    const list = admin.getByRole("listbox", { name: /Versions of this record/ });
    const rows = list.getByRole("option");
    const n = await rows.count();
    if (n < 2) return { ok: false, detail: `only ${n} versions to choose from` };
    await rows.nth(n - 1).click();
    await sleep(600);
    await admin.getByRole("button", { name: "Put the record back to this version" }).first().click();
    const yes = admin.getByRole("button", { name: "Yes, put it back" });
    const asked = await until("the restore question", async () => (await yes.count()) > 0, 30000);
    if (!asked.v) return { ok: false, detail: "no 'Yes, put it back' after asking to put the record back" };
    const q = clean(await yes.first().locator("xpath=ancestor::div[contains(@class,'amber')]").first().innerText().catch(() => ""));
    await yes.first().click();
    const said = await until("Put back as version", async () => /Put back as version \d+/.test(await bodyText(admin, 30000)), 60000);
    const say = clean(await bodyText(admin, 30000)).match(/Put back as version \d+[^.]*\./)?.[0] ?? "";
    await open(admin, tidA, "?view=grid");
    const after = (await rowsOf(admin)).find((r) => r.id === recId);
    return { ok: !!said.v && !!after && /\b60\b/.test(after.text), detail: `asked "${q.slice(0, 120)}"; said "${say}"; the Grid row now reads "${after?.text ?? "gone"}"` };
  });

  // ═══ F. keys never shown (owner, then viewer) ═════════════════════════════════════════════════
  const keyReport = {};
  await ctx.step(["T59"], "owner: no column keys, ids or secrets on the table page, record panel, settings rail, export rail", admin, async () => {
    const found = {};
    await open(admin, tidA, "?view=grid");
    found.grid = await keysSeen(admin);
    await open(admin, tidA, "?view=sheet");
    found.sheet = await keysSeen(admin);
    if (recId) {
      await open(admin, tidA, `?view=grid&record=${recId}`);
      await sleep(2000);
      found.record = await keysSeen(admin);
    }
    await open(admin, tidA, "?view=grid&rail=settings");
    await sleep(2500);
    found.settings = await keysSeen(admin);
    await exportRail();
    found.export = await keysSeen(admin);
    Object.assign(keyReport, { owner: found });
    const all = Object.entries(found).flatMap(([k, v]) => v.map((h) => `${k}: ${h}`));
    return { ok: all.length === 0, detail: all.length ? `SHOWN TO A PERSON — ${all.join("; ")}` : "grid, sheet, record panel, settings rail and export rail read clean" };
  });
  await ctx.step(["T59"], "viewer (test@test.com): the same pages read clean", member ?? admin, async () => {
    member = await ctx.page("member");
    const found = {};
    await open(member, tidA, "?view=grid");
    const t = clean(await bodyText(member, 600));
    if (/not found|do not have access|cannot open|No access/i.test(t) && !(await member.locator("thead th").count())) return { ok: false, detail: `the viewer cannot open the table: ${t.slice(0, 200)}` };
    found.grid = await keysSeen(member);
    if (recId) {
      await open(member, tidA, `?view=grid&record=${recId}`);
      await sleep(2000);
      found.record = await keysSeen(member);
    }
    await open(member, tidA, "?view=grid&rail=settings");
    await sleep(2000);
    found.settings = await keysSeen(member);
    const all = Object.entries(found).flatMap(([k, v]) => v.map((h) => `${k}: ${h}`));
    return { ok: all.length === 0, detail: all.length ? `SHOWN TO A VIEWER — ${all.join("; ")}` : `grid, record panel and settings rail read clean for the viewer (${(await headers(member)).length} headers)` };
  });
  writeFileSync(join(OUT, "tables-bulk-keys.json"), JSON.stringify(keyReport, null, 2));

  }
  // ═══ G. 300 visits pasted into an EMPTY Grid as the owner, then paged ═════════════════════════
  tid300 = await newTable(T_300);
  ctx.cleanup(async () => console.log(`[tables-bulk] cleanup ${T_300}: ${await archive(tid300)}`));
  await ctx.step(["T32"], "owner: paste 300 visits (5 columns) into the empty Grid", admin, async () => {
    await open(admin, tid300, "?view=grid");
    const sent = await pasteEvent(admin, "[data-records-grid-wrap]", bigPaste);
    const wiz = admin.locator("[data-records-grid-paste-import]");
    const asked = await until("the paste wizard", async () => (await wiz.count()) > 0, 30000);
    if (!asked.v) return { ok: false, detail: `a paste onto the empty Grid (${sent}) opened no wizard: ${clean(await bodyText(admin, 400))}` };
    await sleep(2500);
    const wizText = clean(await wiz.innerText());
    const r = await runImporter(admin, wiz, "300-row paste", 300);
    await open(admin, tid300, "?view=grid");
    const hs = await headers(admin);
    const rows = await rowsOf(admin);
    const f = await footer(admin);
    const text = rows.map((x) => x.text).join(" | ");
    const texts = await collectPage(admin);
    const withValues = texts.filter((x) => /V-\d{4}/.test(x) && /\b\d{2}\b/.test(x) && /Sep \d+, 2026/.test(x)).length;
    const db = cloneSql(`select count(*) from custom.record r where r.table_id = '${tid300}' and r.deleted_at is null`);
    // The wizard names the records by one pasted column ("X goes into Title"); every OTHER pasted column must be a column now.
    const named = wizText.match(/called\s+(.+?) goes into Title/)?.[1]?.trim();
    const expectCols = ["Patient", "Visit", "Minutes", "Visit date", "Paid"].filter((c) => c !== named);
    const columnsOk = expectCols.every((c) => hs.some((h) => h.toLowerCase().startsWith(c.toLowerCase())));
    return {
      ok: columnsOk && withValues > 0 && withValues === texts.length && /of 300/.test(f),
      detail: `wizard "${wizText.slice(0, 160)}"; importer "${r.said.match(/\d+ landed[^.]*?of \d+ rows offered/)?.[0] ?? ""}" (question: ${r.policy}); columns ${hs.join(" / ")}; records named by "${named}"; ${withValues} of ${texts.length} rows scrolled past on page 1 carry a visit, minutes and a date; footer ${f}${db ? `; clone has ${db}` : ""}${columnsOk ? "" : `; A PASTED COLUMN IS MISSING (expected ${expectCols.join(", ")})`}`,
    };
  });
  await ctx.step(["T35"], "all 300 rows reachable page by page; the pager says the truth", admin, async () => {
    await open(admin, tid300, "?view=grid");
    const seen = new Set();
    const pages = [];
    for (let p = 0; p < 8; p++) {
      const texts = await collectPage(admin);
      const ids = texts.map((t) => t.match(/V-\d{4}/)?.[0]).filter(Boolean);
      pages.push(`${await footer(admin)} (${ids.length})`);
      ids.forEach((i) => seen.add(i));
      const next = admin.getByRole("button", { name: "Next page" }).first();
      if (!(await next.count()) || (await next.isDisabled().catch(() => true))) break;
      await next.click();
      await sleep(3500);
    }
    const missing = BIG.map((b) => b[0]).filter((v) => !seen.has(v));
    return { ok: seen.size === 300 && /of 300/.test(pages[0] ?? "") && pages.some((p) => /\b300 of 300\b|[–-]\s*300 of 300/.test(p)), detail: `${seen.size} of 300 visits reachable; pager read ${pages.join(" → ")}${missing.length ? `; NEVER REACHED ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ` +${missing.length - 8}` : ""}` : ""}` };
  });

  // ═══ H. an Editor pastes into an empty table ═════════════════════════════════════════════════
  tidEd = await newTable(T_ED);
  ctx.cleanup(async () => console.log(`[tables-bulk] cleanup ${T_ED}: ${await archive(tidEd)}`));
  await ctx.step(["T32"], "owner shares the empty table to test@test.com as Editor (Share dialog)", admin, async () => {
    await open(admin, tidEd, "?view=grid");
    await admin.getByRole("button", { name: "Share" }).first().click();
    const dlg = admin.getByRole("dialog").first();
    await dlg.getByText("test@test.com").first().click({ timeout: 60000 });
    await sleep(800);
    await dlg.getByText("Viewer", { exact: true }).first().click();
    await sleep(800);
    await admin.getByRole("option", { name: /^Editor/ }).first().click().catch(async () => admin.getByText(/^Editor/).first().click());
    await sleep(600);
    await dlg.getByRole("button", { name: /^Share with User$/ }).first().click();
    await sleep(3500);
    const text = clean(await dlg.innerText());
    const access = text.match(/Current Access[^]*?(?=Share with User|$)/)?.[0] ?? "";
    await admin.keyboard.press("Escape");
    return { ok: /test@test\.com/.test(access) && /Editor/i.test(access), detail: `Current Access reads "${access.slice(0, 200)}"` };
  });
  await ctx.step(["T32"], "Editor: paste 4 columns × 3 rows into the empty table — the values land", admin, async () => {
    member = member ?? (await ctx.page("member"));
    await open(member, tidEd, "?view=grid");
    const sent = await pasteEvent(member, "[data-records-grid-wrap]", intakePaste);
    const wiz = member.locator("[data-records-grid-paste-import]");
    const asked = await until("the paste wizard", async () => (await wiz.count()) > 0, 30000);
    if (!asked.v) return { ok: false, detail: `the Editor's paste onto the empty Grid (${sent}) opened no wizard: ${clean(await bodyText(member, 400))}` };
    await sleep(2500);
    const wizText = clean(await wiz.innerText());
    const mode = wiz.locator("select").filter({ has: member.locator('option[value="create"]') }).first();
    const choices = (await mode.count()) ? await mode.locator("option").allInnerTexts() : [];
    const go = wiz.getByRole("button", { name: /^Import \d+ rows?/ }).first();
    await go.click();
    await until("the report", async () => /\d+ landed/.test(await wiz.innerText().catch(() => "")), 120000);
    const report = clean(await wiz.innerText().catch(() => "")).match(/\d+ landed[^]{0,260}/)?.[0] ?? "";
    // What the owner sees, with the Editor's columns approved if the organization asks a person first.
    await open(admin, tidEd, "?view=grid");
    const seen = async () => {
      const t = clean((await rowsOf(admin)).map((r) => r.text).join(" | "));
      return { t, ok: INTAKE.every((r) => t.includes(r[0]) && t.includes(r[1]) && new RegExp(`\\b${r[2]}\\b`).test(t)) };
    };
    let state = await seen();
    let approved = "";
    const firstLook = `columns ${(await headers(admin)).join(" / ")}; rows "${state.t.slice(0, 200)}"`;
    if (!state.ok) {
      await open(admin, tidEd, "?view=grid&rail=inbox");
      await sleep(3000);
      const inboxText = clean(await admin.locator("[data-rail-column]").first().innerText().catch(() => ""));
      const cards = await admin.locator("[data-rail-column] [role=listitem], [data-rail-column] li, [data-rail-column] article").evaluateAll((es) => es.map((e) => e.innerText.replace(/\s+/g, " ").trim().slice(0, 120))).catch(() => []);
      let empties = 0;
      for (let i = 0; i < 10 && empties < 2; i++) {
        const ap = admin.locator("[data-rail-column]").getByRole("button", { name: /^Approve/ }).first();
        if (!(await ap.count())) {
          empties += 1;
          await sleep(3000);
          continue;
        }
        empties = 0;
        await ap.click().catch(() => {});
        await sleep(3500);
      }
      approved = `before any approval the owner saw ${firstLook}; inbox "${inboxText.slice(0, 200)}" cards ${JSON.stringify(cards.slice(0, 6))}; the owner pressed Approve until none were left`;
      await open(admin, tidEd, "?view=grid");
      state = await seen();
    }
    const hs = (await headers(admin)).join(" / ");
    return { ok: state.ok, detail: `wizard "${wizText.slice(0, 140)}"; choices [${choices.join(" | ")}]; Editor's report "${report.slice(0, 160)}"; ${approved ? `${approved}; ` : ""}owner then sees columns ${hs}; rows "${state.t.slice(0, 240)}"${state.ok ? "" : " — THE EDITOR'S PASTED VALUES DID NOT LAND (BREAKER-4 B4-03)"}` };
  });
} catch (e) {
  await ctx.step([], "walk aborted", admin ?? null, async () => ({ ok: false, detail: String(e?.message ?? e).slice(0, 500) }));
} finally {
  await ctx.finish();
}
