// components/rich-editor/core/table-source.ts
//
// THE markdown-table writer. Every path that turns an edited table back into
// markdown — the rich editor's serializer (markdown-serialize.ts) and the
// in-body answer table editors (MarkdownTable, TableWithSeparatedControls,
// StreamingTableRenderer) — writes through here. The splice principle, inside
// a table: an untouched cell is ITS source bytes (padding, escapes, `\|`
// included); only an edited cell changes, keeping its leading spaces and as
// much trailing padding as still fits, its text escaped so it can never split
// the row. No row is re-padded and the delimiter row never widens.
//
// It exists because each of those paths once had a private writer that
// re-padded every row, widened `|---|` to `|------|`, and — reading `\|` as a
// cell boundary — wrote an untouched `open for A \| B` back unescaped, so the
// row split and a second edit deleted the tail (verify-RC-B4 R3-1).
// Guard: scripts/check-table-writers.ts (no table writer outside this module).

/**
 * THE table-row splitter — GFM's rule, exactly: a `|` is a cell boundary unless
 * an ODD run of backslashes precedes it (`\|` is a pipe in the cell, `\\|` is
 * an escaped backslash and then a boundary). Code spans get no special
 * treatment: GFM splits rows before inline parsing, so an unescaped `|` inside
 * backticks is a boundary too. The parser, the writer and the renderer's
 * table readers all split through here; tests and the corpus gate judge it
 * against an independent GFM parser (scripts/lib/gfm-table-oracle.ts).
 * Returns the row's bytes between boundaries (edge segments included).
 */
export function splitRowSegments(line: string): string[] {
  const segments: string[] = [];
  let start = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\\") {
      i += 1; // the escaped character — never a boundary
      continue;
    }
    if (ch === "|") {
      segments.push(line.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(line.slice(start));
  return segments;
}

/** A row's cell texts as GFM reads them (source bytes, trimmed; edge pipes dropped). */
export function rowCells(line: string): string[] {
  const cells = splitRowSegments(line).map((cell) => cell.trim());
  if (cells.length > 1 && cells[0] === "") cells.shift();
  if (cells.length > 1 && cells[cells.length - 1] === "") cells.pop();
  else if (cells.length === 1 && cells[0] === "") cells.pop();
  return cells;
}

/** Length of the run of backslashes ending just before `index`. */
function backslashRunBefore(text: string, index: number): number {
  let run = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) run += 1;
  return run;
}

/**
 * A cell the person typed, made safe for one GFM cell: newlines become spaces
 * and every `|` that would be a boundary (an EVEN run of backslashes before it,
 * zero included) gets one more backslash. A pipe already escaped is left alone.
 */
export function freshCell(text: string): string {
  const flat = text.replace(/\r?\n/g, " ");
  let out = "";
  for (let i = 0; i < flat.length; i += 1) {
    if (flat[i] === "|" && backslashRunBefore(flat, i) % 2 === 0) out += "\\";
    out += flat[i];
  }
  return out;
}

/** True when the text ends in an odd run of backslashes — it would escape the next pipe. */
function endsInEscape(text: string): boolean {
  return backslashRunBefore(text, text.length) % 2 === 1;
}

/** A table edit the writer could not make read back as the intended grid. */
export class TableWriteRefused extends Error {
  constructor(
    readonly row: string,
    detail: string,
  ) {
    super(`The table could not be written without changing other cells (${detail}). Your edit is kept — nothing was saved.`);
    this.name = "TableWriteRefused";
  }
}

/** Every written row must read back — by GFM's own rule — as exactly the cells intended. */
function assertRowReadsBack(line: string, intended: readonly string[]): string {
  const got = rowCells(line);
  if (got.length !== intended.length || got.some((cell, i) => cell !== intended[i])) {
    throw new TableWriteRefused(line, `expected ${JSON.stringify(intended)}, would read ${JSON.stringify(got)}`);
  }
  return line;
}

/** A cell's new bytes inside its old segment: same leading spaces, padding kept where it fits. */
function rewriteSegment(seg: string, text: string): string {
  const lead = /^\s*/.exec(seg)?.[0] ?? "";
  const core = seg.slice(lead.length).trimEnd();
  const trail = seg.slice(lead.length + core.length);
  const fresh = freshCell(text).trim();
  // A trailing odd backslash would escape the pipe after it: always one space.
  const pad = Math.max(trail.length > 0 || endsInEscape(fresh) ? 1 : 0, core.length + trail.length - fresh.length);
  return `${lead}${fresh}${" ".repeat(pad)}`;
}

/**
 * The stored row with ONLY the edited cells rewritten. A row with MORE stored
 * cells than the header keeps the extra ones verbatim (renderers ignore them;
 * they are still the author's bytes); a SHORT row gains a segment only for a
 * cell the person actually filled. A row without an edge pipe gets one when
 * its first or last cell is empty — GFM would otherwise read that empty cell
 * as the edge and shift the row. The result is read back through the splitter
 * and REFUSED (TableWriteRefused) unless it holds exactly the intended cells.
 * Null only when there are no stored segments or the stored texts do not line
 * up with the new ones.
 */
