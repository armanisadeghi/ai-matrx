// lib/spaces-blocks/notion-inline.ts — Notion-flavored Markdown rich text → RichSpan[].
//
// Covers what Notion writes inside a block: **bold**, *italic* / _italic_, ~~strike~~, `code`,
// $inline equation$, [link](url), <span underline="true" color="red_bg">…</span>, <u>/<b>/<i>/<s>,
// <br>, backslash escapes, and the mentions <mention-page>, <mention-user>, <mention-database>,
// <mention-date start end/>. The converter never fetches: mentions resolve through the context.

import type { RichSpan, SpaceColor } from "./types";

const COLORS = new Set(["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]);

/** Notion color word → { color } or { background }. Accepts red, red_bg, red_background, default. */
export function notionColor(raw: string | undefined | null): { color?: SpaceColor; background?: SpaceColor } {
  if (!raw) return {};
  const word = raw.trim().toLowerCase();
  const bg = /_(bg|background)$/.test(word);
  const base = word.replace(/_(bg|background)$/, "");
  if (!COLORS.has(base)) return {};
  return bg ? { background: base as SpaceColor } : { color: base as SpaceColor };
}

export interface InlineContext {
  /** Notion page URL or id → our Space id, or null when that page was not imported. */
  resolvePage?: (ref: string) => { spaceId: string } | null | undefined;
  /** Notion user URL/id + shown name → our user id, or null. */
  resolvePerson?: (ref: string, name: string) => string | null | undefined;
  warn: (message: string) => void;
}

type Marks = Omit<RichSpan, "text">;

/** Attributes of an HTML-ish tag: name="value" pairs. */
export function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = decodeEntities(m[2]);
  return out;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

const sameMarks = (a: RichSpan, b: RichSpan) => {
  const { text: _a, ...ma } = a;
  const { text: _b, ...mb } = b;
  return JSON.stringify(ma) === JSON.stringify(mb);
};

function push(out: RichSpan[], text: string, marks: Marks) {
  if (!text) return;
  const span: RichSpan = { text, ...marks };
  const last = out.at(-1);
  if (last && !last.mention && !last.equation && !span.mention && !span.equation && sameMarks(last, span)) last.text += text;
  else out.push(span);
}

/** Index of the closing `delim` after `from`, skipping backslash escapes; -1 when absent. */
function findClose(src: string, delim: string, from: number): number {
  for (let j = from; j <= src.length - delim.length; j++) {
    if (src[j] === "\\") {
      j++;
      continue;
    }
    if (src.startsWith(delim, j)) {
      // A single * must not close on the first half of **.
      if (delim === "*" && src[j + 1] === "*") {
        j++;
        continue;
      }
      return j;
    }
  }
  return -1;
}

/** Index of the `</name>` closing the tag that opened before `from`, counting nested same-name tags. */
function findCloseTag(src: string, name: string, from: number): number {
  let depth = 1;
  const re = new RegExp(`<(/?)${name}(?:\\s[^>]*)?>`, "g");
  re.lastIndex = from;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[0].endsWith("/>")) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index;
  }
  return -1;
}

const SIMPLE_TAGS: Record<string, Marks> = {
  b: { bold: true },
  strong: { bold: true },
  i: { italic: true },
  em: { italic: true },
  u: { underline: true },
  s: { strike: true },
  del: { strike: true },
  code: { code: true },
};

