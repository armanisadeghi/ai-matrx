// scripts/safety-net/walks/tables-views-share.mjs — LANE SN-T3 (2026-10-01): Tables, views + sharing.
//
// T36 grid · T37 sheet · T38 board (kanban) incl. a drag that persists · T39 calendar · T40 gallery
// (every record reachable) · T41 "Make it work" · T42 Ask AI → approval card · T44 share (owner) ·
// T45 share (editor) · T46 share (viewer, read-only).
//
// THE USE CASE. Cedar Ridge Physical Therapy's front desk keeps a follow-up list: patient, status
// (New / Scheduled / Completed), follow-up date, notes, called back. The owner (admin@admin.com) opens
// it as a grid, a sheet, a board and a calendar, moves a patient's card to Completed, shares the list
// with the colleague at the counter (test@test.com) first as Viewer and then as Editor; the colleague
// sees it read-only, then edits a note and it lands. A second, plain callback list (no choice, date
// or picture column) is opened as a board, a calendar and a gallery and each says what it needs and
// makes it ("Make it work"); Ask AI then adds a record and the change waits for approval.
//
// Runs unchanged on live (https://www.aimatrx.com) and on the clone preview. Fixtures carry STAMP in
// their name and are unshared + archived at the end (cleanup), even when a step failed.
//
//   node scripts/safety-net/run.mjs --target clone --origin http://safety-net-t3.localhost:3001 --only tables.walk-views-share
import { openWalk, bodyText, sleep, until, STAMP, ORIGIN } from "../lib/harness.mjs";

const ctx = await openWalk("tables-views-share");
const LOCAL = !ORIGIN.includes("aimatrx.com");
const NAME = `Front Desk Follow-ups ${STAMP}`;
const PLAIN = `Patient Callback List ${STAMP}`;
const MEMBER = "test@test.com";
const now = new Date();
const YM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
// The follow-up list: [patient — reason, status, day of this month]. Days are fixed so every run
// puts the same records on the same dates whatever day it is run.
const ROWS = [
  ["Dana Whitcomb - knee rehab follow-up", "New", "10"],
  ["Luis Ortega - reschedule Thursday visit", "Scheduled", "10"],
  ["Priya Nair - insurance pre-authorization", "New", "17"],
  ["Marcus Bell - post-op shoulder check-in", "Scheduled", "24"],
  ["Hana Okafor - discharge summary request", "Completed", "03"],
];
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

let admin = null;
let member = null;
let tid = null; // the follow-up list
let pid = null; // the plain callback list
let keep = null;
const made = [];

// ── a parked preview is the walk's weather, not the product's: resume it and carry on ──────────
async function unpark(page) {
  if (!LOCAL || !page.url().includes("__dev-walk")) return false;
  await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
  await page.waitForURL((u) => !u.toString().includes("__dev-walk"), { timeout: 120000 }).catch(() => {});
  await sleep(3000);
  return true;
}
async function go(page, path) {
  await ctx.goto(page, path);
  if (await unpark(page)) await ctx.goto(page, path);
}
/** Run `fn`; if the preview parked the tab meanwhile, resume, reload `path`, and run it once more. */
async function guard(page, path, fn) {
  try {
    return await fn();
  } catch (e) {
    if (!(await unpark(page))) throw e;
    await go(page, path);
    return await fn();
  }
}
const main = async (page) => clean(await page.locator("main").innerText().catch(() => ""));
const heads = (page) => page.locator("thead th").evaluateAll((ths) => ths.map((t) => (t.textContent ?? "").replace(/[↑↓]/g, "").trim()).filter(Boolean));
const board = (page) =>
  page.locator("section[data-board-column]").evaluateAll((els) =>
    els.map((e) => ({ name: e.getAttribute("data-board-column"), cards: [...e.querySelectorAll("li")].map((l) => (l.textContent ?? "").trim()) })),
  );
const inColumn = (cols, column, patient) => (cols.find((c) => c.name === column)?.cards ?? []).some((c) => c.includes(patient));

async function openTable(page, id, view, ready) {
  const path = `/data-v2/${id}${view ? `?view=${view}` : ""}`;
  await go(page, path);
  const r = await until(`${view ?? "table"} draws`, async () => {
    await unpark(page);
    return ready ? await ready() : (await main(page)).length > 40;
  }, 150000);
  await sleep(1500);
  return !!r.v;
}

