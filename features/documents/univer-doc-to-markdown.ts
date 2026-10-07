/**
 * univerDocToMarkdown — the reverse of `markdown-to-univer-doc.ts`.
 *
 * Why it exists: the canvas pane for a cloud document (`udt_document`) offers a
 * `Source` tab, and the rule in `features/canvas/core/canvasSource.ts` is that
 * Source shows THE ITEM'S OWN SOURCE — for a document, its markdown — never the
 * redux envelope. A document's content lives as an opaque Univer
 * `IDocumentData` snapshot in `workbench.udt_document_snapshots`, so something
 * has to read it back out. This is that something, and it is the ONLY one:
 * never re-implement a second snapshot reader.
 *
 * What it reads (the half `markdownToUniverDoc` writes):
 *   - `body.dataStream`  — the text; `\r` terminates a paragraph, a trailing
 *                          `\n` terminates the section.
 *   - `body.paragraphs`  — one entry per `\r` (`startIndex` = the `\r` offset).
 *   - `body.textRuns`    — `{ st, ed, ts }` style overlays. `ts.bl` + a heading
 *                          font size is how `markdownToUniverDoc` encodes
 *                          `#`..`######`, so the level is recovered from `fs`.
 *
 * Fidelity is deliberately MODEST and honest: headings, bold, italic,
 * strikethrough and inline/monospace code round-trip; everything else comes
 * back as the plain text the user actually sees. A document typed by hand in
 * Univer never had markdown syntax in the first place — printing its text is
 * the truthful answer, not a reconstruction.
 *
 * PURE — no React, no Redux, no IO.
 */

const TABLE_CELL_SEP = "   |   ";

interface TextRunLike {
  st?: number;
  ed?: number;
  ts?: {
    bl?: number;
    it?: number;
    ff?: string;
    fs?: number;
    st?: { s?: number } | number;
  };
}

