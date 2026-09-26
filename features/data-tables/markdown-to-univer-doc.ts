/**
 * markdown-to-univer-doc — convert a markdown string into a Univer
 * `IDocumentData` snapshot that the document editor (preset-docs-core) can
 * hydrate directly.
 *
 * Why this exists: the document system stores opaque Univer `IDocumentData`
 * (see `document-service.ts` + `components/DocumentEditor.tsx`). To send any
 * markdown surface (an assistant message, a note, a scraper result) into a
 * cloud document, we need markdown → IDocumentData. There was no converter, so
 * "Add to docs" was a stub. This is the missing primitive — reuse it for every
 * markdown → document export, never re-implement a one-off.
 *
 * The output is RENDERED content, not raw markdown text: `**bold**` becomes a
 * bold text run, `# Heading` becomes a larger bold paragraph, `- item` becomes
 * a bulleted line. The document never contains literal markdown syntax.
 *
 * Univer body model (the part we build):
 *   - `dataStream`  — the text. `\r` terminates a paragraph; a trailing `\n`
 *                     terminates the (single) section. Mirrors the empty doc
 *                     `"\r\n"` shape in DocumentEditor.defaultEmptyDocument().
 *   - `paragraphs`  — one entry per `\r`, `startIndex` = the `\r` offset.
 *   - `textRuns`    — `{ st, ed, ts }` style overlays on character ranges.
 *   - `sectionBreaks` — the trailing `\n`.
 *
 * Scope: headings, paragraphs, bold/italic/strikethrough/inline-code, links
 * (rendered as their text), unordered/ordered lists, blockquotes, fenced code
 * blocks, horizontal rules, and GFM tables (flattened to readable rows). Nested
 * emphasis is supported. Anything exotic degrades to plain readable text rather
 * than leaking syntax.
 */

import { plainTitleFromMarkdown } from "@/components/markdown-core/plain-title";
import {
  BooleanNumber,
  createParagraphId,
  createSectionId,
} from "@univerjs/core";
import type {
  IDocumentData,
  IParagraph,
  ISectionBreak,
  ITextRun,
  ITextStyle,
} from "@univerjs/core";
import { LocaleType } from "@univerjs/presets";

import { defaultDocumentPageStyle } from "./document-page-style";
import {
  findTableEnd,
  rowCells,
  tableStartsAt,
  unescapeCellPipes,
} from "@/components/mardown-display/markdown-classification/processors/utils/gfm-table-lines";
import { codeSpanText, fenceLineKinds, mapCodeRanges } from "@ai-matrx/content-ir/source";

// ─── inline parsing ──────────────────────────────────────────────────────────

interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
}

interface Segment extends InlineStyle {
  text: string;
}

// Order matters: `**`/`__` before `*`/`_` so bold wins over italic; code and
// links are matched atomically. Link target excludes whitespace to avoid
// swallowing trailing prose.
const INLINE_RE =
  /(\*\*|__)([\s\S]+?)\1|(\*|_)([\s\S]+?)\3|~~([\s\S]+?)~~|\[([^\]]+)\]\(([^)\s]+)\)/g;

const CODE_TOKEN = /\uE400(\d+)\uE401/g;

/**
 * Inline markdown → styled segments. Code spans come from THE one code-range
 * rule (@ai-matrx/content-ir/source) and are held behind placeholders, so the
 * emphasis pattern never reads inside code and code inside **bold** stays code.
 */
function parseInline(text: string, base: InlineStyle = {}): Segment[] {
  const codes: string[] = [];
  const held = text.includes("`")
    ? mapCodeRanges(text, (range, raw) => {
        if (range.kind !== "span") return raw;
        codes.push(codeSpanText(raw));
        return `\uE400${codes.length - 1}\uE401`;
      })
    : text;
  if (codes.length === 0) return parseStyled(held, base);
  return parseStyled(held, base).flatMap((seg) => {
    const out: Segment[] = [];
    let at = 0;
    for (const m of seg.text.matchAll(CODE_TOKEN)) {
      if ((m.index ?? 0) > at) out.push({ ...seg, text: seg.text.slice(at, m.index) });
      out.push({ ...seg, text: codes[Number(m[1])] ?? "", code: true });
      at = (m.index ?? 0) + m[0].length;
    }
    if (at < seg.text.length) out.push({ ...seg, text: seg.text.slice(at) });
    return out.filter((s) => s.text.length > 0);
  });
}

