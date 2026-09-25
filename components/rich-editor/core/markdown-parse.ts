// components/rich-editor/core/markdown-parse.ts
//
// One stored PROSE block → the rich nodes the visual editor edits.
//
// THE EDITOR LAYER'S ONE MARKDOWN PARSE EDGE. `marked`'s lexer is used ONLY
// here, and only as a tokenizer: every token carries its exact `raw` source,
// which is what lets the editor prove fidelity. It never renders anything —
// rendering stays with the one markdown core (MarkdownStream). Registered as
// the lawful editor-layer site of `pkg:marked` in
// scripts/rich-content-inventory/registry.ts.
//
// THE FIDELITY GATE. A top-level construct becomes editable rich text only
// when markdown-serialize.ts writes it back to its exact stored bytes. If it
// cannot (a table, raw HTML, an indented code block, a lazy blockquote line, a
// spelling the serializer does not model), it becomes a `sourceLocked` atom:
// shown rendered, edited as source, written back verbatim. A whole block with
// CRLF line endings or Private Use characters is locked outright.

import { Lexer, type Token, type Tokens } from "marked";
import { isPageBreakLine } from "@ai-matrx/print/directives";
import type { JSONContent } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import type { SourceBlock, SourceIsland } from "@ai-matrx/content-ir/source";
import {
  hasPrivateUseCharacter,
  restorePlaceholders,
  splitPlaceholders,
  withPlaceholders,
} from "./placeholders";
import {
  createSerializeContext,
  serializeBlock,
  type Adjacency,
} from "./markdown-serialize";

type MarkJSON = { type: string; attrs?: Record<string, unknown> };

export interface ParsedChild {
  json: JSONContent;
  /** The source id of the child (its `mdId`). */
  id: string;
  /** The child's exact stored bytes (no trailing line breaks). */
  raw: string;
  /** The line breaks that followed it inside the block. */
  trail: string;
  /** Why the child is held as source, or null when it is rich text. */
  lockedReason: string | null;
}

export interface ParsedProse {
  children: ParsedChild[];
  /** Set when the whole block is held as source. */
  lockedReason: string | null;
}

interface ParseState {
  schema: Schema;
  islands: readonly SourceIsland[];
  adjacency: Map<string, Adjacency>;
  nextId: () => string;
}

const LEXER_OPTIONS = { gfm: true, breaks: false, pedantic: false } as const;

/** Reason string that marks a held-as-source page-break directive line. */
export const PAGE_BREAK_REASON = "page break";

const LOCK_REASONS: Record<string, string> = {
  html: "raw HTML",
  code: "an indented code block",
  def: "a link reference definition",
};

function splitTrail(raw: string): { body: string; trail: string } {
  const match = /\n*$/.exec(raw);
  const trail = match ? match[0] : "";
  return { body: raw.slice(0, raw.length - trail.length), trail };
}

/** Merge adjacent text nodes with identical marks (a canonical doc). */
function pushInline(target: JSONContent[], node: JSONContent): void {
  const last = target[target.length - 1];
  if (
    node.type === "text" &&
    last?.type === "text" &&
    JSON.stringify(last.marks ?? []) === JSON.stringify(node.marks ?? [])
  ) {
    last.text = (last.text ?? "") + (node.text ?? "");
    return;
  }
  target.push(node);
}

function withMarks(node: JSONContent, marks: MarkJSON[]): JSONContent {
  return marks.length ? { ...node, marks: marks.map((m) => ({ ...m })) } : node;
}

function pushText(
  out: JSONContent[],
  text: string,
  marks: MarkJSON[],
  state: ParseState,
): void {
  for (const piece of splitPlaceholders(text, state.islands)) {
    if (piece.kind === "text") {
      if (piece.text) pushInline(out, withMarks({ type: "text", text: piece.text }, marks));
    } else {
      out.push(
        withMarks(
          {
            type: "inlineIsland",
            attrs: { raw: piece.island.raw, islandType: piece.island.islandType },
          },
          marks,
        ),
      );
    }
  }
}

function pushRaw(
  out: JSONContent[],
  raw: string,
  islandType: string,
  marks: MarkJSON[],
  state: ParseState,
): void {
  out.push(
    withMarks(
      {
        type: "inlineIsland",
        attrs: { raw: restorePlaceholders(raw, state.islands), islandType },
      },
      marks,
    ),
  );
}