/** Inverse of markdown-to-univer-doc's HEADING_FONT_SIZE. */
const HEADING_LEVEL_BY_FONT_SIZE: Record<number, number> = {
  26: 1,
  22: 2,
  18: 3,
  16: 4,
  14: 5,
  13: 6,
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const TRUE_ENOUGH = (v: unknown): boolean => v === 1 || v === true;

function isStruck(ts: TextRunLike["ts"]): boolean {
  if (!ts) return false;
  const st = ts.st;
  if (typeof st === "number") return TRUE_ENOUGH(st);
  return TRUE_ENOUGH(st?.s);
}

/** The style that applies to the whole paragraph, if the runs agree on one. */
function paragraphHeadingLevel(runs: TextRunLike[]): number | null {
  for (const run of runs) {
    const fs = run.ts?.fs;
    if (typeof fs === "number" && TRUE_ENOUGH(run.ts?.bl)) {
      const level = HEADING_LEVEL_BY_FONT_SIZE[fs];
      if (level) return level;
    }
  }
  return null;
}

function emphasize(text: string, ts: TextRunLike["ts"], inHeading: boolean): string {
  if (!text) return text;
  // Never double-mark: a heading's own runs are bold by construction.
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  let core = text.slice(leading.length, text.length - trailing.length);
  if (!core) return text;

  const mono = typeof ts?.ff === "string" && /mono/i.test(ts.ff);
  if (mono) core = `\`${core}\``;
  else {
    if (TRUE_ENOUGH(ts?.it)) core = `*${core}*`;
    if (TRUE_ENOUGH(ts?.bl) && !inHeading) core = `**${core}**`;
  }
  if (isStruck(ts)) core = `~~${core}~~`;
  return `${leading}${core}${trailing}`;
}

/**
 * Read a Univer document snapshot back as markdown. Returns `""` for an empty
 * or unreadable snapshot so the caller can say "no source" honestly rather than
 * printing an envelope.
 */
export function univerDocToMarkdown(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") return "";
  const body = (snapshot as { body?: unknown }).body;
  if (!body || typeof body !== "object") return "";

  const dataStream = (body as { dataStream?: unknown }).dataStream;
  if (typeof dataStream !== "string" || !dataStream) return "";

  const runs = asArray<TextRunLike>((body as { textRuns?: unknown }).textRuns)
    .filter((r) => typeof r.st === "number" && typeof r.ed === "number")
    .sort((a, b) => (a.st as number) - (b.st as number));

  const lines: string[] = [];
  let cursor = 0;
  let runIndex = 0;

  // Paragraph boundaries are the `\r`s in the stream itself — reading them from
  // the stream (rather than trusting `paragraphs`) keeps a snapshot written by
  // Univer's own editor, which may index differently, readable.
  for (let i = 0; i <= dataStream.length; i++) {
    const ch = dataStream[i];
    const atEnd = i === dataStream.length;
    if (!atEnd && ch !== "\r" && ch !== "\n") continue;

    const start = cursor;
    const end = i;
    cursor = i + 1;
    if (end <= start) {
      if (ch === "\r") lines.push("");
      if (atEnd) break;
      continue;
    }

    // Collect the runs overlapping this paragraph.
    const paragraphRuns: TextRunLike[] = [];
    let scan = runIndex;
    while (scan < runs.length && (runs[scan].st as number) < end) {
      if ((runs[scan].ed as number) > start) paragraphRuns.push(runs[scan]);
      scan++;
    }
    while (
      runIndex < runs.length &&
      (runs[runIndex].ed as number) <= end
    ) {
      runIndex++;
    }

    const heading = paragraphHeadingLevel(paragraphRuns);
    let text = "";
    let at = start;
    for (const run of paragraphRuns) {
      const rs = Math.max(run.st as number, start);
      const re = Math.min(run.ed as number, end);
      if (rs > at) text += dataStream.slice(at, rs);
      if (re > rs) {
        text += emphasize(dataStream.slice(rs, re), run.ts, heading != null);
      }
      at = Math.max(at, re);
    }
    if (at < end) text += dataStream.slice(at, end);

    lines.push(heading ? `${"#".repeat(heading)} ${text.trim()}` : text);
    if (atEnd) break;
  }

  // Univer keeps one paragraph per visual line; markdown wants a blank line
  // between blocks (but not inside a list or a table), and consecutive blank
  // paragraphs collapse. The writer (`markdownToUniverDoc`) flattens a list item
  // to a literal "• " / "1. " prefix and a table row to cells joined by
  // TABLE_CELL_SEP, so those shapes are read back as the markdown they came from.
  type Kind = "text" | "list" | "table";
  const kindOf = (line: string): Kind =>
    /^\s*(?:\u2022|[-*+]|\d+[.)])\s+/.test(line) ? "list" : line.includes(TABLE_CELL_SEP) ? "table" : "text";
  // A document typed or pasted as markdown keeps a table as literal `| a | b |` lines, one paragraph each, often
  // with an empty paragraph between rows: those rows are ONE table, so the gaps between them close.
  const rawRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const rows = lines.filter((l, i) => {
    if (l.trim()) return true;
    let a = i - 1;
    while (a >= 0 && !lines[a].trim()) a--;
    let z = i + 1;
    while (z < lines.length && !lines[z].trim()) z++;
    return !(a >= 0 && z < lines.length && rawRow(lines[a]) && rawRow(lines[z]));
  });
  const out: string[] = [];
  let prev: Kind | null = null;
  let tableRow = 0;
  for (const raw of rows) {
    if (!raw.trim()) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      prev = null;
      continue;
    }
    let line = raw.replace(/\s+$/, "");
    if (rawRow(line)) {
      if (prev !== "table" && out.length && out[out.length - 1] !== "") out.push("");
      out.push(line.trim());
      prev = "table";
      continue;
    }
    const kind = kindOf(line);
    if (kind === "list") {
      line = line.replace(/^(\s*)\u2022\s+/, "$1- ").replace(/^(\s*)\*\s+/, "$1- ");
      // Four spaces per nesting level in the document; two read as nesting in markdown.
      line = line.replace(/^( +)/, (m) => " ".repeat(Math.floor(m.length / 2)));
    }
    if (kind === "table") {
      const cells = line.split(/\s*\|\s*/).map((c) => c.trim());
      const isHeader = prev !== "table";
      const shown = cells.map((c) => (isHeader ? c.replace(/^\*\*(.*)\*\*$/, "$1") : c));
      line = `| ${shown.join(" | ")} |`;
      if (isHeader) tableRow = shown.length;
      out.push(...(prev === "table" || prev === null || !out.length || out[out.length - 1] === "" ? [] : [""]));
      out.push(line);
      if (isHeader) out.push(`|${" --- |".repeat(tableRow)}`);
      prev = "table";
      continue;
    }
    const tight = kind === "list" && prev === "list";
    if (out.length && out[out.length - 1] !== "" && !tight) out.push("");
    out.push(line);
    prev = kind;
  }
  return out.join("\n").trim();
}
