// scripts/safety-net/walks/b-save-as-table.mjs — LANE SAFETY-NET-B (2026-10-01): A03 · A04 · A05.
//
// "Save to a table" lands a Table with the right fields, from the three places a person meets it:
//   A04 a note holding a markdown table → right-click → Save to a table… → Make the table
//   A05 the same table, rendered in Read mode, selected → the selection bar's More → Save to a table…
//   A03 a chat answer that is a markdown table → right-click → Save to a table…
// Each must end on the new table's page (/data-v2/<id>, the record store) with the four columns named exactly as the
// source and the deciding marker row in the grid. Same walk on LIVE (www.aimatrx.com) and on the CLONE preview.
// Fixtures carry the run stamp, live in Cedar Ridge Physical Therapy, and are archived at the end through the
// table's own Settings → Archive this table (ctx.cleanup).
//
//   node scripts/safety-net/run.mjs --target live --only agents.walk-save-as-table
//   node scripts/safety-net/run.mjs --target clone --plant b-save-as-table-fake-ok      (RED: the door claims success)
import { openWalk, sleep, until } from "../lib/harness.mjs";

const ctx = await openWalk("b-save-as-table");
const STAMP = ctx.stamp;
const COLS = ["Patient", "Visit type", "Therapist", "Minutes"];
const tableText = (marker) =>
  [
    `## Tomorrow's visits ${STAMP}`,
    "",
    "| Patient | Visit type | Therapist | Minutes |",
    "|---|---|---|---|",
    "| Priya Vantana | Follow-up | Dana Whitfield | 30 |",
    `| ${marker} | Initial Evaluation | Marcus Bell | 60 |`,
    "| Omar Haddad | Follow-up | Dana Whitfield | 30 |",
  ].join("\n");
const made = [];

async function theDialog(page) {
  const dlg = page.getByRole("dialog").filter({ hasText: "Save to a table" }).last();
  await dlg.waitFor({ timeout: 60000 });
  await until("the shape is read", async () => (await dlg.innerText()).includes("from"), 60000);
  return dlg;
}

/** Make the table from the open dialog, open it, and judge the columns and the marker row. */
async function makeAndJudge(page, marker, label) {
  const dlg = await theDialog(page);
  await sleep(1200);
  await dlg.getByRole("button", { name: /^Make the table/ }).click();
  const ok = await until("made", async () => (await dlg.innerText()).includes("was made"), 90000);
  if (!ok.v) return { ok: false, detail: `the dialog never said the table was made: ${(await dlg.innerText()).slice(0, 240)}` };
  await dlg.getByRole("button", { name: "Open the table" }).click();
  const grid = await until("the grid", async () => page.url().includes("/data-v2/") && (await page.locator("thead th").count()) > 1, 120000);
  const id = (page.url().match(/\/data-v2\/([0-9a-f-]{36})/) ?? [])[1];
  if (id) made.push(id);
  if (!grid.v || !id) return { ok: false, detail: `no table page opened (url ${page.url()})` };
  await sleep(4000);
  // Header cells draw upper-case (CSS) with glyphs (key, "+", sort marks): compare letters only, case-blind.
  const norm = (t) => t.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  const heads = (await page.locator("thead th").allInnerTexts()).map(norm).filter(Boolean);
  const body = await page.locator("tbody").first().innerText().catch(() => "");
  const missing = COLS.filter((c) => !heads.some((h) => h === norm(c) || h.startsWith(`${norm(c)} `)));
  return {
    ok: missing.length === 0 && body.includes(marker),
    detail: `${label}: table ${id}; columns ${JSON.stringify(heads.slice(0, 8))}${missing.length ? ` MISSING ${missing}` : ""}; marker row ${body.includes(marker) ? "present" : "ABSENT"}`,
  };
}

async function newNote(page, text) {
  await ctx.goto(page, "/notes");
  await sleep(6000);
  await page.getByRole("button", { name: /New Note/ }).last().click();
  const box = page.locator('textarea[placeholder="Start typing..."]').last();
  await box.waitFor({ timeout: 60000 });
  await box.fill(text);
  await sleep(4000); // autosave
  return box;
}

