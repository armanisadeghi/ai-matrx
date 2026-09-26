// components/rich-editor/core/markdown-serialize.ts
//
// ProseMirror → markdown, for the ONLY blocks the person actually changed.
// Unchanged blocks never come through here — the visual document writes them
// back as their stored bytes (visual-document.ts). This serializer's contract:
//
//   1. NO ESCAPES, EVER. Text is written exactly as typed. A backslash, `&amp;`
//      or `\*` appears in the output only if it is in the text itself. (Typing
//      markdown in visual mode therefore produces that markdown — the way
//      markdown shortcuts work in every modern editor.)
//   2. THE AUTHOR'S SPELLING. Every node/mark carries the spelling the source
//      used (`md*` attributes, extensions.ts): `*` vs `-` bullets, `**` vs `__`,
//      `1)` vs `1.`, heading style, quote prefix, link tail, code-span ticks.
//      Nodes the person created fall back to the platform defaults below.
//   3. ISLANDS ARE BYTES. `islandBlock`, `sourceLocked` and `inlineIsland`
//      write their `raw` attribute verbatim — never re-derived.
//   4. ORIGINAL SPACING. Between two siblings that were adjacent in the source,
//      the original line breaks are reused (`adjacency`); a new adjacency gets
//      the separator markdown needs (a blank line between blocks).
//
// The load (markdown-parse.ts) admits a construct to visual editing only when
// this serializer reproduces its stored bytes exactly, so contract 2 is
// measured, not hoped for.

import { assertTableReadsBack, freshRow, respliceRow } from "./table-source";
import type { Mark, Node as PMNode } from "@tiptap/pm/model";

export interface Adjacency {
  /** The exact bytes that followed this node in the source (its line breaks). */
  readonly trail: string;
  /** The id of the sibling that followed it, if any. */
  readonly next: string | null;
}

export interface SerializeContext {
  readonly adjacency: ReadonlyMap<string, Adjacency>;
  /** Ids already written in this pass — a duplicate (copy/paste) is new text. */
  readonly claimed: Set<string>;
  /**
   * Exact stored bytes for an unchanged node, when the caller holds them.
   * Returning null means "serialize it".
   */
  readonly reuse?: (id: string, node: PMNode) => string | null;
}

export function createSerializeContext(
  adjacency: ReadonlyMap<string, Adjacency> = new Map(),
  reuse?: SerializeContext["reuse"],
): SerializeContext {
  return { adjacency, claimed: new Set(), reuse };
}

type ContainerKind = "wrapper" | "blockquote" | "listItem" | "doc";

const DEFAULT_BULLET = "-";
const DEFAULT_BOLD = "**";
const DEFAULT_ITALIC = "*";
const DEFAULT_STRIKE = "~~";

function attr<T>(node: PMNode | Mark, key: string): T | null {
  const value = (node.attrs as Record<string, unknown>)[key];
  return value === undefined || value === null ? null : (value as T);
}

/** Claim a node's source id for this pass; null when it has none or was taken. */
function claim(node: PMNode, ctx: SerializeContext): string | null {
  const id = attr<string>(node, "mdId");
  if (!id || ctx.claimed.has(id)) return null;
  ctx.claimed.add(id);
  return id;
}

function separator(
  prevId: string | null,
  id: string | null,
  fallback: string,
  ctx: SerializeContext,
): string {
  if (prevId && id) {
    const adjacency = ctx.adjacency.get(prevId);
    if (adjacency && adjacency.next === id) return adjacency.trail;
  }
  return fallback;
}

function isDroppableEmpty(node: PMNode): boolean {
  return node.isTextblock && node.content.size === 0;
}