async function newTable(page, name) {
  await go(page, "/data-v2");
  const nt = page.getByRole("button", { name: "New table" }).first();
  await nt.waitFor({ timeout: 150000 });
  await nt.click();
  await page.getByPlaceholder("Table name").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const opened = await until("the new table opens", async () => /\/data-v2\/[0-9a-f-]{36}/.test(page.url()), 150000);
  if (!opened.v) throw new Error("the new table did not open");
  await sleep(4000);
  return page.url().match(/\/data-v2\/([0-9a-f-]{36})/)[1];
}

async function addColumn(page, path, name, kind, options = []) {
  await guard(page, path, async () => {
    await page.getByRole("button", { name: /^Column$/ }).first().click({ timeout: 90000 });
    const d = page.getByRole("dialog").filter({ hasText: "Add New Column" });
    await d.waitFor({ timeout: 30000 });
    await d.locator("input").first().fill(name);
    await d.getByRole("combobox").nth(0).click();
    await sleep(500);
    await page.getByRole("option").filter({ hasText: kind }).first().click({ timeout: 20000 });
    await sleep(500);
    for (const o of options) {
      const box = d.getByPlaceholder("Add an option…");
      await box.fill(o);
      await box.press("Enter");
      await sleep(300);
    }
    await d.getByRole("button", { name: "Add Column", exact: true }).click();
    await sleep(3500);
  });
}

async function addRow(page, path, title, extra = {}) {
  await guard(page, path, async () => {
    if ((await page.locator("tbody tr", { hasText: title }).count()) > 0) return;
    await page.getByRole("button", { name: /^Row$/ }).first().click({ timeout: 90000 });
    const f = page.getByRole("dialog").filter({ hasText: "Add New Row" });
    await f.waitFor({ timeout: 30000 });
    await f.locator("#title").fill(title);
    if (extra.status) {
      await f.locator("#status").click();
      await sleep(400);
      await page.getByRole("option", { name: extra.status, exact: true }).click();
    }
    if (extra.day) {
      await f.locator("#follow_up_date").click();
      await sleep(700);
      await page.locator(`td[data-day="${YM}-${extra.day}"] button`).first().click();
      await sleep(400);
    }
    await f.getByRole("button", { name: "Add Row", exact: true }).click();
    await sleep(3000);
  });
}

async function archive(page, id, why) {
  if (!id || !page) return;
  await go(page, `/data-v2/${id}?rail=settings`);
  await sleep(4000);
  if (await page.getByText("This table is archived").count()) return;
  const btn = page.getByRole("button", { name: "Archive this table", exact: true });
  const there = await until("Archive this table", async () => (await btn.count()) > 0, 60000);
  if (!there.v) throw new Error(`the Settings rail of ${id} shows no Archive this table`);
  await btn.first().click();
  await sleep(1500);
  await btn.last().click();
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: /archived/i });
  const done = await until("archived notice", async () => (await toast.count()) > 0 || (await page.getByText("This table is archived").count()) > 0, 120000);
  console.log(`[tables-views-share] ${why}: ${done.v ? "archived" : "NOT archived"} ${id}`);
  if (!done.v) throw new Error(`could not archive the fixture table ${id}`);
}

