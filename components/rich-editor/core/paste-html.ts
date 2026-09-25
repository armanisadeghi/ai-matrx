// components/rich-editor/core/paste-html.ts
//
// Pasted HTML from the real world, made safe for a GFM table BEFORE either
// view converts it. A GFM cell holds ONE line of inline text; the schema's
// cell holds exactly one paragraph. Web tables break that constantly:
//
//   · Wikipedia puts `<p>` (and `<br>`, lists, hatnotes) inside cells;
//     Word wraps every cell in `<p class=MsoNormal>`; Google Docs in
//     `<p dir=ltr><span>`; Notion and Sheets use `<div>`s.
//     A second block in a cell used to become a SECOND CELL, shifting every
//     value after it one column right, silently (verify-RC-B4 R2-1).
//   · Merged cells (colspan / rowspan) have no GFM form at all.
//   · Ragged rows (a row shorter than the header); a <caption> (a line above).
//
// So every table is normalized to a rectangular grid of one-line cells:
//   blocks inside a cell → their inline content joined by a space
//   (list items by "; "), a nested table → its text, `<br>` → a space;
//   colspan/rowspan → expanded into empty cells (counted, so the caller can
//   say so), short rows padded. Links, emphasis, code and images inside a
//   cell stay inline. Browser (or jsdom) only.

const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "ASIDE", "NAV",
  "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "FIGURE", "FIGCAPTION",
  "DL", "DT", "DD", "HR", "ADDRESS", "DETAILS", "SUMMARY",
]);
const LIST_TAGS = new Set(["UL", "OL"]);

export interface PastedHtmlResult {
  html: string;
  /** Merged cells split so every column lines up (colspan + rowspan extras). */
  mergedCellsSplit: number;
  tables: number;
}

function text(doc: Document, value: string): Text {
  return doc.createTextNode(value);
}

/** Replace a cell's block structure with inline content on one line. */
function flattenCell(cell: HTMLElement): void {
  const doc = cell.ownerDocument;
  // Nested tables first: a table inside a cell is its text.
  for (const nested of Array.from(cell.querySelectorAll("table"))) {
    nested.replaceWith(text(doc, (nested.textContent ?? "").replace(/\s+/g, " ").trim()));
  }
  for (const br of Array.from(cell.querySelectorAll("br"))) br.replaceWith(text(doc, " "));
  // Lists: items joined by "; " (deepest first, so nested lists fold inward).
  for (const list of Array.from(cell.querySelectorAll("ul, ol")).reverse()) {
    const fragment = doc.createDocumentFragment();
    const items = Array.from(list.children).filter((child) => child.tagName === "LI");
    items.forEach((item, index) => {
      if (index > 0) fragment.append(text(doc, "; "));
      fragment.append(...Array.from(item.childNodes));
    });
    fragment.append(text(doc, " "));
    list.replaceWith(fragment);
  }
  // Every other block: unwrap it, with a space after so words never fuse.
  for (const block of Array.from(cell.querySelectorAll("*")).reverse()) {
    if (!BLOCK_TAGS.has(block.tagName) && !LIST_TAGS.has(block.tagName) && block.tagName !== "LI") continue;
    if (block.tagName === "HR") {
      block.replaceWith(text(doc, " "));
      continue;
    }
    const fragment = doc.createDocumentFragment();
    fragment.append(text(doc, " "), ...Array.from(block.childNodes), text(doc, " "));
    block.replaceWith(fragment);
  }
  // Collapse the whitespace the unwrapping left, at the cell's edges and between runs.
  const walker = doc.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  for (const node of nodes) node.data = node.data.replace(/\s+/g, " ");
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (first) first.data = first.data.replace(/^ /, "");
  if (last) last.data = last.data.replace(/ $/, "");
}

function rowsOf(table: HTMLTableElement): HTMLTableRowElement[] {
  // Only this table's own rows (thead/tbody/tfoot or direct), never a nested table's.
  return Array.from(table.rows);
}