/** Serialize a container's block children with original spacing. */
export function serializeChildren(
  parent: PMNode,
  kind: ContainerKind,
  ctx: SerializeContext,
): string {
  let out = "";
  let prevId: string | null = null;
  let first = true;
  parent.forEach((child) => {
    const id = claim(child, ctx);
    const reused = id && ctx.reuse ? ctx.reuse(id, child) : null;
    const body = reused ?? serializeBlock(child, ctx);
    if (body === "" && isDroppableEmpty(child)) return;
    if (!first) {
      const fallback =
        kind === "listItem" &&
        (child.type.name === "bulletList" || child.type.name === "orderedList")
          ? "\n"
          : "\n\n";
      out += separator(prevId, id, fallback, ctx);
    }
    out += body;
    first = false;
    prevId = id;
  });
  // A stored block can end in bytes after its last construct (trailing spaces
  // on the final line): they belong to the block, so they stay with it while
  // its original last child is still last.
  if (kind === "wrapper" && prevId) {
    const adjacency = ctx.adjacency.get(prevId);
    if (adjacency && adjacency.next === null) out += adjacency.trail;
  }
  return out;
}

/** Serialize one block node (fresh — the caller decides about reuse). */
export function serializeBlock(node: PMNode, ctx: SerializeContext): string {
  switch (node.type.name) {
    case "paragraph":
      return serializeInline(node);
    case "heading":
      return serializeHeading(node);
    case "bulletList":
    case "orderedList":
      return serializeList(node, ctx);
    case "listItem":
      return serializeListItem(node, DEFAULT_BULLET, ctx);
    case "blockquote":
      return serializeBlockquote(node, ctx);
    case "horizontalRule":
      return attr<string>(node, "mdRaw") ?? "---";
    case "table":
      return serializeTable(node);
    case "sourceLocked":
    case "islandBlock":
      return String(node.attrs.raw ?? "");
    case "sourceBlock":
      return serializeChildren(node, "wrapper", ctx);
    case "doc":
      return serializeChildren(node, "doc", ctx);
    default:
      return node.textContent;
  }
}

function serializeHeading(node: PMNode): string {
  const level = Number(node.attrs.level) || 1;
  const text = serializeInline(node);
  let open = attr<string>(node, "mdOpen");
  let close = attr<string>(node, "mdClose") ?? "";
  if (open !== null) {
    const setext = close.startsWith("\n");
    if (setext) {
      if (level > 2) open = null;
      else {
        const underline = level === 1 ? "=" : "-";
        const lineLength = Math.max(3, close.length - 1);
        const expected = close.slice(1).trimEnd();
        if (!expected.split("").every((char) => char === underline)) {
          close = "\n" + underline.repeat(lineLength);
        }
        return open + text + close;
      }
    } else {
      const atx = /^ {0,3}(#{1,6})(?=[ \t]|$)/.exec(open);
      if (!atx || (atx[1] ?? "").length !== level) open = null;
    }
  }
  if (open === null) {
    open = `${"#".repeat(level)} `;
    close = "";
  }
  return open + text.replace(/\n/g, " ") + close;
}

function nextMarker(
  ordered: boolean,
  prev: string | null,
  start: number,
  index: number,
): string {
  if (!ordered) return prev && /^[-*+]$/.test(prev) ? prev : DEFAULT_BULLET;
  if (prev) {
    const match = /^(\d+)([.)])$/.exec(prev);
    if (match) return `${Number(match[1]) + 1}${match[2]}`;
  }
  return `${start + index}.`;
}

function serializeList(list: PMNode, ctx: SerializeContext): string {
  const ordered = list.type.name === "orderedList";
  const start = Number(list.attrs.start ?? 1) || 1;
  let out = "";
  let prevId: string | null = null;
  let prevMarker: string | null = null;
  let index = 0;
  list.forEach((item) => {
    const id = claim(item, ctx);
    const stored = attr<string>(item, "mdMarker");
    const marker =
      stored && (ordered ? /^\d+[.)]$/.test(stored) : /^[-*+]$/.test(stored))
        ? stored
        : nextMarker(ordered, prevMarker, start, index);
    const body = serializeListItem(item, marker, ctx);
    if (index > 0) out += separator(prevId, id, "\n", ctx);
    out += body;
    prevId = id;
    prevMarker = marker;
    index += 1;
  });
  return out;
}

function serializeListItem(
  item: PMNode,
  marker: string,
  ctx: SerializeContext,
): string {
  const lead = attr<string>(item, "mdLead") ?? "";
  const after = attr<string>(item, "mdAfter") ?? " ";
  const task = attr<string>(item, "mdTask") ?? "";
  const body = serializeChildren(item, "listItem", ctx);
  const head = lead + marker;
  if (body === "") return task ? `${head}${after || " "}${task}`.trimEnd() : head;
  const indent =
    attr<number>(item, "mdIndent") ?? (lead + marker + (after || " ")).length;
  const pad = " ".repeat(indent);
  const lines = body.split("\n");
  let out = head + (after || " ") + task + (lines[0] ?? "");
  for (const line of lines.slice(1)) out += `\n${line === "" ? "" : pad + line}`;
  return out;
}