function walk(src: string, marks: Marks, ctx: InlineContext, out: RichSpan[]) {
  let buf = "";
  const flush = () => {
    push(out, buf, marks);
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\" && i + 1 < src.length) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i) {
        flush();
        push(out, src.slice(i + 1, end), { ...marks, code: true });
        i = end + 1;
        continue;
      }
    }
    if (ch === "$" && src[i + 1] !== "$" && src[i + 1] !== " ") {
      const end = findClose(src, "$", i + 1);
      if (end > i + 1 && src[end - 1] !== " ") {
        flush();
        let expr = src.slice(i + 1, end);
        // Notion wraps some inline equations as $`expr`$.
        if (expr.startsWith("`") && expr.endsWith("`") && expr.length > 1) expr = expr.slice(1, -1);
        out.push({ text: expr, ...marks, equation: expr });
        i = end + 1;
        continue;
      }
    }
    for (const [delim, mark] of [
      ["**", { bold: true }],
      ["~~", { strike: true }],
      ["__", { bold: true }],
    ] as const) {
      if (src.startsWith(delim, i)) {
        const end = findClose(src, delim, i + 2);
        if (end > i + 2) {
          flush();
          walk(src.slice(i + 2, end), { ...marks, ...mark }, ctx, out);
          i = end + 2;
          break;
        }
      }
    }
    if (i < src.length && src[i] !== ch) continue; // a delimiter above consumed text
    if ((ch === "*" || (ch === "_" && !/\w/.test(src[i - 1] ?? ""))) && src[i + 1] !== " " && src[i + 1] !== ch) {
      const end = findClose(src, ch, i + 1);
      if (end > i + 1 && (ch === "*" || !/\w/.test(src[end + 1] ?? ""))) {
        flush();
        walk(src.slice(i + 1, end), { ...marks, italic: true }, ctx, out);
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const mid = src.indexOf("](", i + 1);
      const close = mid > 0 ? src.indexOf(")", mid + 2) : -1;
      // Citations [^url] are dropped into a plain link.
      if (mid > i && close > mid) {
        flush();
        const href = src.slice(mid + 2, close).trim();
        walk(src.slice(i + 1, mid), href ? { ...marks, link: href } : marks, ctx, out);
        i = close + 1;
        continue;
      }
    }
    if (ch === "<") {
      const tag = /^<([a-zA-Z][\w-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/.exec(src.slice(i));
      if (tag) {
        const [whole, rawName, rawAttrs, selfClose] = tag;
        const name = rawName.toLowerCase();
        const attrs = parseAttrs(rawAttrs);
        const after = i + whole.length;
        if (name === "br") {
          buf += "\n";
          i = after;
          continue;
        }
        if (name === "mention-date") {
          flush();
          const start = attrs.start ?? attrs.date ?? "";
          let inner = "";
          let next = after;
          if (!selfClose) {
            const end = findCloseTag(src, name, after);
            if (end >= 0) {
              inner = src.slice(after, end);
              next = end + `</${rawName}>`.length;
            }
          }
          const shown = inner || (attrs.end ? `${start} → ${attrs.end}` : start);
          if (start) out.push({ text: shown, ...marks, mention: { kind: "date", iso: start } });
          else push(out, shown, marks);
          i = next;
          continue;
        }
        if (!selfClose) {
          const end = findCloseTag(src, rawName, after);
          if (end >= 0) {
            const inner = src.slice(after, end);
            const next = end + `</${rawName}>`.length;
            const plain = () => {
              const tmp: RichSpan[] = [];
              walk(inner, {}, ctx, tmp);
              return tmp.map((s) => s.text).join("");
            };
            if (name === "span") {
              flush();
              const m: Marks = { ...marks, ...notionColor(attrs.color) };
              if (attrs.underline === "true") m.underline = true;
              walk(inner, m, ctx, out);
              i = next;
              continue;
            }
            if (SIMPLE_TAGS[name]) {
              flush();
              walk(inner, { ...marks, ...SIMPLE_TAGS[name] }, ctx, out);
              i = next;
              continue;
            }
            if (name === "a" && attrs.href) {
              flush();
              walk(inner, { ...marks, link: attrs.href }, ctx, out);
              i = next;
              continue;
            }
            if (name === "mention-page") {
              flush();
              const title = plain() || "Untitled";
              const hit = attrs.url ? ctx.resolvePage?.(attrs.url) : null;
              if (hit?.spaceId) out.push({ text: title, ...marks, mention: { kind: "space", spaceId: hit.spaceId } });
              else {
                ctx.warn(`page mention "${title}" (${attrs.url ?? "no url"}) points at a page that was not imported; kept as a link`);
                push(out, title, attrs.url ? { ...marks, link: attrs.url } : marks);
              }
              i = next;
              continue;
            }
            if (name === "mention-user") {
              flush();
              const shown = plain() || "someone";
              const userId = ctx.resolvePerson?.(attrs.url ?? "", shown);
              if (userId) out.push({ text: shown, ...marks, mention: { kind: "person", userId } });
              else {
                ctx.warn(`person mention "${shown}" has no AI Matrx user; kept as text`);
                push(out, `@${shown}`, marks);
              }
              i = next;
              continue;
            }
            if (name === "mention-database" || name === "mention-data-source") {
              flush();
              const shown = plain() || "Database";
              ctx.warn(`database mention "${shown}" kept as a link (no inline database mention yet)`);
              push(out, shown, attrs.url ? { ...marks, link: attrs.url } : marks);
              i = next;
              continue;
            }
          }
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
}

/** Notion rich text → spans. Adjacent runs with the same marks merge. */
export function parseInline(src: string, ctx: InlineContext, marks: Marks = {}): RichSpan[] {
  const out: RichSpan[] = [];
  walk(src, marks, ctx, out);
  return out;
}

export function spansText(spans: RichSpan[] | undefined): string {
  return (spans ?? []).map((s) => s.text).join("");
}
