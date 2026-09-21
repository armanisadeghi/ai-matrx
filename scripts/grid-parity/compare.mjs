/**
 * THE BEFORE/AFTER COMPARISON for the `/data` grid.
 *
 * `/data` renders a hand-rolled grid. The shared `MatrxDataTable` is supposed
 * to be able to replace it. The only honest way to know is to perform THE SAME
 * ACTIONS on both and compare WHAT A PERSON SEES — so every probe here is
 * written against the rendered table, never against either implementation's
 * internals: a column is found by its header text, a row by the value in its
 * Job cell, and a spreadsheet gesture is judged by what lands on the clipboard
 * or in the cell afterwards. A probe that reached for a `data-cell` attribute
 * would pass on the old grid and fail on the new one while the screen was
 * identical, which proves nothing about either.
 *
 * Run it against the OLD grid first — that run is the baseline. Re-point the
 * route, run it again, and diff.
 *
 *   node scripts/grid-parity/compare.mjs --label before
 *   node scripts/grid-parity/compare.mjs --label after --against before
 *
 * The fixture is `scripts/grid-parity/fixture.ts` (run it first). The lane's
 * dev server port comes from `scripts/campaign-ports.json`.
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const ROOT = process.cwd();
const HERE = resolve(ROOT, "scripts/grid-parity");
const PORTS = JSON.parse(readFileSync(resolve(ROOT, "scripts/campaign-ports.json"), "utf8"));
const PORT = PORTS.lanes["GRID-THREE"];
const HOST = "127.0.0.1";
const ORIGIN = `http://${HOST}:${PORT}`;

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const LABEL = argOf("label", "before");
const AGAINST = argOf("against", null);
const ONLY = argOf("only", null);
const HEADFUL = argv.includes("--headful");

const fixture = JSON.parse(readFileSync(resolve(HERE, ".fixture.json"), "utf8"));
/**
 * THE VIEW BOTH RUNS ARE JUDGED IN. Sorted by Job ascending and a page big
 * enough to hold every row a probe names, pinned in the URL — the table's own
 * view vocabulary (`sort` `ps` `hide` `f` `p` `q`). Without this the server
 * returns rows in whatever order it likes and the two runs are not looking at
 * the same screen.
 */
const TABLE_PATH = `/data/${fixture.tableId}`;
const TABLE_URL = `${TABLE_PATH}?sort=job.asc&ps=100`;

/* ─────────────────────────── page-side helpers ─────────────────────────── */

/**
 * Installed into the page once. Everything a probe needs to FIND something is
 * expressed here in terms a person would use: "the Amount cell of the Job 001
 * row". Both implementations render one semantic `<table>`; that is the whole
 * contract these helpers depend on.
 */
