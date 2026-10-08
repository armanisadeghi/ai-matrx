// lib/spaces-blocks/notion-markdown.ts — Notion-flavored Markdown → Space snapshot blocks.
//
// Reads both dialects a Notion import meets:
//  - Notion's enhanced Markdown (API / MCP fetch): tab-indented children, `{color="…" toggle="true"}`
//    block attributes, and tags — <details>/<summary>, <callout>, <columns>/<column>, <page>,
//    <database>, <table>/<tr>/<td>, <image>/<video>/<audio>/<file>/<pdf>, <embed>, <bookmark>,
//    <table_of_contents/>, <synced_block>, <synced_block_reference>, <empty-block/>, <unknown/>.
//  - Notion's Markdown export (zip): 4-space nested lists, <aside> callouts, GFM pipe tables, child
//    pages as `[Title](Title%20<id>.md)` and databases as `[Title](Title%20<id>.csv)`.
//
// The converter never fetches and never guesses ids: pages, people, files and databases resolve through
// `ctx`. Anything it cannot map becomes a `text` block that says what it was (nothing dropped
// silently), and every such case is also listed in `warnings`. Block ids are deterministic from
// `ctx.idSeed` + the block's position, so importing the same page twice yields the same snapshot (the
// save door then writes no new version).

import { decodeEntities, notionColor, parseAttrs, parseInline, spansText, type InlineContext } from "./notion-inline";
import type { RichSpan, SpaceBlock, SpaceColor, SpaceDataSource, SpaceMedia } from "./types";

export type NotionMediaKind = "image" | "video" | "audio" | "file" | "pdf";

export interface NotionMarkdownContext {
  /** Stable seed for block ids — use the page's external key (e.g. "notion:page/<id>"). */
  idSeed: string;
  /**
   * A Notion page reference (URL, id, or exported `.md` path) → our Space. `childOfThisPage: false`
   * turns a <page> tag into a link-to-page block instead of a sub-page block.
   */
  resolvePage?: (ref: string, title: string) => { spaceId: string; childOfThisPage?: boolean } | null | undefined;
  /** A Notion person (mention URL/id + shown name) → our user id. */
  resolvePerson?: (ref: string, name: string) => string | null | undefined;
  /** A Notion file / image URL → our file id (preferred) or a URL to keep. Null = not imported. */
  resolveFile?: (url: string, kind: NotionMediaKind) => { fileId: string } | { url: string } | null | undefined;
  /** A Notion database (URL, id or exported `.csv` path) → the store table (and view) it became. */
  resolveDatabase?: (ref: string, title: string) => { tableId: string; viewId?: string } | null | undefined;
  /** A Notion icon (emoji or URL) → a Lucide icon name; defaults to `emojiToIcon`. */
  resolveIcon?: (icon: string) => string | null | undefined;
}

export interface NotionMarkdownResult {
  blocks: SpaceBlock[];
  /** Everything not mapped one-to-one, in plain words (also visible in the page as text blocks). */
  warnings: string[];
}

// ------------------------------------------------------------------------------------------- ids

