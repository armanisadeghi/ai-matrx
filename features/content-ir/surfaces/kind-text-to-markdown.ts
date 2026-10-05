/**
 * Answer TEXT → the readable markdown a person meant, for DISPLAY and EXPORT
 * destinations only (a note, a task, a file, a print, a clipboard copy, the
 * speaker, a plain-text slot). Rule (Arman, 2026-09-30): a kind is never shown
 * as raw JSON — every `{"__kind":…}` region in the text (bare, or the whole
 * body of a ```json / unlabelled fence) becomes that kind's markdown through
 * the ONE kind → markdown converter (`kindValueToMarkdown`: the registry's
 * `toMarkdown` facet, else `genericKindMarkdown`).
 *
 * 🚨 Never call this on data that is STORED or PASSED to a machine: `__kind`
 * is part of the data. This is a destination transform, the same as
 * `unwrapKindEnvelopes`. Kindless text returns byte for byte.
 *
 * Regions come from the one embedded-kind region finder
 * (`findEmbeddedKindJsonRegions`); the signal is the one detector
 * (`hasKindKey`). Nobody writes a second one.
 */

import { findCodeRanges, fenceParts } from "@ai-matrx/content-ir/source";
import { kindValueToMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";
import { humanizeKind, plainValueMarkdown } from "@/features/content-ir/kinds/kind-markdown-utils";
import {
  findBrokenKindJsonRegions,
  findKindCarryingJsonValues,
  frontMatterEnd,
} from "./embedded-kind-json";
import { firstKindSlug, hasKindKey, isKindJsonText, valueCarriesKind } from "./json-kind-signal";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKindObject(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.__kind === "string" &&
    value.__kind.trim().length > 0
  );
}

/**
 * The one-line broken state of a kind that never completed (≤60 chars) — the
 * SAME words the compact preview shows (`AnswerTextPreview`), so an export of
 * a cut-off answer says what the screen said.
 */
export function unfinishedKindLabel(kind: string | null): string {
  return kind ? `${humanizeKind(kind)} did not finish` : "Result did not finish";
}

/** The one-line note for structured output whose `__kind` cannot name a kind. */
export const UNREADABLE_KIND_NOTE = "Structured output could not be read";

/** A slug the kind loader may name: letters, digits and `_.:-` only. */
const KIND_SLUG_TEXT = /^[A-Za-z0-9_.:-]+$/;

/** Does this parsed value hold an object whose `__kind` is not a readable slug, at any depth? */
function carriesBrokenKind(value: unknown, depth = 0): boolean {
  if (depth > 64 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => carriesBrokenKind(item, depth + 1));
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, "__kind")) {
    const kind = record.__kind;
    if (typeof kind !== "string" || !KIND_SLUG_TEXT.test(kind)) return true;
  }
  return Object.values(record).some((item) => carriesBrokenKind(item, depth + 1));
}

/** The end (exclusive) of the string-aware balanced JSON value opening at `start`, or null. */
function balancedEnd(text: string, start: number): number | null {
  const stack: string[] = [];
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) return null;
      if (stack.length === 0) return i + 1;
    }
  }
  return null;
}

/** Ranges whose text is quoted SOURCE (inline code, non-JSON fences) — never converted. */
function quotedCodeRanges(text: string): Array<[number, number]> {
  return findCodeRanges(text)
    .filter((range) => {
      if (range.kind !== "fence") return true;
      const parts = fenceParts(text.slice(range.start, range.end));
      return !parts || !JSON_FENCE_LANGS.has(parts.opener.lang.toLowerCase());
    })
    .map((range): [number, number] => [range.start, range.end]);
}

/**
 * Complete JSON values holding a `__kind` that cannot name a kind (a number,
 * null, empty, a non-slug) — broken structured output — become the one-line
 * unreadable note. A JSON fence that held only such a value goes with it.
 */
function noteUnreadableKinds(text: string): string {
  if (!hasKindKey(text)) return text;
  const quoted = quotedCodeRanges(text);
  const fences = findCodeRanges(text).filter((range) => range.kind === "fence");
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") continue;
    const range = quoted.find(([a, b]) => i >= a && i < b);
    if (range) {
      i = range[1] - 1;
      continue;
    }
    const end = balancedEnd(text, i);
    if (end === null) continue;
    let value: unknown;
    try {
      value = JSON.parse(text.slice(i, end));
    } catch {
      continue;
    }
    if (carriesBrokenKind(value)) spans.push([i, end]);
    i = end - 1;
  }
  let out = text;
  for (let k = spans.length - 1; k >= 0; k--) {
    let [start, end] = spans[k]!;
    const fence = fences.find((range) => start >= range.start && end <= range.end);
    if (fence) {
      const parts = fenceParts(text.slice(fence.start, fence.end));
      const inner = parts
        ? text
            .slice(fence.start, fence.end)
            .split("\n")
            .slice(1, parts.closed ? -1 : undefined)
            .join("\n")
            .trim()
        : "";
      if (parts && inner === text.slice(start, end).trim()) {
        start = fence.start;
        end = fence.end;
      }
    }
    out = closeBefore(out.slice(0, start)) + UNREADABLE_KIND_NOTE + openAfter(out.slice(end));
  }
  return out;
}