export function respliceRow(segs: unknown[] | null, stored: unknown[] | null, texts: readonly string[]): string | null {
  if (!segs || !stored || stored.length !== texts.length || !segs.every((seg) => typeof seg === "string")) return null;
  const parts = segs as string[];
  const original = rowCells(parts.join("|"));
  const first = parts.length > 1 && (parts[0] ?? "").trim() === "" ? 1 : 0;
  const closed = parts.length > 1 && (parts[parts.length - 1] ?? "").trim() === "";
  const end = closed ? parts.length - 1 : parts.length;
  const cells = parts.slice(first, end);
  const edited = new Set<number>();
  texts.forEach((text, index) => {
    if (stored[index] === text) return;
    edited.add(index);
    if (index < cells.length) cells[index] = rewriteSegment(cells[index] ?? "", text);
    else {
      while (cells.length < index) cells.push(" ");
      cells.push(` ${freshCell(text).trim()} `);
    }
  });
  if (!edited.size) return parts.join("|");
  const lastIndex = cells.length - 1;
  const needLead = !first && (cells[0] ?? "").trim() === "";
  const needTrail = !closed && lastIndex >= 0 && (cells[lastIndex] ?? "").trim() === "";
  if (needLead && cells[0] === "") cells[0] = " ";
  if (needTrail && cells[lastIndex] === "") cells[lastIndex] = " ";
  const edge = first ? [parts[0] ?? ""] : needLead ? [""] : [];
  const tail = closed ? [parts[parts.length - 1] ?? ""] : needTrail || cells.length > end - first ? [""] : [];
  const line = [...edge, ...cells, ...tail].join("|");
  const intended = cells.map((cell, i) => (edited.has(i) ? freshCell(texts[i] ?? "").trim() : (original[i] ?? cell.trim())));
  return assertRowReadsBack(line, intended);
}

/** A row the table never stored, in the table's pipe style (edge pipes added where an empty edge cell needs one). */
export function freshRow(texts: readonly string[], lead = true, trail = true): string {
  const cells = texts.map((text) => freshCell(text).trim());
  const needLead = lead || cells[0] === "";
  const needTrail = trail || cells[cells.length - 1] === "" || endsInEscape(cells[cells.length - 1] ?? "");
  const line = `${needLead ? "| " : ""}${cells.join(" | ")}${needTrail ? " |" : ""}`;
  return assertRowReadsBack(line, cells);
}

export interface TableGrid {
  headers: readonly string[];
  rows: ReadonlyArray<readonly string[]>;
}

/** Resplice one stored line toward `texts`; a fresh row when it cannot line up. */
function rewriteLine(line: string, texts: readonly string[], lead: boolean, trail: boolean): string {
  const stored = rowCells(line);
  if (texts.length < stored.length && stored.slice(texts.length).some((cell) => cell !== "")) {
    // The edit dropped cells the row stored — a structural change; write it fresh.
    return freshRow(texts, lead, trail);
  }
  const padded = texts.length > stored.length ? [...stored, ...Array<string>(texts.length - stored.length).fill("")] : stored;
  const aligned = texts.length < stored.length ? texts.concat(stored.slice(texts.length)) : texts;
  return respliceRow(splitRowSegments(line), padded, aligned) ?? freshRow(texts, lead, trail);
}

/**
 * The stored table source with the edited grid spliced in — THE writer for
 * every table edit path (see header). `original` is the table's markdown as
 * stored; `grid` is the edited headers and rows as the ONE parser produced
 * them (cell text trimmed, `\|` kept). No edit returns `original` exactly.
 * A row added or removed changes only its own line; a column added or
 * removed rewrites the rows (and the delimiter row) it touches.
 */
export function rewriteTableSource(original: string, grid: TableGrid): string {
  const lines = original.split("\n");
  const used = lines.map((line, index) => (line.trim() ? index : -1)).filter((index) => index >= 0);
  const headerAt = used[0];
  const delimAt = used[1];
  if (headerAt === undefined || delimAt === undefined) {
    return [freshRow(grid.headers), freshRow(grid.headers.map(() => "---")), ...grid.rows.map((row) => freshRow(row))].join("\n");
  }
  const headerLine = lines[headerAt] ?? "";
  const lead = headerLine.trimStart().startsWith("|");
  const trail = headerLine.trimEnd().endsWith("|");
  const width = rowCells(headerLine).length;
  const columnsChanged = grid.headers.length !== width;
  const out = [...lines];
  out[headerAt] = rewriteLine(headerLine, grid.headers, lead, trail);
  if (columnsChanged) {
    out[delimAt] = freshRow(grid.headers.map(() => "---"), lead, trail);
  }

  // Data rows exactly as the ONE parser keeps them (a row of only empty cells is skipped).
  const dataAt = used.slice(2).filter((index) => rowCells(lines[index] ?? "").some((cell) => cell !== ""));
  if (grid.rows.length === dataAt.length) {
    grid.rows.forEach((row, i) => {
      const at = dataAt[i] as number;
      out[at] = rewriteLine(lines[at] ?? "", row, lead, trail);
    });
    return out.join("\n");
  }

  // Rows added or removed: every new row that equals the next unused stored row
  // keeps that row's bytes; any other is written fresh; stored rows the edit
  // removed are dropped. Lines outside the data rows are kept as they were.
  const key = (cells: readonly string[]) => JSON.stringify(cells);
  const storedKeys = dataAt.map((index) => key(rowCells(lines[index] ?? "")));
  let cursor = 0;
  const rebuilt = grid.rows.map((row) => {
    const k = key(row);
    for (let j = cursor; j < storedKeys.length; j += 1) {
      if (storedKeys[j] === k) {
        cursor = j + 1;
        return lines[dataAt[j] as number] ?? "";
      }
    }
    return freshRow(row, lead, trail);
  });
  const firstData = dataAt[0] ?? delimAt + 1;
  const lastData = dataAt.length ? (dataAt[dataAt.length - 1] as number) : delimAt;
  return [...out.slice(0, firstData), ...rebuilt, ...out.slice(lastData + 1)].join("\n");
}