function serializeBlockquote(node: PMNode, ctx: SerializeContext): string {
  const prefix = attr<string>(node, "mdPrefix") ?? "> ";
  const alert = attr<string>(node, "mdAlert");
  const children = serializeChildren(node, "blockquote", ctx);
  const body = alert ? (children ? `${alert}\n${children}` : alert) : children;
  return body
    .split("\n")
    .map((line) => (line === "" ? prefix.trimEnd() : prefix + line))
    .join("\n");
}

// ── Tables (GFM) ───────────────────────────────────────────────────────────

export type ColumnAlign = "left" | "center" | "right" | null;

function cellText(cell: PMNode): string {
  const paragraph = cell.firstChild;
  return paragraph ? serializeInline(paragraph) : "";
}

function delimiterFor(align: ColumnAlign, width?: number): string {
  if (width === undefined) {
    if (align === "left") return ":---";
    if (align === "right") return "---:";
    if (align === "center") return ":---:";
    return "---";
  }
  const n = Math.max(width, 3);
  if (align === "left") return `:${"-".repeat(n - 1)}`;
  if (align === "right") return `${"-".repeat(n - 1)}:`;
  if (align === "center") return `:${"-".repeat(n - 2)}:`;
  return "-".repeat(n);
}

function alignOfDelimiter(cell: string): ColumnAlign {
  const core = cell.trim();
  const left = core.startsWith(":");
  const right = core.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return null;
}

/**
 * The stored delimiter row with ONLY the re-aligned columns' cells rewritten
 * (same width, same surrounding spaces). Null when the column count changed —
 * then the whole row is written fresh.
 */
function respliceDelimiter(stored: string, aligns: readonly ColumnAlign[], lead: boolean, trail: boolean): string | null {
  const segments = stored.split("|");
  const first = lead ? 1 : 0;
  const last = trail ? segments.length - 1 : segments.length;
  const cells = segments.slice(first, last);
  if (cells.length !== aligns.length) return null;
  const next = cells.map((cell, index) => {
    const align = aligns[index] ?? null;
    if (alignOfDelimiter(cell) === align) return cell;
    const core = cell.trim();
    const start = cell.indexOf(core);
    return `${cell.slice(0, start)}${delimiterFor(align, core.length)}${cell.slice(start + core.length)}`;
  });
  return [...segments.slice(0, first), ...next, ...segments.slice(last)].join("|");
}

