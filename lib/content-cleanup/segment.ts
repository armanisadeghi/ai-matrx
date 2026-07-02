// lib/content-cleanup/segment.ts
//
// Protected-region detector. Scans content and returns the spans that must
// NEVER be altered by cleanup operations — because reflowing whitespace inside
// them changes their meaning: fenced/inline code, naked JSON, markdown tables,
// YAML front matter, and raw HTML blocks.
//
// Strategy:
//   1. Detect "hard" structural regions first (front matter, fenced code).
//      These are unambiguous and outrank everything.
//   2. Build a mask of those offsets.
//   3. Detect "soft" regions (tables, HTML, naked JSON, inline code) only in
//      the gaps, so a brace-scanner can never wander into a code block.
//   4. Resolve any residual overlaps by priority, return sorted & disjoint.
//
// Pure: no React / DOM. The single export `getProtectedRegions` is the engine
// boundary; the rest is private.

import type {
  ProtectedKind,
  ProtectedRegion,
  ProtectionConfidence,
} from "./types";

interface LineInfo {
  start: number;
  /** Offset of the line's terminating `\n` (or text.length for the last line). */
  end: number;
  text: string;
}

/** Higher number wins when two candidate regions overlap. */
const PRIORITY: Record<ProtectedKind, number> = {
  "front-matter": 60,
  "fenced-code": 50,
  table: 40,
  "html-block": 30,
  "json-block": 20,
  "inline-code": 10,
};

function getLines(text: string): LineInfo[] {
  const lines: LineInfo[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === "\n") {
      lines.push({ start, end: i, text: text.slice(start, i) });
      start = i + 1;
    }
  }
  return lines;
}

function previewOf(s: string): string {
  // split("\n") always returns at least one element, so [0] is always defined
  // at runtime; noUncheckedIndexedAccess still types it as possibly undefined.
  const [firstLineRaw = ""] = s.split("\n");
  const firstLine = firstLineRaw.trim();
  const collapsed = firstLine.replace(/\s+/g, " ");
  return collapsed.length > 80 ? `${collapsed.slice(0, 79)}…` : collapsed;
}

function lineCountOf(s: string): number {
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s[i] === "\n") n++;
  return n;
}

function makeRegion(
  text: string,
  start: number,
  end: number,
  kind: ProtectedKind,
  confidence: ProtectionConfidence,
  reason: string,
): ProtectedRegion {
  const slice = text.slice(start, end);
  return {
    start,
    end,
    kind,
    confidence,
    reason,
    preview: previewOf(slice),
    lineCount: lineCountOf(slice),
  };
}

// ── Hard regions ───────────────────────────────────────────────────────────

function detectFrontMatter(
  text: string,
  lines: LineInfo[],
): ProtectedRegion | null {
  if (lines.length < 2) return null;
  if (lines[0].text.trim() !== "---") return null;
  for (let j = 1; j < lines.length; j++) {
    const t = lines[j].text.trim();
    if (t === "---" || t === "...") {
      return makeRegion(
        text,
        0,
        lines[j].end,
        "front-matter",
        "certain",
        "YAML front matter",
      );
    }
  }
  return null;
}

function detectFenced(text: string, lines: LineInfo[]): ProtectedRegion[] {
  const regions: ProtectedRegion[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(lines[i].text);
    if (!open) {
      i++;
      continue;
    }
    const fenceChar = open[2][0];
    const fenceLen = open[2].length;
    const info = open[3].trim();
    const start = lines[i].start;
    const closeRe = new RegExp(
      `^ {0,3}\\${fenceChar}{${fenceLen},}\\s*$`,
    );
    let end = text.length;
    let closeLine = lines.length - 1;
    for (let j = i + 1; j < lines.length; j++) {
      if (closeRe.test(lines[j].text)) {
        end = lines[j].end;
        closeLine = j;
        break;
      }
    }
    regions.push(
      makeRegion(
        text,
        start,
        end,
        "fenced-code",
        "certain",
        info ? `Fenced code block (${info})` : "Fenced code block",
      ),
    );
    i = closeLine + 1;
  }
  return regions;
}

// ── Soft regions (gap-only) ────────────────────────────────────────────────

function detectTables(
  text: string,
  lines: LineInfo[],
  masked: (offset: number) => boolean,
): ProtectedRegion[] {
  const regions: ProtectedRegion[] = [];
  // Delimiter row: pipe-bounded dashes, e.g. | --- | :--: |
  const delim = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
  const hasPipe = (s: string) => s.includes("|");
  let i = 1;
  while (i < lines.length) {
    const isDelim =
      delim.test(lines[i].text) &&
      hasPipe(lines[i].text) &&
      hasPipe(lines[i - 1].text) &&
      lines[i - 1].text.trim() !== "";
    if (!isDelim || masked(lines[i - 1].start)) {
      i++;
      continue;
    }
    const startLine = i - 1;
    let endLine = i;
    let j = i + 1;
    while (j < lines.length && hasPipe(lines[j].text) && lines[j].text.trim() !== "") {
      endLine = j;
      j++;
    }
    regions.push(
      makeRegion(
        text,
        lines[startLine].start,
        lines[endLine].end,
        "table",
        "likely",
        "Markdown table (column alignment preserved)",
      ),
    );
    i = j;
  }
  return regions;
}

const HTML_BLOCK_TAG =
  /^\s*<\/?(?:div|table|thead|tbody|tfoot|tr|td|th|ul|ol|li|dl|dt|dd|pre|section|article|aside|header|footer|nav|main|details|summary|figure|figcaption|blockquote|svg|style|script|iframe|form|fieldset|p|hr|br|img|h[1-6])\b/i;