function emptyCell(like: HTMLElement): HTMLElement {
  return like.ownerDocument.createElement(like.tagName === "TH" ? "th" : "td");
}

function span(cell: HTMLElement, name: "colspan" | "rowspan"): number {
  return Math.max(1, Math.min(Number(cell.getAttribute(name)) || 1, 1000));
}

/** Expand colspan/rowspan into a rectangular grid; returns the cells added. */
function squareTable(table: HTMLTableElement): number {
  const rows = rowsOf(table);
  let added = 0;
  // pending[r] = grid columns (with a template cell) to fill in row r.
  const pending: Array<Array<[number, HTMLElement]>> = rows.map(() => []);
  rows.forEach((row, r) => {
    // 1. colspan → blanks after the cell; each blank inherits the rowspan so the
    //    whole merged block is carried down.
    for (const cell of Array.from(row.cells)) {
      const colspan = span(cell, "colspan");
      const rowspan = span(cell, "rowspan");
      cell.removeAttribute("colspan");
      let anchor: HTMLElement = cell;
      for (let extra = 1; extra < colspan; extra += 1) {
        const blank = emptyCell(cell);
        if (rowspan > 1) blank.setAttribute("rowspan", String(rowspan));
        anchor.after(blank);
        anchor = blank;
        added += 1;
      }
    }
    // 2. Blanks carried down from rowspans above, at their grid columns (ascending).
    for (const [column, like] of (pending[r] ?? []).sort((a, b) => a[0] - b[0])) {
      const blank = emptyCell(like);
      const before = row.cells[column];
      if (before) row.insertBefore(blank, before);
      else row.append(blank);
      added += 1;
    }
    // 3. Every cell is one column wide now: register its rowspan downward.
    Array.from(row.cells).forEach((cell, column) => {
      const rowspan = span(cell, "rowspan");
      cell.removeAttribute("rowspan");
      for (let down = 1; down < rowspan && r + down < rows.length; down += 1) pending[r + down]?.push([column, cell]);
    });
  });
  // Pad ragged rows to the widest row.
  const width = Math.max(0, ...rows.map((row) => row.cells.length));
  for (const row of rows) {
    while (row.cells.length < width) {
      row.append(emptyCell(row.cells[0] ?? row.ownerDocument.createElement("td")));
    }
  }
  return added;
}

/** Normalize every table in pasted HTML (see header). Tables only; the rest is untouched. */
export function normalizePastedHtml(html: string): PastedHtmlResult {
  if (!/<table[\s>]/i.test(html)) return { html, mergedCellsSplit: 0, tables: 0 };
  const template = document.createElement("template");
  template.innerHTML = html;
  const tables = Array.from(template.content.querySelectorAll("table")).filter(
    // Outermost tables only: a nested one is flattened into its parent's cell.
    (table) => !table.parentElement?.closest("table"),
  );
  let mergedCellsSplit = 0;
  for (const table of tables) {
    // A caption is a line of text above the table, never a row of it.
    for (const caption of Array.from(table.querySelectorAll(":scope > caption"))) {
      const line = template.ownerDocument.createElement("p");
      line.append(...Array.from(caption.childNodes));
      table.before(line);
      caption.remove();
    }
    mergedCellsSplit += squareTable(table as HTMLTableElement);
    for (const row of rowsOf(table as HTMLTableElement)) {
      for (const cell of Array.from(row.cells)) flattenCell(cell);
    }
  }
  return { html: template.innerHTML, mergedCellsSplit, tables: tables.length };
}

/** The one sentence a person sees when merged cells were split. */
export function mergedCellsNotice(count: number): string | null {
  if (count <= 0) return null;
  return `${count} merged table ${count === 1 ? "cell was" : "cells were"} split into separate cells so every column lines up — check the pasted table.`;
}