function codeSpanParts(raw: string): { open: string; close: string; text: string } | null {
  const ticks = /^`+/.exec(raw)?.[0] ?? "";
  if (!ticks || !raw.endsWith(ticks) || raw.length <= ticks.length * 2) return null;
  const inner = raw.slice(ticks.length, raw.length - ticks.length);
  if (inner.length >= 2 && inner.startsWith(" ") && inner.endsWith(" ") && inner.trim() !== "") {
    return { open: `${ticks} `, close: ` ${ticks}`, text: inner.slice(1, -1) };
  }
  return { open: ticks, close: ticks, text: inner };
}

function inlineJSON(
  tokens: readonly Token[],
  marks: MarkJSON[],
  depth: number,
  state: ParseState,
  out: JSONContent[] = [],
): JSONContent[] {
  for (const token of tokens) {
    switch (token.type) {
      case "text": {
        const nested = (token as Tokens.Text).tokens;
        if (nested && nested.length) inlineJSON(nested, marks, depth, state, out);
        else pushText(out, token.raw, marks, state);
        break;
      }
      case "escape":
        pushText(out, token.raw, marks, state);
        break;
      case "strong":
        inlineJSON((token as Tokens.Strong).tokens, [
          ...marks,
          { type: "bold", attrs: { mdMarker: token.raw.slice(0, 2), mdDepth: depth } },
        ], depth + 1, state, out);
        break;
      case "em":
        inlineJSON((token as Tokens.Em).tokens, [
          ...marks,
          { type: "italic", attrs: { mdMarker: token.raw.slice(0, 1), mdDepth: depth } },
        ], depth + 1, state, out);
        break;
      case "del":
        inlineJSON((token as Tokens.Del).tokens, [
          ...marks,
          {
            type: "strike",
            attrs: { mdMarker: token.raw.startsWith("~~") ? "~~" : "~", mdDepth: depth },
          },
        ], depth + 1, state, out);
        break;
      case "codespan": {
        const parts = codeSpanParts(token.raw);
        if (!parts || !parts.text) {
          pushRaw(out, token.raw, "md_raw", marks, state);
          break;
        }
        pushText(out, parts.text, [
          ...marks,
          { type: "code", attrs: { mdOpen: parts.open, mdClose: parts.close, mdDepth: depth } },
        ], state);
        break;
      }
      case "link": {
        const link = token as Tokens.Link;
        let form: "inline" | "angle" | "bare" | null = null;
        let tail = "";
        if (link.raw.startsWith(`[${link.text}]`)) {
          form = "inline";
          tail = link.raw.slice(link.text.length + 2);
        } else if (link.raw === `<${link.text}>`) {
          form = "angle";
        } else if (link.raw === link.text) {
          form = "bare";
        }
        if (!form) {
          pushRaw(out, link.raw, "md_raw", marks, state);
          break;
        }
        const href = restorePlaceholders(link.href ?? "", state.islands);
        inlineJSON(link.tokens ?? [], [
          ...marks,
          {
            type: "link",
            attrs: {
              href,
              title: link.title ?? null,
              mdForm: form,
              mdTail: restorePlaceholders(tail, state.islands),
              mdTailHref: href,
              mdText: restorePlaceholders(link.text, state.islands),
              mdDepth: depth,
            },
          },
        ], depth + 1, state, out);
        break;
      }
      case "br":
        out.push(withMarks({ type: "hardBreak", attrs: { mdRaw: token.raw } }, marks));
        break;
      case "image":
        pushRaw(out, token.raw, "md_image", marks, state);
        break;
      case "html":
        pushRaw(out, token.raw, "md_html", marks, state);
        break;
      default:
        pushRaw(out, token.raw, "md_raw", marks, state);
    }
  }
  return out;
}

function inlineRaw(tokens: readonly Token[] | undefined): string {
  return (tokens ?? []).map((token) => token.raw).join("");
}

/** A block token → rich node JSON, or null when it cannot be held as rich text. */
function blockJSON(token: Token, state: ParseState): JSONContent | null {
  const { body } = splitTrail(token.raw);
  switch (token.type) {
    case "paragraph":
    case "text": {
      const tokens = (token as Tokens.Paragraph | Tokens.Text).tokens;
      const inline = tokens && tokens.length ? tokens : null;
      if (inline && inlineRaw(inline) !== body) return null;
      const content = inline
        ? inlineJSON(inline, [], 0, state)
        : (() => {
            const out: JSONContent[] = [];
            pushText(out, body, [], state);
            return out;
          })();
      return {
        type: "paragraph",
        attrs: { mdId: state.nextId() },
        ...(content.length ? { content } : {}),
      };
    }
    case "heading": {
      const heading = token as Tokens.Heading;
      const raw = inlineRaw(heading.tokens);
      let open: string;
      let close: string;
      const atx = /^ {0,3}#{1,6}(?:[ \t]+|$)/.exec(body);
      if (atx) {
        open = atx[0];
        const rest = body.slice(open.length);
        if (!rest.startsWith(raw)) return null;
        close = rest.slice(raw.length);
      } else {
        if (!body.startsWith(raw)) return null;
        open = "";
        close = body.slice(raw.length);
        if (!close.startsWith("\n")) return null;
      }
      const content = inlineJSON(heading.tokens ?? [], [], 0, state);
      return {
        type: "heading",
        attrs: {
          level: heading.depth,
          mdId: state.nextId(),
          mdOpen: restorePlaceholders(open, state.islands),
          mdClose: restorePlaceholders(close, state.islands),
        },
        ...(content.length ? { content } : {}),
      };
    }
    case "list": {
      const list = token as Tokens.List;
      const items: JSONContent[] = [];
      const ids: string[] = [];
      const trails: string[] = [];
      for (const item of list.items) {
        const json = listItemJSON(item, state);
        if (!json) return null;
        items.push(json);
        ids.push(String(json.attrs?.mdId));
        trails.push(splitTrail(item.raw).trail);
      }
      ids.forEach((id, index) =>
        state.adjacency.set(id, { trail: trails[index] ?? "", next: ids[index + 1] ?? null }),
      );
      const start = list.ordered ? Number(list.start === "" ? 1 : list.start) || 1 : null;
      return {
        type: list.ordered ? "orderedList" : "bulletList",
        attrs: { mdId: state.nextId(), ...(start !== null ? { start } : {}) },
        content: items,
      };
    }
    case "blockquote": {
      const quote = token as Tokens.Blockquote;
      const prefix = /^ {0,3}> ?/.exec(quote.raw)?.[0] ?? "> ";
      const children = childrenJSON(quote.tokens, state);
      if (!children || children.length === 0) return null;
      const alert = takeAlertMarker(children);
      if (children.length === 0) return null;
      return {
        type: "blockquote",
        attrs: { mdId: state.nextId(), mdPrefix: prefix, mdAlert: alert },
        content: children,
      };
    }
    case "hr":
      return { type: "horizontalRule", attrs: { mdId: state.nextId(), mdRaw: body } };
    case "table": {
      const table = token as Tokens.Table;
      const lines = body.split("\n");
      if (lines.length !== table.rows.length + 2) return null;
      const header = lines[0] ?? "";
      const leadPipe = header.trimStart().startsWith("|");
      const trailPipe = header.trimEnd().endsWith("|");
      const pipes = leadPipe && trailPipe ? "both" : leadPipe ? "lead" : trailPipe ? "trail" : "none";
      const aligns = table.align.map((align) => align ?? null);
      const cellJSON = (cell: Tokens.TableCell, isHeader: boolean, index: number): JSONContent => {
        const content = inlineJSON(cell.tokens, [], 0, state);
        return {
          type: isHeader ? "tableHeader" : "tableCell",
          attrs: { align: aligns[index] ?? null },
          content: [{ type: "paragraph", ...(content.length ? { content } : {}) }],
        };
      };
      const rowJSON = (cells: Tokens.TableCell[], isHeader: boolean, line: string): JSONContent => ({
        type: "tableRow",
        attrs: {
          mdRaw: restorePlaceholders(line, state.islands),
          mdCells: JSON.stringify(
            cells.map((cell) => restorePlaceholders(inlineRaw(cell.tokens), state.islands)),
          ),
        },
        content: cells.map((cell, index) => cellJSON(cell, isHeader, index)),
      });
      return {
        type: "table",
        attrs: {
          mdId: state.nextId(),
          mdDelim: restorePlaceholders(lines[1] ?? "", state.islands),
          mdAligns: JSON.stringify(aligns),
          mdPipes: pipes,
        },
        content: [
          rowJSON(table.header, true, header),
          ...table.rows.map((row, index) => rowJSON(row, false, lines[index + 2] ?? "")),
        ],
      };
    }
    default:
      return null;
  }
}

const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?=\n|$)/i;

/**
 * GFM alerts (`> [!NOTE]`): the marker line becomes the quote's `mdAlert` and
 * leaves the text, so the callout edits as prose and writes the marker back.
 */
function takeAlertMarker(children: JSONContent[]): string | null {
  const first = children[0];
  const text = first?.type === "paragraph" ? first.content?.[0] : undefined;
  if (!first || !text || text.type !== "text" || text.marks?.length) return null;
  const match = ALERT_MARKER.exec(text.text ?? "");
  if (!match) return null;
  const rest = (text.text ?? "").slice(match[0].length);
  if (rest === "") {
    first.content = first.content?.slice(1);
    if (!first.content?.length) children.shift();
  } else if (rest.startsWith("\n")) {
    text.text = rest.slice(1);
    if (!text.text) first.content = first.content?.slice(1);
  } else {
    return null;
  }
  return match[0];
}

function listItemJSON(item: Tokens.ListItem, state: ParseState): JSONContent | null {
  const head = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]*)/.exec(item.raw);
  if (!head) return null;
  const tokens = item.tokens.filter((token) => token.type !== "checkbox");
  const checkbox = item.tokens.find((token) => token.type === "checkbox");
  const children = childrenJSON(tokens, state);
  if (!children) return null;
  if (children.length === 0) children.push({ type: "paragraph", attrs: { mdId: state.nextId() } });
  if (children[0]?.type !== "paragraph") return null;
  const lines = splitTrail(item.raw).body.split("\n");
  const continuation = lines.slice(1).find((line) => line.trim() !== "");
  return {
    type: "listItem",
    attrs: {
      mdId: state.nextId(),
      mdLead: head[1] ?? "",
      mdMarker: head[2] ?? "-",
      mdAfter: head[3] ?? "",
      mdTask: checkbox ? checkbox.raw : null,
      mdIndent: continuation ? continuation.length - continuation.trimStart().length : null,
    },
    content: children,
  };
}

/** Nested children (inside a list item or a quote). Any unsupported token → null. */
function childrenJSON(tokens: readonly Token[], state: ParseState): JSONContent[] | null {
  const out: JSONContent[] = [];
  const ids: string[] = [];
  const trails: string[] = [];
  for (const token of tokens) {
    if (token.type === "space") {
      if (trails.length === 0) return null;
      trails[trails.length - 1] += token.raw;
      continue;
    }
    const json = blockJSON(token, state);
    if (!json) return null;
    out.push(json);
    ids.push(String(json.attrs?.mdId));
    trails.push(splitTrail(token.raw).trail);
  }
  ids.forEach((id, index) =>
    state.adjacency.set(id, { trail: trails[index] ?? "", next: ids[index + 1] ?? null }),
  );
  return out;
}

function lockedJSON(raw: string, reason: string, id: string): JSONContent {
  return { type: "sourceLocked", attrs: { raw, reason, mdId: id } };
}

/**
 * Parse one prose block. Every top-level construct is either rich text that
 * serializes back to its exact bytes, or a `sourceLocked` atom holding them.
 */
export function parseProseBlock(
  block: SourceBlock,
  schema: Schema,
  adjacency: Map<string, Adjacency>,
  nextId: () => string,
): ParsedProse {
  if (block.raw.includes("\r")) return { children: [], lockedReason: "Windows line endings" };
  if (hasPrivateUseCharacter(block.raw)) {
    return { children: [], lockedReason: "private-use characters" };
  }
  const { text, islands } = withPlaceholders(block);
  const { segments, lead } = splitAtBlankLines(text);
  if (lead) return { children: [], lockedReason: "leading blank lines" };
  if (segments.some((segment) => segment.text === "")) {
    return { children: [], lockedReason: "markdown the parser could not map" };
  }

  const state: ParseState = { schema, islands, adjacency, nextId };
  const children: ParsedChild[] = [];
  for (const segment of segments) {
    let tokens: Token[];
    try {
      tokens = new Lexer({ ...LEXER_OPTIONS }).lex(segment.text);
    } catch {
      return { children: [], lockedReason: "markdown the parser could not read" };
    }
    if (tokens.map((token) => token.raw).join("") !== segment.text) {
      return { children: [], lockedReason: "markdown the parser could not map" };
    }
    const segmentStart = children.length;
    for (const token of tokens) {
      if (token.type === "space") {
        const last = children[children.length - 1];
        if (!last || children.length === segmentStart) {
          return { children: [], lockedReason: "leading blank lines" };
        }
        last.trail += token.raw;
        continue;
      }
      children.push(parseTopToken(token, state));
    }
    const last = children[children.length - 1];
    if (!last || children.length === segmentStart) {
      return { children: [], lockedReason: "markdown the parser could not map" };
    }
    last.trail += segment.after;
  }
  children.forEach((child, index) =>
    adjacency.set(child.id, { trail: child.trail, next: children[index + 1]?.id ?? null }),
  );
  if (children.length === 0) return { children, lockedReason: "empty block" };
  if (children.every((child) => child.lockedReason !== null)) {
    return { children, lockedReason: children[0]?.lockedReason ?? "source" };
  }
  return { children, lockedReason: null };
}

/**
 * A whitespace-only line ends a paragraph like an empty one, but marked
 * rewrites its spaces in token `raw`, which would break the byte map. The
 * block is therefore lexed in runs of non-blank lines; the blank-ish lines
 * between runs are kept, byte for byte, as the preceding construct's trail.
 */
function splitAtBlankLines(text: string): {
  segments: Array<{ text: string; after: string }>;
  lead: string;
} {
  if (!/^[ \t]+$/m.test(text)) return { segments: [trimSegmentEnd(text, "")], lead: "" };
  const ranges: Array<{ start: number; end: number }> = [];
  let current: { start: number; end: number } | null = null;
  let position = 0;
  for (const line of text.split("\n")) {
    const lineEnd = position + line.length;
    if (/^[ \t]*$/.test(line)) {
      if (current) ranges.push(current);
      current = null;
    } else if (current) {
      current.end = lineEnd;
    } else {
      current = { start: position, end: lineEnd };
    }
    position = lineEnd + 1;
  }
  if (current) ranges.push(current);
  const segments = ranges.map((range, index) =>
    trimSegmentEnd(
      text.slice(range.start, range.end),
      text.slice(range.end, ranges[index + 1]?.start ?? text.length),
    ),
  );
  return { segments, lead: text.slice(0, ranges[0]?.start ?? text.length) };
}

/**
 * Trailing spaces at the very end of a run: marked rewrites them in a list's
 * `raw` (a space becomes a newline), so they are kept aside, byte for byte, as
 * the run's trailing bytes instead of being lexed.
 */
function trimSegmentEnd(text: string, after: string): { text: string; after: string } {
  const tail = /[ \t]+$/.exec(text)?.[0] ?? "";
  return tail ? { text: text.slice(0, text.length - tail.length), after: tail + after } : { text, after };
}

/** One top-level token → rich text that round-trips exactly, or a locked atom. */
function parseTopToken(token: Token, state: ParseState): ParsedChild {
  const { schema, islands, adjacency, nextId } = state;
  const { body, trail } = splitTrail(token.raw);
  const raw = restorePlaceholders(body, islands);
  const scratch = new Map(adjacency);
  const scratchState: ParseState = { ...state, adjacency: scratch };
  const pageBreak =
    (token.type === "paragraph" || token.type === "html") && isPageBreakLine(raw);
  let json = pageBreak ? null : blockJSON(token, scratchState);
  let lockedReason: string | null = pageBreak ? PAGE_BREAK_REASON : null;
  if (pageBreak) {
    // held as source: the page-break grammar belongs to @ai-matrx/print
  } else if (json) {
    try {
      const node = schema.nodeFromJSON(json);
      node.check();
      const written = serializeBlock(node, createSerializeContext(scratch));
      if (written !== raw) {
        json = null;
        lockedReason = "formatting the visual editor cannot keep byte-for-byte";
      }
    } catch {
      json = null;
      lockedReason = "structure the visual editor cannot hold";
    }
  } else {
    lockedReason =
      LOCK_REASONS[token.type] ?? "formatting the visual editor cannot keep byte-for-byte";
  }
  if (json) {
    for (const [key, value] of scratch) adjacency.set(key, value);
  } else {
    json = lockedJSON(raw, lockedReason ?? "source", nextId());
  }
  return { json, id: String(json.attrs?.mdId), raw, trail, lockedReason };
}