/** A string field whose text is kind JSON → its parsed value (so it converts too). */
function liftKindStrings(value: unknown, depth = 0): unknown {
  if (depth > 64) return value;
  if (typeof value === "string") {
    if (!isKindJsonText(value)) return value;
    try {
      const parsed: unknown = JSON.parse(value);
      return valueCarriesKind(parsed) ? parsed : value;
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map((item) => liftKindStrings(item, depth + 1));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = liftKindStrings(item, depth + 1);
    return out;
  }
  return value;
}

/**
 * Any parsed value that carries a kind → markdown: a kind through the ONE
 * converter (`kindValueToMarkdown`), a list element by element (runs of plain
 * values as readable markdown beside the kinds), a kindless wrapper as its
 * data in markdown with its kinds converted in place.
 */
function valueMarkdown(raw: unknown): string {
  const value = liftKindStrings(raw);
  const nested = (child: Record<string, unknown>) => kindValueToMarkdown(child);
  if (isKindObject(value)) return kindValueToMarkdown(value);
  if (Array.isArray(value)) {
    const blocks: string[] = [];
    let run: unknown[] = [];
    const flush = () => {
      if (run.length) blocks.push(plainValueMarkdown(run, nested));
      run = [];
    };
    for (const item of value) {
      if (isKindObject(item)) {
        flush();
        blocks.push(kindValueToMarkdown(item));
      } else if (Array.isArray(item) || isRecord(item)) {
        if (valueCarriesKind(item)) {
          flush();
          blocks.push(valueMarkdown(item));
        } else run.push(item);
      } else run.push(item);
    }
    flush();
    return blocks.filter((block) => block.trim()).join("\n\n");
  }
  return plainValueMarkdown(value, nested);
}

/** JSON text that parses to a value carrying a kind → markdown; else null. */
function jsonKindValueMarkdown(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  return valueCarriesKind(parsed) ? valueMarkdown(parsed) : null;
}

/** Text before a block: the block starts on its own line, after a blank line. */
function closeBefore(text: string): string {
  const out = text.replace(/[ \t\r]+$/, "");
  if (!out) return out;
  if (out.endsWith("\n\n")) return out;
  return out.endsWith("\n") ? `${out}\n` : `${out}\n\n`;
}

/** Text after a block: whatever follows starts after a blank line. */
function openAfter(text: string): string {
  const out = text.replace(/^[ \t\r]+/, "");
  if (!out) return out;
  if (out.startsWith("\n\n") || out.startsWith("\r\n\r\n")) return out;
  if (out.startsWith("\n")) return `\n${out}`;
  return `\n\n${out}`;
}

interface ConvertOptions {
  /** A kind that can never complete → its one-line note (exports), or left for the caller (previews). */
  broken: "note" | "keep";
}

/**
 * Every kind region in `text` → markdown: complete kind-carrying JSON values
 * (THE region finder, widened to their outermost JSON value) and — when
 * `broken: "note"` — broken/cut-off kinds as their one-line note. `leftover`
 * reshapes the text between regions (identity for prose). Null when the text
 * holds no region.
 */
function convertRegions(
  text: string,
  excludeLiteralContexts: boolean,
  options: ConvertOptions,
  leftover: (piece: string) => string = (piece) => piece,
): string | null {
  type Span = { start: number; end: number; md: string };
  const spans: Span[] = findKindCarryingJsonValues(text, { excludeLiteralContexts }).map(
    (region) => ({ start: region.start, end: region.end, md: valueMarkdown(region.value) }),
  );
  if (options.broken === "note") {
    for (const region of findBrokenKindJsonRegions(text, { excludeLiteralContexts })) {
      spans.push({
        start: region.start,
        end: region.end,
        md: unfinishedKindLabel(firstKindSlug(region.content)),
      });
    }
  }
  if (spans.length === 0) return null;
  spans.sort((a, b) => a.start - b.start);

  let out = "";
  let cursor = 0;
  let afterBlock = false;
  for (const span of spans) {
    if (span.start < cursor) continue; // inside a span already taken
    const between = leftover(text.slice(cursor, span.start));
    out += afterBlock ? openAfter(between) : between;
    out = closeBefore(out) + span.md;
    cursor = span.end;
    afterBlock = true;
  }
  const tail = leftover(text.slice(cursor));
  out += afterBlock ? openAfter(tail) : tail;
  return out;
}

/** Fence languages whose body is a JSON region (an unlabelled fence included). */
const JSON_FENCE_LANGS = new Set(["", "json", "jsonc", "json5"]);

/** Blockquote markers that open a line (`> `, `>> `, `> > `). */
const QUOTE_PREFIX = /^(?: {0,3}> ?)*/;

/**
 * A json / jsonc / json5 / unlabelled fence (THE code-range rule, CRLF and
 * blockquote-safe) holding kind regions → its markdown, quoted again when the
 * fence sat in a blockquote. Fences of any other language, and inline code
 * spans, are quoted SOURCE and stay as written (owner ruling, 2026-09-30).
 */
function convertKindFences(text: string, options: ConvertOptions): string {
  const fences = findCodeRanges(text).filter((range) => range.kind === "fence");
  let out = text;
  for (let i = fences.length - 1; i >= 0; i--) {
    const range = fences[i]!;
    const raw = text.slice(range.start, range.end);
    if (!hasKindKey(raw)) continue;
    const parts = fenceParts(raw);
    if (!parts || !JSON_FENCE_LANGS.has(parts.opener.lang.toLowerCase())) continue;

    const lines = raw.split("\n").map((line) => line.replace(/\r$/, ""));
    const prefix = QUOTE_PREFIX.exec(lines[0] ?? "")?.[0] ?? "";
    const strip = (line: string) => (prefix ? line.replace(QUOTE_PREFIX, "") : line);
    const opener = strip(lines[0] ?? "").trim();
    const fence = parts.opener.char.repeat(parts.opener.ticks);
    const body = lines.slice(1, parts.closed ? -1 : undefined).map(strip).join("\n");

    const md =
      jsonKindValueMarkdown(body) ??
      convertRegions(body, false, options, (piece) =>
        /^[\s,[\]{}]*$/.test(piece) ? "" : `${opener}\n${piece.trim()}\n${fence}`,
      );
    if (md === null) continue;
    const block = prefix
      ? md
          .split("\n")
          .map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()))
          .join("\n")
      : md;
    out = closeBefore(out.slice(0, range.start)) + block + openAfter(out.slice(range.end));
  }
  return out;
}