function detectHtmlBlocks(
  text: string,
  lines: LineInfo[],
  masked: (offset: number) => boolean,
): ProtectedRegion[] {
  const regions: ProtectedRegion[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!HTML_BLOCK_TAG.test(lines[i].text) || masked(lines[i].start)) {
      i++;
      continue;
    }
    const startLine = i;
    let endLine = i;
    let j = i + 1;
    // Extend over contiguous non-blank lines (a raw HTML block).
    while (j < lines.length && lines[j].text.trim() !== "" && !masked(lines[j].start)) {
      endLine = j;
      j++;
    }
    regions.push(
      makeRegion(
        text,
        lines[startLine].start,
        lines[endLine].end,
        "html-block",
        "likely",
        "Raw HTML block",
      ),
    );
    i = j;
  }
  return regions;
}

/** Walk balanced brackets from `start` (a `{` or `[`), respecting strings and
 *  escapes. Returns the exclusive end offset of the matching close, or null. */
function scanBalanced(text: string, start: number): number | null {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i + 1;
      if (depth < 0) return null;
    }
  }
  return null;
}

/** Decide whether a balanced `{…}`/`[…]` slice is worth protecting as data. */
function classifyJson(
  slice: string,
): { confidence: ProtectionConfidence; reason: string } | null {
  const trimmed = slice.trim();
  if (trimmed.length < 2) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === "object") {
      const isArray = Array.isArray(parsed);
      const size = isArray
        ? (parsed as unknown[]).length
        : Object.keys(parsed as Record<string, unknown>).length;
      // Skip trivial single-line empties like {} / [] — nothing to protect.
      if (size === 0 && !trimmed.includes("\n")) return null;
      return {
        confidence: "certain",
        reason: isArray ? "JSON array" : "JSON object",
      };
    }
    return null;
  } catch {
    // Lenient: multi-line, quoted, structured — likely JSON that doesn't
    // strictly parse (trailing commas, comments, JS object literal).
    const multiline = trimmed.includes("\n");
    const looksStructured =
      trimmed.includes('"') && /[:,]/.test(trimmed) && trimmed.length > 20;
    if (multiline && looksStructured) {
      return {
        confidence: "likely",
        reason: "JSON-like structure (does not strictly parse)",
      };
    }
    return null;
  }
}

function detectJson(
  text: string,
  lines: LineInfo[],
  masked: (offset: number) => boolean,
): ProtectedRegion[] {
  const regions: ProtectedRegion[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)([{[])/.exec(lines[i].text);
    if (!m) continue;
    const openOffset = lines[i].start + m[1].length;
    if (masked(openOffset)) continue;
    if (regions.some((r) => openOffset >= r.start && openOffset < r.end)) continue;
    const end = scanBalanced(text, openOffset);
    if (end === null) continue;
    const verdict = classifyJson(text.slice(openOffset, end));
    if (!verdict) continue;
    regions.push(
      makeRegion(
        text,
        openOffset,
        end,
        "json-block",
        verdict.confidence,
        verdict.reason,
      ),
    );
    // Skip lines fully consumed by this region.
    while (i < lines.length && lines[i].end < end) i++;
  }
  return regions;
}

function detectInlineCode(
  text: string,
  lines: LineInfo[],
  masked: (offset: number) => boolean,
): ProtectedRegion[] {
  const regions: ProtectedRegion[] = [];
  for (const line of lines) {
    const re = /`[^`\n]+`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line.text)) !== null) {
      const start = line.start + m.index;
      if (masked(start)) continue;
      regions.push(
        makeRegion(
          text,
          start,
          start + m[0].length,
          "inline-code",
          "certain",
          "Inline code",
        ),
      );
    }
  }
  return regions;
}

// ── Overlap resolution ─────────────────────────────────────────────────────

function resolveOverlaps(regions: ProtectedRegion[]): ProtectedRegion[] {
  // Accept by descending priority, then by position; reject anything that
  // overlaps an already-accepted region.
  const sorted = [...regions].sort((a, b) => {
    const pa = PRIORITY[a.kind];
    const pb = PRIORITY[b.kind];
    if (pa !== pb) return pb - pa;
    return a.start - b.start;
  });
  const accepted: ProtectedRegion[] = [];
  for (const r of sorted) {
    const conflict = accepted.some((a) => r.start < a.end && a.start < r.end);
    if (!conflict) accepted.push(r);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

/**
 * Return the disjoint, sorted list of regions that cleanup operations must
 * leave untouched. Safe on any string; returns `[]` when nothing structured
 * is found (the common case for prose notes → instant clean).
 */
export function getProtectedRegions(content: string): ProtectedRegion[] {
  if (!content) return [];
  const lines = getLines(content);

  const hard: ProtectedRegion[] = [];
  const fm = detectFrontMatter(content, lines);
  if (fm) hard.push(fm);
  hard.push(...detectFenced(content, lines));
  const hardResolved = resolveOverlaps(hard);

  const maskOf = (offset: number): boolean =>
    hardResolved.some((r) => offset >= r.start && offset < r.end);

  const soft: ProtectedRegion[] = [
    ...detectTables(content, lines, maskOf),
    ...detectHtmlBlocks(content, lines, maskOf),
    ...detectJson(content, lines, maskOf),
    ...detectInlineCode(content, lines, maskOf),
  ];

  return resolveOverlaps([...hardResolved, ...soft]);
}