try {
  admin = await ctx.page("admin");
  if (!admin.__org) {
    // The account-rail switcher can miss under load; a person tries again.
    const { setOrganization } = await import("../lib/harness.mjs");
    await sleep(3000);
    admin.__org = (await setOrganization(admin, "Cedar Ridge Physical Therapy").catch(() => false)) ? "Cedar Ridge Physical Therapy" : null;
  }
  if (LOCAL) {
    keep = setInterval(() => {
      for (const p of [admin, member].filter(Boolean)) {
        if (p.url().includes("__dev-walk")) continue;
        p.evaluate(() => fetch("/__dev-walk?activity=1", { method: "POST" }).then((r) => r.status).catch(() => 0)).catch(() => {});
      }
    }, 15000);
  }
  ctx.cleanup(async () => keep && clearInterval(keep));

  // ── SETUP: the follow-up list, made through the product ─────────────────────────────────────
  await ctx.step([], "make the follow-up list (table, 4 columns, 5 patients)", admin, async () => {
    if (!admin.__org) return { ok: false, detail: "the organization switcher never named Cedar Ridge Physical Therapy" };
    tid = await newTable(admin, NAME);
    made.push(tid);
    ctx.cleanup(async () => archive(admin, tid, "cleanup follow-up list"));
    const path = `/data-v2/${tid}?view=sheet`;
    await go(admin, path);
    await admin.getByRole("button", { name: /^Column$/ }).first().waitFor({ timeout: 150000 });
    await addColumn(admin, path, "Status", /^Choice/, ["New", "Scheduled", "Completed"]);
    await addColumn(admin, path, "Follow-up date", /^Date\s*Calendar date/);
    await addColumn(admin, path, "Notes", /^Text\s*Plain/);
    await addColumn(admin, path, "Called back", /^Yes \/ No/);
    for (const [t, status, day] of ROWS) await addRow(admin, path, t, { status, day });
    await go(admin, path);
    await until("the rows", async () => (await admin.locator("tbody tr").count()) >= ROWS.length, 60000);
    const hs = await heads(admin);
    const rows = await admin.locator("tbody tr", { hasText: / - / }).count();
    return { ok: rows === ROWS.length && ["Status", "Follow-up date", "Notes", "Called back"].every((h) => hs.includes(h)), detail: `table ${tid}: columns ${hs.join(" | ")}; ${rows} patients` };
  });
  if (!tid) throw new Error("no follow-up list to walk");
} catch (e) {
  await ctx.step([], "walk aborted in setup", admin, async () => ({ ok: false, detail: String(e?.message ?? e).slice(0, 400) }));
}

// ── PART 1: the owner's four looks at the follow-up list ─────────────────────────────────────
if (tid) {
  try {
    await ctx.step(["T36"], "grid: every patient, every column, the status words", admin, async () => {
      const ok = await openTable(admin, tid, "grid", async () => (await admin.locator("tbody tr", { hasText: / - / }).count()) >= ROWS.length);
      const hs = await heads(admin);
      const t = await main(admin);
      const missing = ROWS.filter(([n]) => !t.includes(n)).map(([n]) => n);
      const words = ["New", "Scheduled", "Completed"].filter((w) => !t.includes(w));
      const ticks = await admin.locator('tbody [role="checkbox"]').count();
      return {
        ok: ok && !missing.length && !words.length && ["Title", "Status", "Follow-up date", "Notes", "Called back"].every((h) => hs.includes(h)),
        detail: `columns ${hs.join(" | ")}; patients missing: ${missing.join(", ") || "none"}; status words missing: ${words.join(", ") || "none"}; ${ticks} checkbox cells`,
      };
    });

    await ctx.step(["T37"], "sheet: the same patients with Row / Column / Paste controls", admin, async () => {
      const ok = await openTable(admin, tid, "sheet", async () => (await admin.locator("[data-sheet-layout]").count()) > 0 && (await admin.locator("tbody tr", { hasText: / - / }).count()) >= ROWS.length);
      const t = await main(admin);
      const missing = ROWS.filter(([n]) => !t.includes(n)).map(([n]) => n);
      const controls = [];
      for (const b of ["Row", "Column", "Paste"]) if (await admin.getByRole("button", { name: new RegExp(`^${b}$`) }).count()) controls.push(b);
      return { ok: ok && !missing.length && controls.length === 3, detail: `sheet layout drawn; patients missing: ${missing.join(", ") || "none"}; controls: ${controls.join(", ")}` };
    });

    // T38 board + the drag, persisted
    const boardUrl = `/data-v2/${tid}?view=kanban`;
    await ctx.step(["T38"], "board: grouped by Status — New / Scheduled / Completed with the right cards", admin, async () => {
      await go(admin, boardUrl);
      const sel = admin.locator("#view-field-kanban");
      await sel.waitFor({ timeout: 150000 });
      await sel.selectOption({ label: "Status" });
      await until("columns", async () => (await admin.locator("section[data-board-column]").count()) >= 3, 60000);
      await sleep(2500);
      const cols = await board(admin);
      const want = { New: ["Dana Whitcomb", "Priya Nair"], Scheduled: ["Luis Ortega", "Marcus Bell"], Completed: ["Hana Okafor"] };
      const wrong = [];
      for (const [c, ps] of Object.entries(want)) for (const p of ps) if (!inColumn(cols, c, p)) wrong.push(`${p} not in ${c}`);
      return { ok: !wrong.length, detail: `columns ${cols.map((c) => `${c.name} ${c.cards.length}`).join(", ")}${wrong.length ? `; WRONG: ${wrong.join("; ")}` : ""}` };
    });

    await ctx.step(["T38"], "board: drag Priya Nair to Completed, it holds after a reload and shows in the grid", admin, async () => {
      const card = admin.locator('section[data-board-column="New"] li', { hasText: "Priya Nair" }).first();
      await card.dragTo(admin.locator('section[data-board-column="Completed"]'));
      const said = await until("the moved notice", async () => /Priya Nair[^.]*moved to Completed/i.test(await main(admin)) || null, 20000);
      await sleep(3000);
      const now1 = await board(admin);
      const landed = inColumn(now1, "Completed", "Priya Nair");
      await go(admin, boardUrl);
      await until("columns", async () => (await admin.locator("section[data-board-column]").count()) >= 3, 90000);
      await sleep(3000);
      const reloaded = await board(admin);
      const held = inColumn(reloaded, "Completed", "Priya Nair") && !inColumn(reloaded, "New", "Priya Nair");
      await openTable(admin, tid, "grid", async () => (await admin.locator("tbody tr", { hasText: "Priya Nair" }).count()) > 0);
      const row = clean(await admin.locator("tbody tr", { hasText: "Priya Nair" }).first().innerText());
      return {
        ok: landed && held && /Completed/.test(row),
        detail: `after drop: ${landed ? "in Completed" : "NOT in Completed"} (notice ${said.v ? "shown" : "not shown"}); after reload: ${held ? "still in Completed" : "BACK in New / gone"}; grid row: ${row.slice(0, 120)}`,
      };
    });
  } catch (e) {
    await ctx.step([], "part 1 aborted", admin, async () => ({ ok: false, detail: String(e?.message ?? e).slice(0, 400) }));
  }
}