const PAGE_HELPERS = `
window.__parity = (() => {
  const norm = (s) => (s || "").replace(/\\s+/g, " ").trim();

  function grid() {
    const tables = Array.from(document.querySelectorAll("table"));
    // The data grid is the table with the most body rows on the page.
    let best = null, bestRows = -1;
    for (const t of tables) {
      const n = t.querySelectorAll("tbody tr").length;
      if (n > bestRows) { best = t; bestRows = n; }
    }
    return best;
  }

  function headers() {
    const t = grid();
    if (!t) return [];
    const row = t.querySelector("thead tr");
    if (!row) return [];
    return Array.from(row.children).map((th) => norm(th.textContent));
  }

  /** Index of the column whose header STARTS WITH the given label. */
  function colIndex(label) {
    const hs = headers();
    const want = norm(label).toLowerCase();
    let i = hs.findIndex((h) => h.toLowerCase() === want);
    if (i < 0) i = hs.findIndex((h) => h.toLowerCase().startsWith(want));
    return i;
  }

  function bodyRows() {
    const t = grid();
    if (!t) return [];
    // Only rows that carry as many cells as the header — a group header row or
    // a full-width notice row is not a data row in either implementation.
    const width = headers().length;
    return Array.from(t.querySelectorAll("tbody tr")).filter(
      (tr) => tr.children.length >= Math.max(2, width - 2),
    );
  }

  function rowByJob(job) {
    const j = colIndex("Job");
    if (j < 0) return null;
    return bodyRows().find((tr) => norm(tr.children[j]?.textContent) === job) || null;
  }

  function cell(job, column) {
    const tr = rowByJob(job);
    const c = colIndex(column);
    if (!tr || c < 0) return null;
    return tr.children[c] || null;
  }

  function cellText(job, column) {
    const el = cell(job, column);
    return el ? norm(el.textContent) : null;
  }

  /** The first job value in the table, top to bottom. */
  function firstJobs(n) {
    const j = colIndex("Job");
    if (j < 0) return [];
    return bodyRows().slice(0, n).map((tr) => norm(tr.children[j]?.textContent));
  }

  function rowCount() { return bodyRows().length; }

  /**
   * A colour a PERSON can see, resolved off the element or the nearest
   * ancestor that actually paints one. Returned as the raw computed value so
   * two implementations are compared on the pixel, not on a class name.
   */
  function paintedBg(el) {
    let node = el;
    while (node && node !== document.body) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
      node = node.parentElement;
    }
    return null;
  }

  function cellBg(job, column) {
    const el = cell(job, column);
    return el ? paintedBg(el) : null;
  }

  function rowBg(job) {
    const tr = rowByJob(job);
    return tr ? paintedBg(tr) : null;
  }

  /** Visible text of the whole page, normalised — for sentence assertions. */
  function pageText() { return norm(document.body.innerText); }

  function saysAny(...fragments) {
    const t = pageText().toLowerCase();
    return fragments.filter((f) => t.includes(f.toLowerCase()));
  }

  function activeEditor() {
    const a = document.activeElement;
    if (!a) return null;
    const tag = a.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") return { tag, value: a.value };
    if (a.getAttribute && a.getAttribute("contenteditable") === "true") {
      return { tag: "contenteditable", value: norm(a.textContent) };
    }
    return null;
  }

  return { grid, headers, colIndex, bodyRows, rowByJob, cell, cellText, firstJobs, rowCount, cellBg, rowBg, pageText, saysAny, activeEditor };
})();
`;

/* ─────────────────────────────── the probes ─────────────────────────────── */

const px = (page, fn, ...args) => page.evaluate(fn, ...args);

/** Click the centre of the cell a person would click. */
async function clickCell(page, job, column, opts = {}) {
  const box = await page.evaluate(
    ([j, c]) => {
      const el = window.__parity.cell(j, c);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    [job, column],
  );
  if (!box) throw new Error(`cell ${job}/${column} not found`);
  // `page.mouse.click(x, y, options)` has NO `modifiers` option — that only
  // exists on `locator.click()` / `elementHandle.click()`. Passing
  // `{ modifiers: [...] }` here is silently ignored by Playwright, so a
  // "shift-click" probe written this way never actually holds Shift down.
  // Found live 2026-09-20: `select.range`'s `byShiftClick` recorded a single
  // cell ("Cleo") — not because the grid mishandles shift-click, but because
  // the probe itself never pressed it. Holding the modifier keys explicitly
  // around the click is what a real shift-click is.
  const mods = opts.modifiers || [];
  for (const m of mods) await page.keyboard.down(m);
  try {
    await page.mouse.click(box.x, box.y, {
      button: opts.button,
      clickCount: opts.clickCount,
      delay: opts.delay,
    });
  } finally {
    for (const m of mods) await page.keyboard.up(m);
  }
  return box;
}

async function scrollCellIntoView(page, job, column) {
  await page.evaluate(
    ([j, c]) => {
      const el = window.__parity.cell(j, c);
      if (el) el.scrollIntoView({ block: "center", inline: "center" });
    },
    [job, column],
  );
  await page.waitForTimeout(150);
}

async function readClipboard(page) {
  return page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      return `__CLIPBOARD_ERROR__:${e && e.message}`;
    }
  });
}

async function writeClipboard(page, text) {
  await page.evaluate(async (t) => {
    await navigator.clipboard.writeText(t);
  }, text);
}