/** Four 32-bit FNV-1a lanes over the seed + path, shaped as a UUID (version nibble 8). Same input, same id. */
export function stableBlockId(seed: string, path: string): string {
  const input = `${seed}\u0000${path}`;
  const lanes = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    for (let l = 0; l < 4; l++) lanes[l] = Math.imul(lanes[l] ^ (c + l * 0x9e), 0x01000193) >>> 0;
  }
  // Mix each lane with its neighbours so short inputs still spread over all 128 bits.
  for (let r = 0; r < 2; r++) for (let l = 0; l < 4; l++) lanes[l] = Math.imul(lanes[l] ^ (lanes[(l + 1) % 4] >>> 15), 0x2c1b3c6d) >>> 0;
  const hex = lanes.map((n) => n.toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ------------------------------------------------------------------------------------- emoji map

const EMOJI_ICONS: Record<string, string> = {
  "💡": "Lightbulb",
  "⚠️": "TriangleAlert",
  "⚠": "TriangleAlert",
  "❗": "CircleAlert",
  "❗️": "CircleAlert",
  "🚨": "CircleAlert",
  "ℹ️": "Lightbulb",
  "✅": "BadgeCheck",
  "✔️": "BadgeCheck",
  "📌": "Pin",
  "📍": "Pin",
  "🔥": "Zap",
  "⚡": "Zap",
  "📝": "NotebookPen",
  "✍️": "PenLine",
  "🚀": "Rocket",
  "💰": "Wallet",
  "💵": "Wallet",
  "💸": "Wallet",
  "📅": "Calendar",
  "🗓️": "CalendarRange",
  "🎯": "Target",
  "⭐": "Star",
  "🌟": "Star",
  "🏆": "Trophy",
  "🥇": "Medal",
  "📊": "ChartColumn",
  "📈": "TrendingUp",
  "🧠": "Brain",
  "📣": "Megaphone",
  "📢": "Megaphone",
  "🎥": "Video",
  "📹": "Video",
  "🎬": "Clapperboard",
  "📸": "Camera",
  "📷": "Camera",
  "📞": "Phone",
  "☎️": "Phone",
  "👥": "Users",
  "👤": "UserRound",
  "🤝": "Handshake",
  "📚": "Library",
  "📖": "BookOpen",
  "🔑": "Key",
  "🔒": "Lock",
  "🔗": "Link",
  "🌍": "Globe",
  "🌎": "Globe",
  "✈️": "Plane",
  "🌴": "TreePalm",
  "🗺️": "Map",
  "📦": "Package",
  "🛒": "ShoppingCart",
  "⏰": "Clock",
  "⏳": "Hourglass",
  "📁": "Folder",
  "📂": "Folder",
  "📄": "FileText",
  "📃": "FileText",
  "🎁": "Gift",
  "❤️": "Heart",
  "🙂": "Smile",
  "😊": "Smile",
  "👋": "Smile",
  "🎉": "Star",
  "📬": "MailOpen",
  "✉️": "MailOpen",
  "🧰": "Wrench",
  "🔧": "Wrench",
  "⚙️": "Settings",
  "🛠️": "Hammer",
  "🏠": "House",
  "🏢": "Building2",
  "💼": "Briefcase",
  "🎓": "GraduationCap",
  "🎤": "Mic",
  "🎧": "Headphones",
  "💬": "MessageSquare",
  "🗣️": "Megaphone",
  "🧾": "Receipt",
  "🏷️": "Tag",
  "📋": "ClipboardList",
  "☑️": "ListChecks",
  "🔍": "SearchCheck",
  "🔎": "SearchCheck",
};

/** A Notion emoji → the closest icon in the Spaces icon set, or null when there is no good match. */
export function emojiToIcon(emoji: string): string | null {
  const trimmed = emoji.trim();
  return EMOJI_ICONS[trimmed] ?? EMOJI_ICONS[trimmed.replace(/️/g, "")] ?? null;
}

// --------------------------------------------------------------------------------------- lines

interface Line {
  col: number;
  text: string;
  raw: string;
}

function toLines(md: string): Line[] {
  return md
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((raw) => {
      let col = 0;
      let k = 0;
      for (; k < raw.length; k++) {
        if (raw[k] === "\t") col += 4;
        else if (raw[k] === " ") col += 1;
        else break;
      }
      return { col, text: raw.slice(k).replace(/\s+$/, ""), raw };
    });
}

/** Strip `col` columns of leading whitespace (code bodies keep their own deeper indentation). */
function dedent(raw: string, col: number): string {
  let seen = 0;
  let k = 0;
  while (k < raw.length && seen < col && (raw[k] === " " || raw[k] === "\t")) {
    seen += raw[k] === "\t" ? 4 : 1;
    k++;
  }
  return raw.slice(k);
}

/** Lines after `i` that belong to the block at `i`: deeper-indented, blank lines between them included. */
function childLines(lines: Line[], i: number): { kids: Line[]; next: number } {
  const col = lines[i].col;
  let j = i + 1;
  let lastKid = i;
  while (j < lines.length) {
    const l = lines[j];
    if (l.text === "") {
      j++;
      continue;
    }
    if (l.col > col) {
      lastKid = j;
      j++;
      continue;
    }
    break;
  }
  return { kids: lines.slice(i + 1, lastKid + 1), next: lastKid + 1 };
}

/** The line index of the `</name>` closing the tag opened at `i` (same-name nesting counted). */
function closingLine(lines: Line[], i: number, name: string): number {
  let depth = 0;
  const open = new RegExp(`^<${name}(\\s[^>]*)?>`, "i");
  const openAny = new RegExp(`<${name}(\\s[^>]*)?>`, "gi");
  const close = new RegExp(`</${name}>`, "gi");
  for (let j = i; j < lines.length; j++) {
    const t = lines[j].text;
    const opens = j === i ? 1 : open.test(t) ? (t.match(openAny) ?? []).filter((m) => !m.endsWith("/>")).length : 0;
    const closes = (t.match(close) ?? []).length;
    depth += opens - closes;
    if (depth <= 0) return j;
  }
  return lines.length; // unclosed: the region runs to the end
}

// ----------------------------------------------------------------------------------- the parser

const TRAILING_ATTRS = /\s*\{((?:\s*[\w-]+\s*=\s*"[^"]*")+)\s*\}\s*$/;

function splitAttrs(text: string): { body: string; attrs: Record<string, string> } {
  const m = TRAILING_ATTRS.exec(text);
  if (!m) return { body: text, attrs: {} };
  return { body: text.slice(0, m.index), attrs: parseAttrs(m[1]) };
}

class Converter {
  readonly warnings: string[] = [];
  private readonly inline: InlineContext;

  constructor(private readonly ctx: NotionMarkdownContext) {
    this.inline = {
      resolvePage: (ref) => {
        const hit = ctx.resolvePage?.(ref, "");
        return hit ? { spaceId: hit.spaceId } : null;
      },
      resolvePerson: ctx.resolvePerson,
      warn: (m) => this.warnings.push(m),
    };
  }

  private spans(text: string): RichSpan[] {
    return parseInline(text, this.inline);
  }

  private block(path: string, type: string, extra: Omit<SpaceBlock, "id" | "type"> = {}): SpaceBlock {
    const b: SpaceBlock = { id: stableBlockId(this.ctx.idSeed, path), type };
    if (extra.text !== undefined) b.text = extra.text;
    if (extra.color) b.color = extra.color;
    if (extra.background) b.background = extra.background;
    if (extra.props && Object.keys(extra.props).length) b.props = extra.props;
    if (extra.children?.length) b.children = extra.children;
    return b;
  }

  private colors(attrs: Record<string, string>): { color?: SpaceColor; background?: SpaceColor } {
    return notionColor(attrs.color);
  }

  /** A block the converter cannot map: a gray italic text block that names it, never a silent drop. */
  private unsupported(path: string, kind: string, source: string): SpaceBlock {
    const clipped = source.length > 2000 ? `${source.slice(0, 2000)}…` : source;
    this.warnings.push(`Notion ${kind} was not imported as a block; kept as a note: ${clipped.slice(0, 120)}`);
    return this.block(path, "text", {
      text: [{ text: `Not imported from Notion (${kind}): ${clipped.replace(/\s+/g, " ").slice(0, 300)}`, italic: true, color: "gray" }],
      props: { unsupported: { from: "notion", kind, source: clipped } },
    });
  }

  private icon(raw: string | undefined): string {
    if (!raw) return "";
    const named = this.ctx.resolveIcon?.(raw) ?? emojiToIcon(raw);
    if (named) return named;
    this.warnings.push(`callout icon "${raw}" has no matching Spaces icon; used Lightbulb`);
    return "Lightbulb";
  }

  private media(path: string, kind: NotionMediaKind, src: string, caption: string, attrs: Record<string, string>): SpaceBlock {
    const resolved = src ? this.ctx.resolveFile?.(src, kind) : null;
    if (!resolved) return this.unsupported(path, `${kind} (file not resolved)`, src || caption);
    const props: Record<string, unknown> = { ...resolved };
    const cap = caption.trim();
    if (cap) props.caption = this.spans(cap);
    if (attrs.name) props.name = attrs.name;
    return this.block(path, kind, { props, ...this.colors(attrs) });
  }

  private database(path: string, ref: string, title: string, inline: boolean): SpaceBlock {
    const hit = this.ctx.resolveDatabase?.(ref, title);
    if (!hit) return this.unsupported(path, "database (table not resolved)", `${title} ${ref}`.trim());
    const source: SpaceDataSource = hit.viewId ? { kind: "table", tableId: hit.tableId, viewId: hit.viewId } : { kind: "table", tableId: hit.tableId };
    return this.block(path, "database", { props: { source, inline, ...(title ? { title } : {}) } });
  }

  private pageBlock(path: string, ref: string, title: string, attrs: Record<string, string>, forceLink = false): SpaceBlock {
    const hit = this.ctx.resolvePage?.(ref, title);
    if (!hit) return this.unsupported(path, "page (not imported)", `${title} ${ref}`.trim());
    const type = forceLink || hit.childOfThisPage === false ? "linkToPage" : "page";
    return this.block(path, type, { props: { spaceId: hit.spaceId }, ...this.colors(attrs) });
  }

  /** Parse a run of lines into blocks. `path` prefixes every block id's position. */
  parse(lines: Line[], path: string): SpaceBlock[] {
    const out: SpaceBlock[] = [];
    const at = () => `${path}${out.length}`;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const t = line.text;
      if (t === "") {
        i++;
        continue;
      }

      // ---- fenced code
      const fence = /^(```+|~~~+)\s*([^\s`]*)\s*$/.exec(t);
      if (fence) {
        const body: string[] = [];
        let j = i + 1;
        while (j < lines.length && !lines[j].text.startsWith(fence[1])) body.push(dedent(lines[j].raw, line.col)), j++;
        const language = fence[2] || "text";
        out.push(this.block(at(), "code", { text: [{ text: body.join("\n") }], props: { language } }));
        i = j + 1;
        continue;
      }

      // ---- block equation
      if (t.startsWith("$$")) {
        const oneLine = /^\$\$(.+)\$\$$/.exec(t);
        if (oneLine) {
          out.push(this.block(at(), "equation", { props: { expression: oneLine[1].trim() } }));
          i++;
          continue;
        }
        const body: string[] = [];
        let j = i + 1;
        while (j < lines.length && !lines[j].text.startsWith("$$")) body.push(lines[j].text), j++;
        out.push(this.block(at(), "equation", { props: { expression: body.join("\n").trim() } }));
        i = j + 1;
        continue;
      }

      // ---- tags
      const tag = /^<([a-zA-Z][\w-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>(.*)$/.exec(t);
      if (tag) {
        const name = tag[1].toLowerCase();
        const attrs = parseAttrs(tag[2]);
        const selfClose = tag[3] === "/";
        const rest = tag[4];
        const handled = this.tagBlock(lines, i, name, attrs, selfClose, rest, at(), path, out);
        if (handled !== null) {
          i = handled;
          continue;
        }
      }

      // ---- GFM pipe table (export)
      if (t.startsWith("|") && lines[i + 1]?.text.match(/^\|?\s*:?-{3,}/)) {
        const rows: string[] = [];
        let j = i;
        while (j < lines.length && lines[j].text.startsWith("|")) rows.push(lines[j].text), j++;
        const cells = rows
          .filter((_, n) => n !== 1)
          .map((r) =>
            r
              .replace(/^\|/, "")
              .replace(/\|$/, "")
              .split(/(?<!\\)\|/)
              .map((c) => this.spans(c.trim().replace(/\\\|/g, "|"))),
          );
        out.push(this.block(at(), "table", { props: { headerRow: true, headerColumn: false, rows: cells.map((c) => ({ cells: c })) } }));
        i = j;
        continue;
      }

      const { body, attrs } = splitAttrs(t);
      const colors = this.colors(attrs);

      // ---- divider
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(body)) {
        out.push(this.block(at(), "divider"));
        i++;
        continue;
      }

      // ---- headings (incl. toggle headings: {toggle="true"} or the older "▶#")
      const heading = /^(▶\s*)?(#{1,6})\s+(.*)$/.exec(body);
      if (heading) {
        const level = Math.min(4, heading[2].length);
        const toggleable = Boolean(heading[1]) || attrs.toggle === "true";
        const { kids, next } = childLines(lines, i);
        const p = at();
        const children = this.parse(kids, `${p}.`);
        if (children.length && !toggleable) {
          out.push(this.block(p, "heading", { text: this.spans(heading[3]), props: { level }, ...colors }));
          out.push(...children);
        } else {
          out.push(this.block(p, "heading", { text: this.spans(heading[3]), props: toggleable ? { level, toggleable: true } : { level }, children, ...colors }));
        }
        i = next;
        continue;
      }

      // ---- to-do
      const todo = /^[-*+]\s+\[( |x|X)\]\s?(.*)$/.exec(body);
      if (todo) {
        const { kids, next } = childLines(lines, i);
        const p = at();
        out.push(this.block(p, "todo", { text: this.spans(todo[2]), props: { checked: todo[1] !== " " }, children: this.parse(kids, `${p}.`), ...colors }));
        i = next;
        continue;
      }

      // ---- bulleted / numbered
      const bullet = /^[-*+]\s+(.*)$/.exec(body);
      const numbered = /^\d+[.)]\s+(.*)$/.exec(body);
      if (bullet || numbered) {
        const { kids, next } = childLines(lines, i);
        const p = at();
        const text = (bullet ?? numbered)![1];
        // Export: a child page listed as a bullet stays a bullet with a page mention-style link.
        out.push(this.block(p, bullet ? "bulleted" : "numbered", { text: this.spans(text), children: this.parse(kids, `${p}.`), ...colors }));
        i = next;
        continue;
      }

      // ---- toggle (older enhanced markdown: "▶ text")
      const tri = /^▶\s*(.*)$/.exec(body);
      if (tri) {
        const { kids, next } = childLines(lines, i);
        const p = at();
        out.push(this.block(p, "toggle", { text: this.spans(tri[1]), children: this.parse(kids, `${p}.`), ...colors }));
        i = next;
        continue;
      }

      // ---- quote (consecutive ">" lines are one quote; "<br>" is a line break)
      if (/^>\s?/.test(body)) {
        const parts = [body.replace(/^>\s?/, "")];
        let j = i + 1;
        while (j < lines.length && lines[j].col === line.col && /^>\s?/.test(lines[j].text)) parts.push(splitAttrs(lines[j].text).body.replace(/^>\s?/, "")), j++;
        const p = at();
        const { kids, next } = childLines(lines, j - 1);
        out.push(this.block(p, "quote", { text: this.spans(parts.join("<br>")), children: this.parse(kids, `${p}.`), ...colors }));
        i = Math.max(next, j);
        continue;
      }

      // ---- image ![caption](url)
      const img = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(body);
      if (img) {
        out.push(this.media(at(), "image", img[2], img[1], attrs));
        i++;
        continue;
      }

      // ---- export: a lone link to a child page (.md) or database (.csv)
      const lone = /^\[([^\]]+)\]\(([^)]+\.(md|csv))\)$/i.exec(body);
      if (lone) {
        const ref = safeDecode(lone[2]);
        out.push(lone[3].toLowerCase() === "csv" ? this.database(at(), ref, lone[1], false) : this.pageBlock(at(), ref, lone[1], attrs));
        i++;
        continue;
      }

      // ---- paragraph (each line is one block in Notion's dialect)
      const { kids, next } = childLines(lines, i);
      const p = at();
      out.push(this.block(p, "text", { text: this.spans(body), children: this.parse(kids, `${p}.`), ...colors }));
      i = next;
    }
    return out;
  }

  /** Handles a block-level tag at line i; returns the next line index, or null when it is not a block tag. */
  private tagBlock(
    lines: Line[],
    i: number,
    name: string,
    attrs: Record<string, string>,
    selfClose: boolean,
    rest: string,
    p: string,
    path: string,
    out: SpaceBlock[],
  ): number | null {
    const sameLine = (tagName: string): string | null => {
      const end = rest.toLowerCase().lastIndexOf(`</${tagName}>`);
      return end >= 0 ? rest.slice(0, end) : null;
    };
    /** Inner lines of a multi-line tag region, and the line after its closer. */
    const region = (tagName: string): { inner: Line[]; next: number } => {
      const end = closingLine(lines, i, tagName);
      const inner = lines.slice(i + 1, end);
      const closeAt = rest.toLowerCase().indexOf(`</${tagName}>`);
      const head = (closeAt >= 0 ? rest.slice(0, closeAt) : rest).trim();
      if (head) inner.unshift({ col: lines[i].col + 4, text: head, raw: head });
      return { inner, next: end + 1 };
    };
    const colors = this.colors(attrs);

    switch (name) {
      case "empty-block":
        out.push(this.block(p, "text", { text: [] }));
        return i + 1;
      case "table_of_contents":
      case "table-of-contents":
        out.push(this.block(p, "tableOfContents", colors));
        return i + 1;
      case "breadcrumb":
        out.push(this.block(p, "breadcrumb"));
        return i + 1;
      case "unknown":
        out.push(this.unsupported(p, attrs.alt || "unknown block", attrs.url ?? lines[i].text));
        return i + 1;
      case "page": {
        const title = decodeEntities(sameLine("page") ?? rest).trim();
        out.push(this.pageBlock(p, attrs.url ?? attrs.id ?? "", title, attrs));
        return i + 1;
      }
      case "database":
      case "data-source": {
        const title = decodeEntities(sameLine(name) ?? rest).trim();
        out.push(this.database(p, attrs.url ?? attrs.id ?? "", title, attrs.inline === "true"));
        return i + 1;
      }
      case "image":
      case "video":
      case "audio":
      case "file":
      case "pdf": {
        const caption = selfClose ? "" : (sameLine(name) ?? rest);
        out.push(this.media(p, name, attrs.source ?? attrs.src ?? attrs.url ?? "", caption, attrs));
        return i + 1;
      }
      case "bookmark":
      case "embed": {
        const url = attrs.url ?? attrs.source ?? attrs.src ?? "";
        if (!url) {
          out.push(this.unsupported(p, `${name} without a URL`, lines[i].text));
          return i + 1;
        }
        const caption = selfClose ? "" : (sameLine(name) ?? rest).trim();
        out.push(this.block(p, name, { props: caption ? { url, caption: this.spans(caption) } : { url } }));
        return i + 1;
      }
      case "details": {
        const { inner, next } = region("details");
        const sumIdx = inner.findIndex((l) => /^<summary>/i.test(l.text));
        let summary = "";
        let body = inner;
        if (sumIdx >= 0) {
          const s = inner[sumIdx].text;
          const close = s.toLowerCase().indexOf("</summary>");
          summary = close >= 0 ? s.slice("<summary>".length, close) : s.slice("<summary>".length);
          body = inner.slice(sumIdx + 1);
        }
        const { body: sumText, attrs: sumAttrs } = splitAttrs(summary);
        const heading = /^(#{1,6})\s+(.*)$/.exec(sumText.trim());
        const children = this.parse(body, `${p}.`);
        const allColors = { ...colors, ...this.colors(sumAttrs) };
        out.push(
          heading
            ? this.block(p, "heading", { text: this.spans(heading[2]), props: { level: Math.min(4, heading[1].length), toggleable: true }, children, ...allColors })
            : this.block(p, "toggle", { text: this.spans(sumText.trim()), children, ...allColors }),
        );
        return next;
      }
      case "callout":
      case "aside": {
        const { inner, next } = region(name);
        let icon = attrs.icon;
        let kids = inner;
        const first = kids.find((l) => l.text !== "");
        // Export <aside>: the first line starts with the emoji icon.
        if (name === "aside" && first) {
          const m = /^(\p{Extended_Pictographic}️?)\s*(.*)$/u.exec(first.text);
          if (m) {
            icon = m[1];
            const iconLine = first;
            kids = kids.map((l) => (l === iconLine ? { ...l, text: m[2] } : l));
          }
        }
        let children = this.parse(kids, `${p}.`);
        let text: RichSpan[] = [];
        if (children[0]?.type === "text" && !children[0].children?.length) {
          text = children[0].text ?? [];
          children = children.slice(1);
        }
        const bg = colors.background ?? (colors.color ? undefined : "gray");
        out.push(this.block(p, "callout", { text, props: { icon: this.icon(icon) }, children, background: bg, color: colors.color }));
        return next;
      }
      case "columns": {
        const { inner, next } = region("columns");
        const cols: SpaceBlock[] = [];
        let j = 0;
        while (j < inner.length) {
          const l = inner[j];
          const m = /^<column((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*>/i.exec(l.text);
          if (!m) {
            j++;
            continue;
          }
          const end = closingLine(inner, j, "column");
          const cp = `${p}.${cols.length}`;
          const width = Number(parseAttrs(m[1]).width);
          cols.push(this.block(cp, "column", { props: { width: Number.isFinite(width) && width > 0 ? width : 0 }, children: this.parse(inner.slice(j + 1, end), `${cp}.`) }));
          j = end + 1;
        }
        if (cols.length < 2) {
          // One column is just its content.
          out.push(...cols.flatMap((c) => c.children ?? []));
          return next;
        }
        for (const c of cols) if (!(c.props?.width as number)) c.props = { width: 1 / cols.length };
        out.push(this.block(p, "columnList", { children: cols }));
        return next;
      }
      case "table": {
        const { inner, next } = region("table");
        const rows: Array<{ cells: RichSpan[][] }> = [];
        let current: RichSpan[][] | null = null;
        const joined = inner.map((l) => l.text).join("\n");
        for (const tr of joined.matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi)) {
          current = [];
          for (const td of tr[1].matchAll(/<t[dh](?:\s[^>]*)?>([\s\S]*?)<\/t[dh]>/gi)) current.push(this.spans(td[1].trim().replace(/\n\s*/g, "<br>")));
          rows.push({ cells: current });
        }
        if (!rows.length) {
          out.push(this.unsupported(p, "table without rows", joined));
          return next;
        }
        out.push(this.block(p, "table", { props: { headerRow: attrs["header-row"] === "true", headerColumn: attrs["header-column"] === "true", rows } }));
        return next;
      }
      case "synced_block":
      case "synced_block_reference":
      case "synced-block":
      case "synced-block-reference": {
        // Synced blocks land as plain copies of their content (PARITY C18 is phase 3).
        const { inner, next } = region(name);
        const copied = this.parse(inner, `${p}.`);
        if (copied.length) this.warnings.push(`synced block (${attrs.url ?? "no url"}) imported as a plain copy of ${copied.length} block(s)`);
        out.push(...copied);
        return next;
      }
      case "meeting-notes":
      case "transcription":
      case "ai-block":
      case "button":
      case "template": {
        const end = selfClose ? i : closingLine(lines, i, name);
        out.push(this.unsupported(p, name, lines.slice(i, end + 1).map((l) => l.text).join("\n")));
        return end + 1;
      }
      default:
        return null; // an inline tag at line start (span, mention-…): a paragraph
    }
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Notion-flavored Markdown → Space blocks. Never fetches; unknown constructs become labelled text blocks. */
export function notionMarkdownToBlocks(md: string, ctx: NotionMarkdownContext): NotionMarkdownResult {
  const conv = new Converter(ctx);
  const blocks = conv.parse(toLines(md), "");
  return { blocks, warnings: conv.warnings };
}

/** A page's icon/cover from Notion (emoji or file URL) → SpaceMedia, through the same context. */
export function notionMediaToSpace(raw: string | null | undefined, ctx: NotionMarkdownContext, kind: "icon" | "cover"): SpaceMedia | null {
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) {
    const hit = ctx.resolveFile?.(raw, "image");
    return hit ?? { url: raw };
  }
  if (kind === "icon") {
    const named = ctx.resolveIcon?.(raw) ?? emojiToIcon(raw);
    return named ? { icon: named } : null;
  }
  return null;
}

export { spansText };