// ── PART 2: calendar and gallery on the follow-up list (T39, T40) ─────────────────────────────
if (tid) {
  try {
    await ctx.step(["T39"], "calendar: each patient sits on their follow-up date", admin, async () => {
      const path = `/data-v2/${tid}?view=calendar`;
      await go(admin, path);
      await until("the calendar draws", async () => {
        await unpark(admin);
        return (await main(admin)).includes("Dana Whitcomb") || (await main(admin)).includes("Make it work");
      }, 150000);
      // A calendar with several date columns, or none picked yet, asks which one: pick Follow-up date.
      const pick = admin.locator("#view-field-calendar");
      if (await pick.count()) {
        await pick.selectOption({ label: "Follow-up date" }).catch(() => {});
        await sleep(3000);
      }
      await sleep(2500);
      const t = await main(admin);
      // Where each patient sits: the cell (a gridcell / day box) that holds their name and a day number.
      const placed = await admin.evaluate((names) => {
        const out = {};
        for (const n of names) {
          const el = [...document.querySelectorAll("main *")].find((e) => e.children.length === 0 && (e.textContent ?? "").includes(n));
          if (!el) { out[n] = null; continue; }
          let cell = el;
          for (let i = 0; i < 8 && cell; i += 1, cell = cell.parentElement) {
            const attr = cell.getAttribute?.("data-date") ?? cell.getAttribute?.("data-day") ?? cell.getAttribute?.("aria-label");
            if (attr && /\d{4}-\d{2}-\d{2}|\b\d{1,2}\b/.test(attr)) { out[n] = attr; break; }
          }
          if (!out[n]) out[n] = "(no dated cell found)";
        }
        return out;
      }, ROWS.map(([n]) => n.split(" - ")[0]));
      const wrong = ROWS.filter(([n, , day]) => {
        const seen = placed[n.split(" - ")[0]];
        return !seen || !new RegExp(`(^|\\D)${YM}-${day}(\\D|$)|-${day}$`).test(seen);
      }).map(([n, , day]) => `${n.split(" - ")[0]} should be on the ${Number(day)}th, found ${placed[n.split(" - ")[0]]}`);
      return { ok: !wrong.length, detail: wrong.length ? `WRONG: ${wrong.join("; ")}` : `all ${ROWS.length} patients on their dates (${JSON.stringify(placed)}); page says: ${t.slice(0, 120)}` };
    });

    await ctx.step(["T40"], "gallery: every patient has a card", admin, async () => {
      await go(admin, `/data-v2/${tid}?view=gallery`);
      await until("the gallery draws", async () => {
        await unpark(admin);
        return (await main(admin)).includes("Dana Whitcomb");
      }, 150000);
      await sleep(2500);
      const t = await main(admin);
      const missing = ROWS.filter(([n]) => !t.includes(n.split(" - ")[0])).map(([n]) => n.split(" - ")[0]);
      return { ok: !missing.length, detail: missing.length ? `cards missing: ${missing.join(", ")}` : `all ${ROWS.length} patients drawn` };
    });
  } catch (e) {
    await ctx.step([], "part 2 aborted", admin, async () => ({ ok: false, detail: String(e?.message ?? e).slice(0, 400) }));
  }
}