const MOD = process.platform === "darwin" ? "Meta" : "Control";

/**
 * Every capability in the owner's inventory, as a probe over the rendered
 * table. `observed` is what the two runs are compared on.
 */
const PROBES = [
  {
    id: "render.rows",
    group: "the table renders",
    async run(page) {
      const headers = await px(page, () => window.__parity.headers());
      const rows = await px(page, () => window.__parity.rowCount());
      const first = await px(page, () => window.__parity.firstJobs(3));
      return { headers: headers.filter(Boolean), rows, first };
    },
  },

  // ── the twenty-five formats ───────────────────────────────────────────────
  {
    id: "formats.all",
    group: "25 formats",
    async run(page) {
      const columns = [
        "Job", "Status", "Owner", "Amount", "Share", "Qty", "Score",
        "Plain Number", "Rating", "Bytes", "Seconds", "Done", "Due",
        "Opened At", "Seen At", "Notes", "Summary", "Email", "Link",
        "Phone", "Swatch", "Payload", "Labels", "Chips", "Regions", "Total",
      ];
      const out = {};
      for (const c of columns) {
        out[c] = await px(
          page,
          (cc) => {
            const el = window.__parity.cell("Job 001", cc);
            if (!el) return null;
            const text = (el.textContent || "").replace(/\s+/g, " ").trim();
            // A star rating and a checkbox have no text — describe what a
            // person actually sees instead of recording an empty string.
            const svgs = el.querySelectorAll("svg").length;
            const inputs = el.querySelectorAll('input,[role="checkbox"]').length;
            const links = el.querySelectorAll("a").length;
            const swatches = Array.from(el.querySelectorAll("*")).filter((n) => {
              const bg = getComputedStyle(n).backgroundColor;
              return bg && bg !== "rgba(0, 0, 0, 0)" && n !== el && n.clientWidth > 0 && n.clientWidth < 40;
            }).length;
            return { text, svgs, inputs, links, swatches };
          },
          c,
        );
      }
      return out;
    },
  },
  {
    id: "formats.formula",
    group: "formulas",
    async run(page) {
      // Total = {Amount} * {Qty}. Row 1: 250 * 1. Row 3: 324 * 3 = 972.
      return {
        job001: await px(page, () => window.__parity.cellText("Job 001", "Total")),
        job003: await px(page, () => window.__parity.cellText("Job 003", "Total")),
        job010: await px(page, () => window.__parity.cellText("Job 010", "Total")),
      };
    },
  },

  // ── colour ────────────────────────────────────────────────────────────────
  {
    id: "color.colorBy",
    group: "colour by column",
    async run(page) {
      // colorBy = status, target row. Four statuses cycle, so four rows with
      // four different statuses must paint four DISTINCT row colours.
      const jobs = ["Job 001", "Job 002", "Job 003", "Job 004"];
      const out = {};
      for (const j of jobs) out[j] = await px(page, (jj) => window.__parity.rowBg(jj), j);
      out.distinct = new Set(Object.values(out).filter(Boolean)).size;
      return out;
    },
  },
  {
    id: "color.rule",
    group: "live colour rules",
    async run(page) {
      // Rule: amount > 3000 tints the CELL amber. amount = 250 + 37*i.
      // Job 075 -> 2988 (no), Job 076 -> 3025 (yes).
      await scrollCellIntoView(page, "Job 076", "Amount");
      const over = await px(page, () => window.__parity.cellBg("Job 076", "Amount"));
      const under = await px(page, () => window.__parity.cellBg("Job 075", "Amount"));
      return { over3000: over, under3000: under, differs: Boolean(over) && over !== under };
    },
  },
  {
    id: "color.manualCell",
    group: "manual highlights",
    async run(page) {
      const job = await px(page, () => window.__parity.cellBg("Job 001", "Job"));
      const neighbour = await px(page, () => window.__parity.cellBg("Job 002", "Job"));
      return { highlighted: job, plain: neighbour, differs: Boolean(job) && job !== neighbour };
    },
  },
  {
    id: "color.manualColumn",
    group: "manual highlights",
    async run(page) {
      const owner = await px(page, () => window.__parity.cellBg("Job 002", "Owner"));
      const score = await px(page, () => window.__parity.cellBg("Job 002", "Score"));
      return { ownerColumn: owner, otherColumn: score, differs: Boolean(owner) && owner !== score };
    },
  },

  // ── spreadsheet gestures, judged by the clipboard ─────────────────────────
  {
    id: "select.range",
    group: "range select",
    async run(page) {
      // Two ways a spreadsheet person extends a range, both asserted on what
      // lands on the clipboard — the one answer that is identical in any
      // implementation.
      await scrollCellIntoView(page, "Job 002", "Job");
      await clickCell(page, "Job 002", "Job");
      await page.waitForTimeout(150);
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("Shift+ArrowDown");
      await page.keyboard.press("Shift+ArrowDown");
      await page.waitForTimeout(200);
      await page.keyboard.press(`${MOD}+c`);
      await page.waitForTimeout(400);
      const byKeyboard = await readClipboard(page);

      await clickCell(page, "Job 006", "Job");
      await page.waitForTimeout(150);
      await clickCell(page, "Job 008", "Owner", { modifiers: ["Shift"] });
      await page.waitForTimeout(250);
      await page.keyboard.press(`${MOD}+c`);
      await page.waitForTimeout(400);
      const byShiftClick = await readClipboard(page);
      return { byKeyboard, byShiftClick };
    },
  },
  {
    id: "select.wholeRow",
    group: "range select",
    async run(page) {
      await scrollCellIntoView(page, "Job 005", "Job");
      await clickCell(page, "Job 005", "Job");
      await page.keyboard.press("Shift+Space");
      await page.waitForTimeout(150);
      await page.keyboard.press(`${MOD}+c`);
      await page.waitForTimeout(250);
      const text = await readClipboard(page);
      return { columns: text ? text.split("\t").length : 0, startsWith: (text || "").slice(0, 24) };
    },
  },
  {
    id: "paste.excel",
    group: "Excel paste",
    async run(page) {
      await writeClipboard(page, "PASTED-A\tPASTED-B\nPASTED-C\tPASTED-D");
      await scrollCellIntoView(page, "Job 008", "Notes");
      await clickCell(page, "Job 008", "Notes");
      await page.waitForTimeout(120);
      await page.keyboard.press(`${MOD}+v`);
      await page.waitForTimeout(1500);
      return {
        r1c1: await px(page, () => window.__parity.cellText("Job 008", "Notes")),
        r1c2: await px(page, () => window.__parity.cellText("Job 008", "Summary")),
        r2c1: await px(page, () => window.__parity.cellText("Job 009", "Notes")),
        r2c2: await px(page, () => window.__parity.cellText("Job 009", "Summary")),
      };
    },
  },
  {
    id: "fill.down",
    group: "fill down",
    async run(page) {
      await scrollCellIntoView(page, "Job 012", "Notes");
      await clickCell(page, "Job 012", "Notes");
      await page.waitForTimeout(120);
      await clickCell(page, "Job 014", "Notes", { modifiers: ["Shift"] });
      await page.waitForTimeout(120);
      await page.keyboard.press(`${MOD}+d`);
      await page.waitForTimeout(1500);
      return {
        source: await px(page, () => window.__parity.cellText("Job 012", "Notes")),
        filled1: await px(page, () => window.__parity.cellText("Job 013", "Notes")),
        filled2: await px(page, () => window.__parity.cellText("Job 014", "Notes")),
      };
    },
  },
  {
    id: "undo.cellEdit",
    group: "undo",
    async run(page) {
      const before = await px(page, () => window.__parity.cellText("Job 016", "Notes"));
      await scrollCellIntoView(page, "Job 016", "Notes");
      await clickCell(page, "Job 016", "Notes");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(250);
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.type("UNDO-PROBE");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1500);
      const after = await px(page, () => window.__parity.cellText("Job 016", "Notes"));
      await page.keyboard.press(`${MOD}+z`);
      await page.waitForTimeout(1500);
      const undone = await px(page, () => window.__parity.cellText("Job 016", "Notes"));
      return { before, after, undone, restored: undone === before };
    },
  },

  // ── editing gestures ──────────────────────────────────────────────────────
  {
    id: "edit.enterOpens",
    group: "Enter-to-edit",
    async run(page) {
      await scrollCellIntoView(page, "Job 020", "Owner");
      await clickCell(page, "Job 020", "Owner");
      await page.waitForTimeout(150);
      const beforeEditor = await px(page, () => window.__parity.activeEditor());
      await page.keyboard.press("Enter");
      await page.waitForTimeout(350);
      const editor = await px(page, () => window.__parity.activeEditor());
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      return { editorBeforeEnter: beforeEditor, editorAfterEnter: editor };
    },
  },
  {
    id: "edit.typeReplaces",
    group: "type-to-replace",
    async run(page) {
      await scrollCellIntoView(page, "Job 021", "Owner");
      await clickCell(page, "Job 021", "Owner");
      await page.waitForTimeout(150);
      await page.keyboard.type("Z");
      await page.waitForTimeout(350);
      const editor = await px(page, () => window.__parity.activeEditor());
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      return { editor };
    },
  },
  {
    id: "edit.validationRefusal",
    group: "validation",
    async run(page) {
      // Owner carries minLength 2 — a single character must be refused IN THE
      // CELL, in a sentence, with what the person typed still there.
      await scrollCellIntoView(page, "Job 022", "Owner");
      await clickCell(page, "Job 022", "Owner");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      await page.keyboard.press(`${MOD}+a`);
      await page.keyboard.type("Q");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(900);
      const said = await px(page, () =>
        window.__parity.saysAny("at least", "must be", "cannot", "too short", "characters"),
      );
      const editorStillOpen = await px(page, () => window.__parity.activeEditor());
      const stored = await px(page, () => window.__parity.cellText("Job 022", "Owner"));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      return { refusalPhrases: said, editorStillOpen, storedValue: stored };
    },
  },

  // ── filters, facets, sort ─────────────────────────────────────────────────
  {
    id: "sort.column",
    group: "sort",
    async run(page) {
      const header = page.locator("table thead th", { hasText: /^Amount/ }).first();
      await header.scrollIntoViewIfNeeded();
      await header.click();
      await page.waitForTimeout(1600);
      const asc = await px(page, () => window.__parity.firstJobs(3));
      await header.click();
      await page.waitForTimeout(1600);
      const desc = await px(page, () => window.__parity.firstJobs(3));
      return { asc, desc };
    },
  },
  {
    id: "filter.column",
    group: "filter",
    async run(page, ctx) {
      // Filtering is reached from the column header in both implementations;
      // the probe asserts the RESULT, not the control.
      await ctx.applyStatusFilter(page, "Done");
      await page.waitForTimeout(1800);
      const rows = await px(page, () => window.__parity.rowCount());
      const statuses = await px(page, () => {
        const c = window.__parity.colIndex("Status");
        return Array.from(new Set(window.__parity.bodyRows().slice(0, 40).map((tr) => (tr.children[c]?.textContent || "").trim())));
      });
      await ctx.clearFilters(page);
      await page.waitForTimeout(1500);
      const after = await px(page, () => window.__parity.rowCount());
      return { rowsWhileFiltered: rows, distinctStatuses: statuses, rowsAfterClear: after };
    },
  },
  {
    id: "facets.counts",
    group: "facets with counts",
    async run(page, ctx) {
      const seen = await ctx.openStatusFilter(page);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      return seen;
    },
  },

  // ── the right-click menu, four levels ─────────────────────────────────────
  {
    id: "menu.cell",
    group: "context menu",
    async run(page, ctx) { return ctx.menuAt(page, "Job 030", "Amount", {}); },
  },
  {
    id: "menu.row",
    group: "context menu",
    async run(page, ctx) {
      await scrollCellIntoView(page, "Job 031", "Job");
      await clickCell(page, "Job 031", "Job");
      await page.keyboard.press("Shift+Space");
      await page.waitForTimeout(200);
      return ctx.menuAt(page, "Job 031", "Job", {});
    },
  },
  {
    id: "menu.column",
    group: "context menu",
    async run(page, ctx) {
      const header = page.locator("table thead th", { hasText: /^Status/ }).first();
      await header.scrollIntoViewIfNeeded();
      const box = await header.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
      await page.waitForTimeout(500);
      const items = await ctx.readMenu(page);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      return { items };
    },
  },
  {
    id: "menu.selection",
    group: "context menu",
    async run(page, ctx) {
      await scrollCellIntoView(page, "Job 033", "Job");
      await clickCell(page, "Job 033", "Job");
      await page.waitForTimeout(120);
      await clickCell(page, "Job 035", "Owner", { modifiers: ["Shift"] });
      await page.waitForTimeout(200);
      return ctx.menuAt(page, "Job 034", "Owner", {});
    },
  },

  // ── columns: order, hiding, widths, freezing ──────────────────────────────
  {
    id: "columns.hidden",
    group: "hidden columns",
    async run(page) {
      // The URL carries the view, in both implementations.
      const url = new URL(page.url());
      url.searchParams.set("hide", "score,plain_number");
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await page.evaluate(PAGE_HELPERS);
      const headers = await px(page, () => window.__parity.headers());
      return { headers: headers.filter(Boolean) };
    },
  },
  {
    id: "columns.widths",
    group: "column widths",
    async run(page) {
      const widths = await px(page, () => {
        const t = window.__parity.grid();
        if (!t) return null;
        const row = t.querySelector("thead tr");
        return Array.from(row.children).map((th) => Math.round(th.getBoundingClientRect().width));
      });
      const resizeHandles = await page.locator('[data-column-resize-handle], [role="separator"][aria-orientation="vertical"]').count();
      return { widths, resizeHandles };
    },
  },
  {
    id: "columns.frozen",
    group: "frozen columns",
    async run(page) {
      const sticky = await px(page, () => {
        const t = window.__parity.grid();
        if (!t) return [];
        const row = t.querySelector("thead tr");
        return Array.from(row.children)
          .map((th, i) => ({ i, label: (th.textContent || "").trim(), position: getComputedStyle(th).position }))
          .filter((c) => c.position === "sticky");
      });
      return { stickyHeaderCells: sticky };
    },
  },

  // ── grouping, row height, honest counts ───────────────────────────────────
  {
    id: "grouping.byColumn",
    group: "grouping",
    async run(page, ctx) { return ctx.probeGrouping(page); },
  },
  {
    id: "rowHeight",
    group: "row height",
    async run(page) {
      const h = await px(page, () => {
        const rows = window.__parity.bodyRows();
        return rows.length ? Math.round(rows[0].getBoundingClientRect().height) : null;
      });
      return { bodyRowHeight: h };
    },
  },
  {
    id: "coverage.honestCount",
    group: "honest count",
    async run(page) {
      const said = await px(page, () =>
        window.__parity.saysAny(
          "first 5,000 rows",
          "were not looked at",
          "not the whole table",
          "cover the",
          "rows in this table",
        ),
      );
      return { coverageSentences: said };
    },
  },

  // ── export / copy ─────────────────────────────────────────────────────────
  {
    id: "export.copyCsv",
    group: "export",
    async run(page, ctx) { return ctx.probeCopy(page); },
  },

  // ── history ───────────────────────────────────────────────────────────────
  {
    id: "history.available",
    group: "history",
    async run(page, ctx) { return ctx.probeHistory(page); },
  },
];