function parseJsonArray(value: string | null): unknown[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function serializeTable(table: PMNode): string {
  const pipes = attr<string>(table, "mdPipes") ?? "both";
  const lead = pipes === "both" || pipes === "lead";
  const trail = pipes === "both" || pipes === "trail";
  const lines: string[] = [];
  let aligns: ColumnAlign[] = [];
  table.forEach((row, _offset, index) => {
    const cells: PMNode[] = [];
    row.forEach((cell) => cells.push(cell));
    if (index === 0) {
      aligns = cells.map((cell) => (cell.attrs.align as ColumnAlign) ?? null);
    }
    const texts = cells.map(cellText);
    const stored = parseJsonArray(attr<string>(row, "mdCells"));
    const raw = attr<string>(row, "mdRaw");
    let line: string;
    if (raw !== null && stored && JSON.stringify(stored) === JSON.stringify(texts)) {
      line = raw;
    } else {
      line =
        respliceRow(parseJsonArray(attr<string>(row, "mdSegs")), stored, texts) ??
        freshRow(texts, lead, trail);
    }
    lines.push(line);
    if (index === 0) {
      const storedAligns = attr<string>(table, "mdAligns");
      const delim = attr<string>(table, "mdDelim");
      const fresh = () => freshRow(aligns.map((align) => delimiterFor(align)), lead, trail);
      lines.push(
        delim === null
          ? fresh()
          : storedAligns === JSON.stringify(aligns)
            ? delim
            : (respliceDelimiter(delim, aligns, lead, trail) ?? fresh()),
      );
    }
  });
  const written = lines.join("\n");
  // The whole table must read back as one table (a pipe-less row starting `- `
  // would end it): refused, never written (verify-RC-B4 R5-1).
  assertTableReadsBack(written);
  return written;
}

// ── Inline ─────────────────────────────────────────────────────────────────

const MARK_RANK: Record<string, number> = {
  link: 0,
  bold: 1,
  italic: 2,
  strike: 3,
  code: 4,
};

/** CommonMark's escapable characters: ASCII punctuation. */
const ESCAPABLE = /[!-/:-@[-`{-~]/g;

function leafText(node: PMNode): string {
  if (node.isText) {
    const text = node.text ?? "";
    return node.marks.some((mark) => mark.type.name === "mdEscape") ? text.replace(ESCAPABLE, "\\$&") : text;
  }
  if (node.type.name === "inlineIsland") return String(node.attrs.raw ?? "");
  if (node.type.name === "hardBreak") return attr<string>(node, "mdRaw") ?? "\n";
  return node.textContent;
}

/**
 * A text node as written into the source. A backslash the person TYPED is a
 * literal character, but markdown reads a backslash before ASCII punctuation as
 * an escape — so `C:\\new\\` typed into a bold cell was written
 * `**C:\\new\\**` and its last backslash ate the closing `*`
 * (verify-RC-B4 R4). A typed backslash is doubled where it would escape
 * something: before ASCII punctuation, and at the end of a text run that
 * markup or more text follows. Author escapes (`mdEscape`) and code are
 * written as they are; a backslash before a letter or space needs nothing.
 */
function literalText(node: PMNode, followed: boolean): string {
  const text = leafText(node);
  if (!node.isText || node.marks.some((mark) => mark.type.name === "mdEscape" || mark.type.name === "code")) return text;
  let out = text.replace(/\\(?=[!-/:-@[-`{-~])/g, "\\\\");
  if (followed && /(^|[^\\])(\\\\)*\\$/.test(out)) out += "\\";
  return out;
}

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) {
    longest = Math.max(longest, match[0].length);
  }
  return longest;
}

function markDelimiters(mark: Mark, runText: string): [string, string] {
  switch (mark.type.name) {
    case "bold": {
      const marker = attr<string>(mark, "mdMarker") ?? DEFAULT_BOLD;
      return [marker, marker];
    }
    case "italic": {
      const marker = attr<string>(mark, "mdMarker") ?? DEFAULT_ITALIC;
      return [marker, marker];
    }
    case "strike": {
      const marker = attr<string>(mark, "mdMarker") ?? DEFAULT_STRIKE;
      return [marker, marker];
    }
    case "code": {
      const open = attr<string>(mark, "mdOpen");
      const close = attr<string>(mark, "mdClose");
      if (open !== null && close !== null) return [open, close];
      const ticks = "`".repeat(longestBacktickRun(runText) + 1);
      const pad = runText.startsWith("`") || runText.endsWith("`") ? " " : "";
      return [ticks + pad, pad + ticks];
    }
    case "link": {
      const href = String(mark.attrs.href ?? "");
      const form = attr<string>(mark, "mdForm");
      const hrefUnchanged = href === attr<string>(mark, "mdTailHref");
      if (
        (form === "angle" || form === "bare") &&
        hrefUnchanged &&
        runText === attr<string>(mark, "mdText")
      ) {
        return form === "angle" ? ["<", ">"] : ["", ""];
      }
      const storedTail = attr<string>(mark, "mdTail");
      const title = attr<string>(mark, "title");
      const tail =
        form === "inline" && storedTail !== null && hrefUnchanged
          ? storedTail
          : `(${href}${title ? ` "${title}"` : ""})`;
      return ["[", `]${tail}`];
    }
    default:
      return ["", ""];
  }
}

interface OpenMark {
  mark: Mark;
  close: string;
  /** Index of the first item past this mark's run. */
  end: number;
}

const EDGE_SENSITIVE_MARKS = new Set(["bold", "italic", "strike"]);