function convertKindText(text: string, options: ConvertOptions): string {
  // 0. Front matter holding a kind, and kinds that cannot name themselves.
  text = noteUnreadableKinds(convertFrontMatterKind(text, options));

  // 1. The whole text is a value carrying kinds (a structured answer's stored JSON).
  const whole = jsonKindValueMarkdown(text);
  if (whole !== null) return whole;

  // 2. JSON fences holding kinds.
  let out = convertKindFences(text, options);

  // 3. Bare kind values in prose (code fences and spans stay quoted source).
  if (!hasKindKey(out)) return out;
  out = convertRegions(out, true, options) ?? out;

  // 4. HTML comments are literal to the region finder, but a person reading
  //    plain text sees what is inside them.
  out = convertCommentKinds(out, options);

  // 5. A cut-off kind whose key is written escaped (`"\u005f_kind"`).
  return noteEscapedCutOffKind(out, options);
}

/** Front matter (`---` … `---`) whose body holds a kind → that kind's markdown. */
function convertFrontMatterKind(text: string, options: ConvertOptions): string {
  const end = frontMatterEnd(text);
  if (end === 0 || !hasKindKey(text.slice(0, end))) return text;
  const block = text.slice(0, end);
  const lines = block.split("\n");
  const body = lines.slice(1, -1).join("\n").replace(/\r$/, "");
  const md = convertRegions(body, false, options, (piece) =>
    /^[\s,[\]{}]*$/.test(piece) ? "" : piece.trim(),
  );
  if (md === null) return text;
  return md + openAfter(text.slice(end));
}