async function rightClickSave(page, scope, position) {
  // The menu draws late while a stream settles: two tries, the second after closing whatever opened.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await scope.click({ button: "right", ...(position ? { position } : {}) });
    await sleep(2500);
    const direct = page.getByRole("menuitem", { name: /^Save to a table/ }).first();
    if (!(await direct.isVisible().catch(() => false))) {
      await page.getByRole("menuitem", { name: /^Save$/ }).first().hover().catch(() => {});
      await sleep(1500);
    }
    try {
      await page.getByRole("menuitem", { name: /^Save to a table/ }).first().click({ timeout: 15000 });
      return;
    } catch (e) {
      if (attempt === 2) throw e;
      await page.keyboard.press("Escape");
      await sleep(2000);
    }
  }
}

try {
  const page = await ctx.page("admin");
  ctx.cleanup(async () => {
    for (const id of made) {
      await ctx.goto(page, `/data-v2/${id}?rail=settings`);
      const found = await until("archive button", async () => (await page.getByRole("button", { name: "Archive this table" }).count()) > 0, 120000);
      if (!found.v) throw new Error(`table ${id}: no Archive this table button`);
      await page.getByRole("button", { name: "Archive this table" }).first().click();
      await sleep(1500);
      await page.getByRole("button", { name: "Archive this table" }).last().click();
      await until("archived", async () => (await page.getByRole("button", { name: /Archiving/ }).count()) === 0, 120000);
      await sleep(1500);
    }
  });

  // A04 — from a note.
  const noteMarker = `Camille Duprez ${STAMP.split(" ").pop()}`;
  await ctx.step(["A04"], "note → Save to a table → a Table with the note's columns", page, async () => {
    const box = await newNote(page, tableText(noteMarker));
    await rightClickSave(page, box, { x: 120, y: 60 });
    return makeAndJudge(page, noteMarker, "from a note");
  });

  // A05 — from a text selection (Read mode, the selection bar's More).
  const selMarker = `Lena Ortiz ${STAMP.split(" ").pop()}`;
  await ctx.step(["A05"], "a selection in Read mode → Save to a table → a Table with the selection's columns", page, async () => {
    await newNote(page, tableText(selMarker));
    await page.getByRole("button", { name: /^Read$/ }).first().click().catch(() => {});
    await sleep(5000);
    const selected = await page.evaluate(() => {
      const body = [...document.querySelectorAll("table")].find((t) => t.closest("[contenteditable='true']") === null);
      if (!body) return false;
      const range = document.createRange();
      range.selectNodeContents(body);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const r = body.getBoundingClientRect();
      body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: r.left + 20, clientY: r.top + 10 }));
      document.dispatchEvent(new Event("selectionchange"));
      return true;
    });
    if (!selected) return { ok: false, detail: "no rendered table to select in Read mode" };
    await sleep(2500);
    const more = page.getByRole("button", { name: /More/ }).last();
    if (await more.isVisible().catch(() => false)) await more.click();
    await sleep(1200);
    const item = page.getByRole("menuitem", { name: /Save to a table/ }).or(page.getByRole("button", { name: /Save to a table/ })).first();
    if (!(await item.isVisible().catch(() => false))) return { ok: false, detail: "the selection bar does not offer Save to a table" };
    await item.click();
    return makeAndJudge(page, selMarker, "from a selection");
  });

  // A03 — from a chat answer.
  const chatMarker = `Theo Brannigan ${STAMP.split(" ").pop()}`;
  await ctx.step(["A03"], "a chat answer → Save to a table → a Table with the answer's columns", page, async () => {
    await ctx.goto(page, "/chat");
    await sleep(8000);
    const box = page.locator("textarea").last();
    await box.waitFor({ timeout: 90000 });
    await box.click();
    // fill, never type: a typed newline is Enter and sends the message half written.
    await box.fill(`Reply with only this markdown table, exactly as written, and no other words:\n\n${tableText(chatMarker).split("\n").slice(2).join("\n")}`);
    await sleep(800);
    await page.keyboard.press("Enter");
    const got = await until("the answer", async () => {
      const t = await page.locator("main").innerText();
      return t.split(chatMarker).length > 2; // once in the question, once in the answer
    }, 180000);
    if (!got.v) return { ok: false, detail: "the chat answer with the table never arrived" };
    await sleep(12000);
    const answerTable = page.locator("main table").last();
    if (!(await answerTable.count())) return { ok: false, detail: "the answer did not render a table" };
    await rightClickSave(page, answerTable, { x: 40, y: 20 });
    return makeAndJudge(page, chatMarker, "from a chat answer");
  });
} finally {
  await ctx.finish();
}