/**
 * CommonMark only reads `**x**` as bold when no whitespace sits just inside a
 * delimiter; `** x**` is literal asterisks. So whitespace at the edge of a
 * bold/italic/strike run is moved OUTSIDE the mark before writing (text typed
 * at the start of a bold cell used to store `** hardfail**`, verify-RC-B4
 * R3-4), and a run of nothing but whitespace loses the mark.
 */
function hoistEdgeWhitespace(items: PMNode[]): PMNode[] {
  const out = [...items];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i += 1) {
      const node = out[i];
      if (!node?.isText || !node.text) continue;
      const text = node.text;
      for (const mark of node.marks) {
        if (!EDGE_SENSITIVE_MARKS.has(mark.type.name)) continue;
        const startsRun = !mark.isInSet(out[i - 1]?.marks ?? []);
        const endsRun = !mark.isInSet(out[i + 1]?.marks ?? []);
        const lead = startsRun ? (/^\s+/.exec(text)?.[0] ?? "") : "";
        const trail = endsRun && lead.length < text.length ? (/\s+$/.exec(text)?.[0] ?? "") : "";
        if (!lead && !trail) continue;
        const bare = mark.removeFromSet(node.marks);
        const body = text.slice(lead.length, text.length - trail.length);
        const pieces: PMNode[] = [];
        if (lead) pieces.push(node.type.schema.text(lead, bare));
        if (body) pieces.push(node.type.schema.text(body, node.marks));
        if (trail) pieces.push(node.type.schema.text(trail, bare));
        out.splice(i, 1, ...pieces);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** Serialize a textblock's inline content — marks nested as the source nested them. */
export function serializeInline(parent: PMNode): string {
  const children: PMNode[] = [];
  parent.forEach((child) => children.push(child));
  const items = hoistEdgeWhitespace(children);
  // A code span is literal: nothing inside its backticks is syntax, so it can
  // never wrap another mark's delimiters. Its run therefore ends wherever the
  // OTHER marks change — `the `[`x`](u), never `the [x](u)` — which also makes it
  // the innermost mark of every run it shares.
  const others = (node: PMNode | undefined): readonly Mark[] => (node?.marks ?? []).filter((m) => m.type.name !== "code");
  const sameOthers = (a: PMNode | undefined, b: PMNode | undefined): boolean => {
    const x = others(a);
    const y = others(b);
    return x.length === y.length && x.every((mark) => mark.isInSet(y));
  };
  const runEnd = (from: number, mark: Mark): number => {
    let end = from;
    while (
      end < items.length &&
      mark.isInSet(items[end]?.marks ?? []) &&
      (mark.type.name !== "code" || sameOthers(items[from], items[end]))
    ) {
      end += 1;
    }
    return end;
  };
  const runText = (from: number, to: number): string =>
    items
      .slice(from, to)
      .map((node) => leafText(node))
      .join("");

  let out = "";
  const stack: OpenMark[] = [];
  items.forEach((node, index) => {
    const marks = node.marks;
    let keep = 0;
    while (keep < stack.length && stack[keep]?.mark.isInSet(marks) && (stack[keep]?.end ?? 0) > index) keep += 1;
    for (let k = stack.length - 1; k >= keep; k -= 1) out += stack[k]?.close ?? "";
    stack.length = keep;

    const toOpen = marks
      .filter((mark) => !stack.some((open) => open.mark.eq(mark)))
      .map((mark) => ({ mark, end: runEnd(index, mark) }));
    toOpen.sort((a, b) => {
      if (a.end !== b.end) return b.end - a.end;
      const da = attr<number>(a.mark, "mdDepth") ?? Number.MAX_SAFE_INTEGER;
      const db = attr<number>(b.mark, "mdDepth") ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return (MARK_RANK[a.mark.type.name] ?? 9) - (MARK_RANK[b.mark.type.name] ?? 9);
    });
    for (const { mark, end } of toOpen) {
      const [open, close] = markDelimiters(mark, runText(index, end));
      out += open;
      stack.push({ mark, close, end });
    }
    out += literalText(node, index < items.length - 1 || node.marks.some((mark) => mark.type.name !== "mdEscape"));
  });
  for (let k = stack.length - 1; k >= 0; k -= 1) out += stack[k]?.close ?? "";
  return out;
}