function parseStyled(text: string, base: InlineStyle = {}): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index), ...base });
    if (m[1] !== undefined) {
      segs.push(...parseStyled(m[2], { ...base, bold: true }));
    } else if (m[3] !== undefined) {
      segs.push(...parseStyled(m[4], { ...base, italic: true }));
    } else if (m[5] !== undefined) {
      segs.push(...parseStyled(m[5], { ...base, strike: true }));
    } else if (m[6] !== undefined) {
      // Link → render the link text only (normal content, no markdown syntax).
      segs.push(...parseStyled(m[6], base));
    }
    last = re.lastIndex;
  }
  if (last < text.length) segs.push({ text: text.slice(last), ...base });
  return segs.filter((s) => s.text.length > 0);
}

// ─── style helpers ───────────────────────────────────────────────────────────

const HEADING_FONT_SIZE: Record<number, number> = {
  1: 26,
  2: 22,
  3: 18,
  4: 16,
  5: 14,
  6: 13,
};

interface ParagraphOpts {
  /** 1-6 → heading; undefined → body text. */
  heading?: number;
  /** Render the whole paragraph in a monospace font (code block lines). */
  mono?: boolean;
}

function buildTextStyle(
  seg: Segment,
  opts: ParagraphOpts,
): ITextStyle | undefined {
  const ts: ITextStyle = {};
  if (seg.bold || opts.heading) ts.bl = BooleanNumber.TRUE;
  if (seg.italic) ts.it = BooleanNumber.TRUE;
  if (seg.strike) ts.st = { s: BooleanNumber.TRUE };
  if (seg.code || opts.mono) ts.ff = "monospace";
  if (opts.heading) ts.fs = HEADING_FONT_SIZE[opts.heading] ?? 16;
  else if (seg.code || opts.mono) ts.fs = 12;
  return Object.keys(ts).length > 0 ? ts : undefined;
}

// ─── document builder ────────────────────────────────────────────────────────

class DocBuilder {
  private parts: string[] = [];
  private cursor = 0;
  private paragraphs: IParagraph[] = [];
  private paragraphIds = new Set<string>();
  private textRuns: ITextRun[] = [];

  addParagraph(segments: Segment[], opts: ParagraphOpts = {}): void {
    for (const seg of segments) {
      if (!seg.text) continue;
      const st = this.cursor;
      this.parts.push(seg.text);
      this.cursor += seg.text.length;
      const ts = buildTextStyle(seg, opts);
      if (ts) this.textRuns.push({ st, ed: this.cursor, ts });
    }
    // Paragraph terminator.
    this.parts.push("\r");
    this.paragraphs.push({
      startIndex: this.cursor,
      paragraphId: createParagraphId(this.paragraphIds),
    });
    this.cursor += 1;
  }

  isEmpty(): boolean {
    return this.paragraphs.length === 0;
  }

  build(title: string): Partial<IDocumentData> {
    if (this.isEmpty()) {
      // Univer requires at least one paragraph + section break.
      this.parts.push("\r");
      this.paragraphs.push({
        startIndex: this.cursor,
        paragraphId: createParagraphId(this.paragraphIds),
      });
      this.cursor += 1;
    }
    this.parts.push("\n");
    const sectionBreaks: ISectionBreak[] = [
      {
        startIndex: this.cursor,
        sectionId: createSectionId(new Set()),
      },
    ];
    this.cursor += 1;

    return {
      id: cryptoRandomId(),
      locale: LocaleType.EN_US,
      title,
      body: {
        dataStream: this.parts.join(""),
        paragraphs: this.paragraphs,
        textRuns: this.textRuns,
        sectionBreaks,
      },
      documentStyle: defaultDocumentPageStyle(),
    };
  }
}

// ─── block helpers ───────────────────────────────────────────────────────────

const TABLE_CELL_SEP = "   |   ";

// THE GFM row rule (gfm-table-lines): an escaped `\|` stays in its cell and
// shows as `|` (the one cell-pipe rule), exactly as chat and Studio draw it.
const splitTableRow = (line: string): string[] => rowCells(line).map(unescapeCellPipes);