/** HTML comments (outside code) holding a kind → the kind's markdown; other comment text stays a comment. */
function convertCommentKinds(text: string, options: ConvertOptions): string {
  const quoted = quotedCodeRanges(text);
  const comments = [...text.matchAll(/<!--[\s\S]*?(?:-->|$)/g)].filter(
    (m) =>
      hasKindKey(m[0]) && !quoted.some(([a, b]) => m.index! >= a && m.index! < b),
  );
  let out = text;
  for (let i = comments.length - 1; i >= 0; i--) {
    const m = comments[i]!;
    const body = m[0].replace(/^<!--/, "").replace(/-->$/, "");
    const md = convertRegions(body, false, options, (piece) =>
      piece.trim() ? `<!-- ${piece.trim()} -->` : "",
    );
    if (md === null) continue;
    const start = m.index!;
    const end = start + m[0].length;
    out = closeBefore(out.slice(0, start)) + md + openAfter(out.slice(end));
  }
  return out;
}

const KIND_KEY_PLAIN = /(?<!\\)"__kind"\s*:/;

/** An unclosed JSON value at the tail whose `__kind` key is written escaped → its one-line note. */
function noteEscapedCutOffKind(text: string, options: ConvertOptions): string {
  if (options.broken !== "note" || !hasKindKey(text) || KIND_KEY_PLAIN.test(text)) return text;
  const quoted = quotedCodeRanges(text);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") continue;
    const range = quoted.find(([a, b]) => i >= a && i < b);
    if (range) {
      i = range[1] - 1;
      continue;
    }
    const end = balancedEnd(text, i);
    if (end !== null) {
      i = end - 1;
      continue;
    }
    const tail = text.slice(i);
    if (/^[{[]\s*["{[]/.test(tail) && hasKindKey(tail)) {
      return closeBefore(text.slice(0, i)).trimEnd() + (i > 0 ? "\n\n" : "") + unfinishedKindLabel(firstKindSlug(tail));
    }
  }
  return text;
}

/**
 * The export transform. Kindless text returns byte for byte; every kind
 * region becomes readable markdown, and a kind that can never complete (cut
 * off, malformed) becomes its one-line "<Kind> did not finish" note — never
 * the fragment.
 */
export function kindTextToMarkdown(text: string | null | undefined): string {
  if (!text) return "";
  if (!hasKindKey(text)) return text;
  return convertKindText(text, { broken: "note" });
}

export interface KindTextPreview {
  /** The readable text: complete kinds as markdown, an arriving kind cut off. */
  text: string;
  /** The slug of a kind still arriving at the end of the text (its loader), else null. */
  pendingKind: string | null;
  /** True when a kind is arriving but its slug has not been read yet. */
  pendingUnnamed: boolean;
}

/**
 * Where the object that OWNS the first `"__kind"` key starts — the outermost
 * `{` still open at that key — or -1. String contents are skipped.
 */
function owningObjectStart(text: string, keyIndex: number): number {
  const open: number[] = [];
  let inString = false;
  for (let i = 0; i < keyIndex; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") open.push(i);
    else if (ch === "}") open.pop();
  }
  return open.length > 0 ? open[0] : -1;
}

/**
 * Where the first `__kind` KEY starts (its opening quote), or -1 — found with
 * the shared detector (`hasKindKey`, which also sees the `\u005f_kind` spelling):
 * the shortest prefix the detector accepts ends at the key's colon.
 */
function kindKeyIndex(text: string): number {
  if (!hasKindKey(text)) return -1;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hasKindKey(text.slice(0, mid))) hi = mid;
    else lo = mid + 1;
  }
  let i = lo - 1; // the colon
  while (i > 0 && /\s/.test(text[i - 1]!)) i--;
  const closing = i - 1; // the key's closing quote
  return text.lastIndexOf('"', closing - 1);
}

/**
 * A COMPACT, possibly still-streaming preview of answer text (a toast, a
 * hover card, a list row): complete kinds read as their markdown; a kind
 * still arriving is cut from the text and named in `pendingKind` so the
 * caller shows that kind's loader — the raw JSON never shows mid-stream.
 */
export function kindTextPreview(text: string | null | undefined): KindTextPreview {
  // An arriving kind is the caller's loader, not a note: keep it to cut below.
  const md = !text ? "" : hasKindKey(text) ? convertKindText(text, { broken: "keep" }) : text;
  const keyIndex = kindKeyIndex(md);
  if (keyIndex < 0) return { text: md, pendingKind: null, pendingUnnamed: false };
  const start = owningObjectStart(md, keyIndex);
  const cutAt = start < 0 ? keyIndex : start;
  // Drop an opening fence line that only introduces the arriving kind.
  const head = md.slice(0, cutAt).replace(/(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n?[ \t]*$/, "$1");
  const slug = firstKindSlug(md.slice(keyIndex));
  return { text: head.trimEnd(), pendingKind: slug, pendingUnnamed: slug === null };
}