/* ─────────────────── interaction helpers shared by probes ────────────────── */

async function readMenu(page) {
  const items = await page.evaluate(() => {
    const menus = Array.from(
      document.querySelectorAll('[role="menu"], [data-radix-menu-content], [role="dialog"][data-state="open"]'),
    ).filter((m) => m.offsetParent !== null || m.getBoundingClientRect().height > 0);
    if (!menus.length) return [];
    const m = menus[menus.length - 1];
    return Array.from(m.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], button, [data-menu-label]'))
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  });
  return items;
}

async function menuAt(page, job, column) {
  await scrollCellIntoView(page, job, column);
  await clickCell(page, job, column, { button: "right" });
  await page.waitForTimeout(600);
  const items = await readMenu(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return { items };
}

/**
 * The column's own sort-or-filter control. BOTH implementations name it the
 * same way to a screen reader — the old grid as a `title`, `MatrxDataTable` as
 * an `aria-label` — so this is the one control a person reaches for, found the
 * way a person finds it, in either.
 */
function filterTrigger(page, column) {
  return page
    .locator(
      `table thead th [title*="Sort or filter ${column}" i], table thead th [aria-label*="Sort or filter ${column}" i]`,
    )
    .first();
}

/** Open the Status column's filter control and read what it offers. */
async function openStatusFilter(page) {
  const trigger = filterTrigger(page, "Status");
  await trigger.scrollIntoViewIfNeeded({ timeout: 15000 });
  await trigger.click({ timeout: 15000 });
  await page.waitForTimeout(900);
  const seen = await page.evaluate(() => {
    const open = Array.from(
      document.querySelectorAll('[role="dialog"], [data-radix-popper-content-wrapper], [role="menu"]'),
    ).filter((m) => m.getBoundingClientRect().height > 0);
    if (!open.length) return { values: [], counts: [], panelText: null };
    const panel = open[open.length - 1];
    const text = (panel.innerText || "").replace(/\s+/g, " ").trim();
    const values = ["Done", "Blocked", "Active", "Queued"].filter((v) => text.includes(v));
    // A count is a number rendered BESIDE one of the four values.
    const counts = {};
    for (const v of values) {
      const m = new RegExp(`${v}\\s*\\(?(\\d{1,5})\\)?`).exec(text);
      if (m) counts[v] = m[1];
    }
    return { values, counts, panelText: text.slice(0, 500) };
  });
  return seen;
}

async function applyStatusFilter(page, value) {
  const trigger = filterTrigger(page, "Status");
  await trigger.scrollIntoViewIfNeeded({ timeout: 15000 });
  await trigger.click({ timeout: 15000 });
  await page.waitForTimeout(900);
  const option = page
    .locator(`[role="dialog"], [data-radix-popper-content-wrapper], [role="menu"]`)
    .last()
    .getByText(value, { exact: true })
    .first();
  if (!(await option.count())) return false;
  await option.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const apply = page.locator('button:has-text("Apply")').first();
  if (await apply.count()) await apply.click({ timeout: 6000 }).catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
  return true;
}

async function clearFilters(page) {
  await settleOnTheGrid(page);
}

async function probeGrouping(page) {
  const url = new URL(page.url());
  url.searchParams.set("group", "status");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(PAGE_HELPERS);
  const said = await px(page, () => window.__parity.saysAny("Done", "Blocked", "Active", "Queued"));
  const groupHeaderRows = await page.evaluate(() => {
    const t = window.__parity.grid();
    if (!t) return 0;
    const width = window.__parity.headers().length;
    return Array.from(t.querySelectorAll("tbody tr")).filter((tr) => {
      const only = tr.children.length === 1 || Boolean(tr.querySelector("[colspan]"));
      return only;
    }).length;
  });
  return { groupHeaderRows, statusWordsOnScreen: said };
}

async function probeCopy(page) {
  const controls = await page.locator('button:has-text("Copy"), button[aria-label*="Copy" i], button[title*="Copy" i]').count();
  const exportControls = await page.locator('button:has-text("Export"), button[aria-label*="Export" i], button[title*="Export" i]').count();
  return { copyControls: controls, exportControls };
}

async function probeHistory(page) {
  const controls = await page.locator('button[title*="istory" i], button[aria-label*="istory" i], button:has-text("History")').count();
  return { historyControls: controls };
}

/* ────────────────────────────── the driver ──────────────────────────────── */

async function devLogin(page) {
  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(TABLE_URL)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  const who = await page.evaluate(async () => {
    const r = await fetch("/api/whoami");
    return r.ok ? r.json() : { error: r.status };
  });
  return who;
}

/** Load the fixture table and prove the real grid is on screen, or fail. */
async function settleOnTheGrid(page, attempts = 6) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    await page.goto(`${ORIGIN}${TABLE_URL}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("table tbody tr", { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.evaluate(PAGE_HELPERS);
    const state = await page.evaluate(() => ({
      headers: window.__parity.headers().filter(Boolean),
      rows: window.__parity.rowCount(),
      job001: window.__parity.cellText("Job 001", "Job"),
    }));
    last = state;
    if (state.rows >= 100 && state.job001 === "Job 001" && state.headers.length >= 26) return state;
    console.log(`[compare] grid not settled (rows=${state.rows}, headers=${state.headers.length}) — retry ${i + 1}/${attempts}`);
    await page.waitForTimeout(6000);
  }
  throw new Error(`the fixture grid never rendered: ${JSON.stringify(last)}`);
}

async function main() {
  const browser = await chromium.launch({ headless: !HEADFUL });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  context.setDefaultTimeout(30000);
  context.setDefaultNavigationTimeout(120000);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });

  const who = await devLogin(page);
  if (!who || !who.email) throw new Error(`dev-login did not establish an identity: ${JSON.stringify(who)}`);
  console.log(`[compare] signed in as ${who.email}`);

  // THE RUN REFUSES TO START ON A HALF-LOADED TABLE. A PostgREST hiccup
  // (PGRST002 / 503) renders a skeleton, and every probe below would then
  // record `null` and read as a clean answer. A baseline made of nulls is
  // worse than no baseline, so the grid has to actually be there first.
  await settleOnTheGrid(page);

  const ctx = { readMenu, menuAt, openStatusFilter, applyStatusFilter, clearFilters, probeGrouping, probeCopy, probeHistory };
  const results = {};
  for (const probe of PROBES) {
    if (ONLY && !probe.id.startsWith(ONLY)) continue;
    // Every probe starts from the same clean view — a probe that navigated
    // must not leave the next one on a filtered table.
    try {
      if (page.url() !== `${ORIGIN}${TABLE_URL}`) await settleOnTheGrid(page);
      const observed = await probe.run(page, ctx);
      results[probe.id] = { group: probe.group, observed };
      console.log(`[compare] ${probe.id.padEnd(26)} ok`);
    } catch (err) {
      results[probe.id] = { group: probe.group, error: String(err && err.message).slice(0, 400) };
      console.log(`[compare] ${probe.id.padEnd(26)} ERROR ${String(err && err.message).slice(0, 140)}`);
    }
  }

  await browser.close();

  const report = {
    label: LABEL,
    at: new Date().toISOString(),
    fixture: { tableId: fixture.tableId, rows: fixture.rows },
    consoleErrors: consoleErrors.slice(0, 20),
    results,
  };
  mkdirSync(HERE, { recursive: true });
  const out = resolve(HERE, `parity-${LABEL}.json`);
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[compare] → ${out}`);

  if (AGAINST) {
    const basePath = resolve(HERE, `parity-${AGAINST}.json`);
    if (!existsSync(basePath)) throw new Error(`no baseline at ${basePath}`);
    const base = JSON.parse(readFileSync(basePath, "utf8"));
    const lines = [];
    for (const id of Object.keys(base.results)) {
      const a = JSON.stringify(base.results[id]?.observed ?? base.results[id]?.error);
      const b = JSON.stringify(report.results[id]?.observed ?? report.results[id]?.error);
      lines.push(`${a === b ? "SAME  " : "DIFF  "}${id}`);
      if (a !== b) {
        lines.push(`        ${AGAINST}: ${a}`);
        lines.push(`        ${LABEL}: ${b}`);
      }
    }
    const diffOut = resolve(HERE, `parity-diff-${AGAINST}-vs-${LABEL}.txt`);
    writeFileSync(diffOut, `${lines.join("\n")}\n`);
    console.log(lines.join("\n"));
    console.log(`[compare] diff → ${diffOut}`);
  }
}

main().catch((err) => {
  console.error(`[compare] FAILED: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