function addTable(builder: DocBuilder, tableLines: string[]): void {
  const header = splitTableRow(tableLines[0]);
  // tableLines[1] is the `---|---` separator — skip it.
  const rows = tableLines
    .slice(2)
    .map(splitTableRow)
    .filter((r) => r.some((c) => c.length > 0));

  const rowToSegments = (cells: string[], bold: boolean): Segment[] => {
    const segs: Segment[] = [];
    cells.forEach((cell, idx) => {
      if (idx > 0) segs.push({ text: TABLE_CELL_SEP });
      segs.push(...parseInline(cell, bold ? { bold: true } : {}));
    });
    return segs;
  };

  builder.addParagraph(rowToSegments(header, true));
  for (const row of rows) builder.addParagraph(rowToSegments(row, false));
}

/**
 * Remove reasoning/thinking blocks so they never leak into the document.
 * Defensive — most callers pass already-flattened text, but a raw markdown
 * source could still carry `<think>` / `<thinking>` tags.
 */
function stripThinking(markdown: string): string {
  return markdown
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .trim();
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Convert markdown to a Univer `IDocumentData` snapshot. Pure — no I/O. Pass
 * the result straight to `saveDocumentSnapshot`.
 */
export function markdownToUniverDoc(
  markdown: string,
  title = "Untitled document",
): Partial<IDocumentData> {
  const builder = new DocBuilder();
  const cleaned = stripThinking(markdown ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = cleaned.split("\n");
  // Fenced code by THE one code-range rule (@ai-matrx/content-ir/source).
  const kinds = fenceLineKinds(cleaned);

  let i = 0;
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length === 0) return;
    const text = paragraphBuf.join(" ").trim();
    if (text) builder.addParagraph(parseInline(text));
    paragraphBuf = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line — paragraph boundary.
    if (!trimmed) {
      flushParagraph();
      i++;
      continue;
    }

    // Fenced code block.
    if (kinds[i] === "open") {
      flushParagraph();
      i++;
      const code: string[] = [];
      while (i < lines.length && kinds[i] === "body") {
        code.push(lines[i]);
        i++;
      }
      if (kinds[i] === "close") i++; // consume the closing fence
      for (const c of code) {
        builder.addParagraph([{ text: c.length ? c : " ", code: true }], {
          mono: true,
        });
      }
      continue;
    }

    // ATX heading.
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      builder.addParagraph(parseInline(heading[2].trim()), {
        heading: heading[1].length,
      });
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^(\s*[-*_]\s*){3,}$/.test(trimmed) && /^[\s\-*_]+$/.test(trimmed)) {
      flushParagraph();
      builder.addParagraph([{ text: "\u2014".repeat(24) }]);
      i++;
      continue;
    }

    // GFM table (THE rule, gfm-table-lines): a header — with or without edge
    // pipes — immediately followed by its delimiter row.
    if (tableStartsAt(lines, i)) {
      flushParagraph();
      const tableLines: string[] = [];
      const tableEnd = findTableEnd(lines, i);
      while (i < tableEnd) {
        tableLines.push(lines[i].trim());
        i++;
      }
      addTable(builder, tableLines);
      continue;
    }

    // Blockquote.
    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      builder.addParagraph(parseInline(quote[1]), {});
      i++;
      continue;
    }

    // List item (ordered or unordered, with nesting by indent).
    const list = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (list) {
      flushParagraph();
      const indent = list[1].replace(/\t/g, "  ").length;
      const level = Math.min(Math.floor(indent / 2), 5);
      const ordered = /\d/.test(list[2]);
      const marker = ordered ? `${list[2].replace(/[.)]$/, "")}.` : "\u2022";
      const prefix = `${"    ".repeat(level)}${marker} `;
      builder.addParagraph([{ text: prefix }, ...parseInline(list[3])]);
      i++;
      continue;
    }

    // Default — accumulate into the current paragraph.
    paragraphBuf.push(trimmed);
    i++;
  }

  flushParagraph();
  return builder.build(title);
}

/**
 * Derive a sensible document name from markdown: first heading, else first
 * non-empty line, trimmed of markdown syntax. Falls back to a dated default.
 */
export function deriveDocumentName(markdown: string): string {
  const cleaned = stripThinking(markdown ?? "");
  // First heading, else the first line — through the ONE plain-text title
  // projection (components/markdown-core/plain-title.ts).
  const lines = cleaned.split("\n");
  const heading = lines.find((l) => /^\s{0,3}#{1,6}\s+/.test(l));
  const plain = plainTitleFromMarkdown(heading ?? cleaned);
  if (!plain) {
    return `Document ${new Date().toLocaleDateString()}`;
  }
  return plainTitleFromMarkdown(plain, { maxLength: 80 });
}