// ── PART 3: "Make it work" on a plain callback list (T41) ───────────────────────────────────
try {
  await ctx.step([], "make the plain callback list (title only, 3 patients)", admin, async () => {
    pid = await newTable(admin, PLAIN);
    ctx.cleanup(async () => archive(admin, pid, "cleanup callback list"));
    const path = `/data-v2/${pid}?view=sheet`;
    await go(admin, path);
    await admin.getByRole("button", { name: /^Row$/ }).first().waitFor({ timeout: 150000 });
    for (const t of ["Dana Whitcomb - knee rehab follow-up", "Luis Ortega - reschedule Thursday visit", "Priya Nair - insurance pre-authorization"]) await addRow(admin, path, t);
    return { ok: true, detail: `table ${pid}` };
  });
  if (pid) {
    const offers = async (view, sentence) => {
      await go(admin, `/data-v2/${pid}?view=${view}`);
      await until("the offer", async () => {
        await unpark(admin);
        return (await main(admin)).includes("Make it work");
      }, 150000);
      const t = await main(admin);
      return { said: t.includes(sentence), button: await admin.getByRole("button", { name: "Make it work" }).count(), ask: await admin.getByRole("button", { name: "Ask AI" }).count() };
    };
    const made = async (view, label) => {
      await admin.getByRole("button", { name: "Make it work" }).first().click();
      const gone = await until(`${label} laid out`, async () => !(await main(admin)).includes("Make it work"), 90000);
      await sleep(3000);
      return !!gone.v;
    };
    await ctx.step(["T41"], "board with no choice column: says so, Make it work makes Status and groups by it", admin, async () => {
      const o = await offers("kanban", "This table has no choice column to make the board's columns from.");
      const ok1 = await made("kanban", "the board");
      const cols = await board(admin);
      await openTable(admin, pid, "grid", async () => (await heads(admin)).length > 1);
      const hs = await heads(admin);
      return {
        ok: o.said && o.button > 0 && ok1 && hs.length > 2,
        detail: `offer sentence ${o.said ? "shown" : "MISSING"}, Make it work ${o.button ? "offered" : "absent"}, Ask AI ${o.ask ? "offered" : "absent"}; after: ${ok1 ? "board drawn" : "board still asks"} (columns ${cols.map((c) => `${c.name} ${c.cards.length}`).join(", ") || "none"}); grid columns now ${hs.join(" | ")}`,
      };
    });
    await ctx.step(["T41"], "calendar with no date column: says so, Make it work adds a date column", admin, async () => {
      const o = await offers("calendar", "This table has no date column to place records on.");
      const ok1 = await made("calendar", "the calendar");
      await openTable(admin, pid, "grid", async () => (await heads(admin)).length > 1);
      const hs = await heads(admin);
      return { ok: o.said && o.button > 0 && ok1, detail: `offer sentence ${o.said ? "shown" : "MISSING"}; after: ${ok1 ? "calendar lays out" : "calendar still asks"}; grid columns ${hs.join(" | ")}` };
    });
    await ctx.step(["T41"], "gallery with no file column: says so, Make it work adds a picture column", admin, async () => {
      const o = await offers("gallery", "The cards have no picture because this table has no file column.");
      const ok1 = await made("gallery", "the gallery");
      const t = await main(admin);
      return { ok: o.said && o.button > 0 && ok1 && t.includes("Dana Whitcomb"), detail: `offer sentence ${o.said ? "shown" : "MISSING"}; after: ${ok1 ? "gallery drawn" : "gallery still asks"}; cards ${t.includes("Dana Whitcomb") ? "present" : "absent"}` };
    });
  }
} catch (e) {
  await ctx.step([], "part 3 aborted", admin, async () => ({ ok: false, detail: String(e?.message ?? e).slice(0, 400) }));
}

await ctx.finish();
