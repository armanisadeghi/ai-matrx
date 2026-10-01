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
  // 1. The whole text is a value carrying kinds (a structured answer's stored JSON).
  const whole = jsonKindValueMarkdown(text);
  if (whole !== null) return whole;

  // 2. JSON fences holding kinds.
  let out = convertKindFences(text, options);

  // 3. Bare kind values in prose (code fences and spans stay quoted source).
  if (!hasKindKey(out)) return out;
  out = convertRegions(out, true, options) ?? out;
  return out;
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
 * A COMPACT, possibly still-streaming preview of answer text (a toast, a
 * hover card, a list row): complete kinds read as their markdown; a kind
 * still arriving is cut from the text and named in `pendingKind` so the
 * caller shows that kind's loader — the raw JSON never shows mid-stream.
 */
export function kindTextPreview(text: string | null | undefined): KindTextPreview {
  // An arriving kind is the caller's loader, not a note: keep it to cut below.
  const md = !text ? "" : hasKindKey(text) ? convertKindText(text, { broken: "keep" }) : text;
  const keyIndex = md.search(/(?<!\\)"__kind"\s*:/);
  if (keyIndex < 0) return { text: md, pendingKind: null, pendingUnnamed: false };
  const start = owningObjectStart(md, keyIndex);
  const cutAt = start < 0 ? keyIndex : start;
  // Drop an opening fence line that only introduces the arriving kind.
  const head = md.slice(0, cutAt).replace(/(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n?[ \t]*$/, "$1");
  const slug = firstKindSlug(md.slice(keyIndex));
  return { text: head.trimEnd(), pendingKind: slug, pendingUnnamed: slug === null };
}
