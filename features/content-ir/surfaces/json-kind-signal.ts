/**
 * THE KIND SIGNAL of a JSON region's text — the one answer to "could this
 * still be a kind?" (Arman, 2026-09-30):
 *
 *   1. The moment it COULD be a kind → display as a kind (its loader).
 *   2. The moment we know WHICH kind → that kind (the parser's job).
 *   3. The moment we know it is not a kind → it is JSON, and JSON is fine.
 *
 * "Could" is decided by the FIRST KEY. Until the first key has fully arrived
 * the region is `undecided` and nothing raw is shown. A first key of `__kind`
 * — or a `__kind` key anywhere in the text, at any depth, at any time — is
 * `kind`. A complete first key that is anything else, with no `__kind` seen,
 * is `not_kind`: the region streams live as JSON, and flips to `kind` the
 * instant a `__kind` key shows up later.
 *
 * Pure and text-only on purpose: it must answer for every frame of every
 * region, including ones whose parser never opened (an unlabelled fence, a
 * reload, a plain markdown fence).
 */

import { fenceOpenerOf, findCodeRanges } from "@ai-matrx/content-ir/source";

export type JsonKindSignal = "undecided" | "kind" | "not_kind";

/**
 * A pathological first key (or a region that is only whitespace and brackets)
 * must not hold a loader forever — past this, an undecided region is treated
 * as JSON so its content is never hidden behind a lid.
 */
const UNDECIDED_LIMIT_CHARS = 2000;

/**
 * The key `__kind` as JSON may spell it: every character literal or as its
 * `\uXXXX` escape (`"\u005f_kind"` IS the key `__kind` to `JSON.parse` — V7).
 */
const KIND_KEY_BODY = [..."__kind"]
  .map((ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(4, "0");
    const escaped = [...hex]
      .map((d) => (/[a-f]/.test(d) ? `[${d}${d.toUpperCase()}]` : d))
      .join("");
    return `(?:${ch}|\\\\u${escaped})`;
  })
  .join("");

/** A `"__kind"` KEY (not an escaped occurrence inside a string value). */
const KIND_KEY = new RegExp(String.raw`(?<!\\)"${KIND_KEY_BODY}"\s*:`);

export function hasKindKey(text: string): boolean {
  return KIND_KEY.test(text);
}

/** The key, then its string value (escapes allowed), captured whole. */
const KIND_SLUG = new RegExp(
  String.raw`(?<!\\)"${KIND_KEY_BODY}"\s*:\s*("(?:[^"\\]|\\.)*")`,
);

/** A slug the loader may name: letters, digits and `_.:-` only. */
const SLUG_TEXT = /^[A-Za-z0-9_.:-]+$/;

/**
 * The first complete `__kind` slug in the text, or null. For a LOADER only —
 * which kind's skeleton to show while the region arrives. Never an identity:
 * the parser owns which kind a region actually is.
 */
export function firstKindSlug(text: string): string | null {
  const literal = KIND_SLUG.exec(text)?.[1];
  if (!literal) return null;
  let slug: unknown;
  try {
    slug = JSON.parse(literal);
  } catch {
    return null;
  }
  return typeof slug === "string" && SLUG_TEXT.test(slug) ? slug : null;
}

/**
 * A text that ENDS in an object key that has reached `"__k` and is still a
 * prefix of `"__kind"` (or is `"__kind"` waiting for its colon) — V6: the
 * frames before the colon of a LATER `__kind` key (`[{"x":1}, {"__kind`,
 * `{"data":{"__kind`) could be a kind, so they hold the loader instead of
 * flashing raw. Key position only (after `{` or `,` inside an object): a
 * string VALUE that starts `"__k` is never a key. `"_id"`, `"__type"` never
 * reach the threshold; `"__key"` holds for the one frame before its `e`.
 */
const PARTIAL_KIND_KEY_TAIL = /"__k(?:i(?:n(?:d(?:"\s*)?)?)?)?$/;

export function endsInPartialKindKey(text: string): boolean {
  const tail = PARTIAL_KIND_KEY_TAIL.exec(text);
  if (!tail) return false;
  return isObjectKeyPosition(text, tail.index);
}

/** Whether the `"` at `quoteAt` opens an object key (structural scan, strings opaque). */
function isObjectKeyPosition(text: string, quoteAt: number): boolean {
  const stack: string[] = [];
  let expectKey = false;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < quoteAt; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      expectKey = false;
    } else if (ch === "{" || ch === "[") {
      stack.push(ch);
      expectKey = ch === "{";
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      expectKey = false;
    } else if (ch === ",") {
      expectKey = stack[stack.length - 1] === "{";
    } else if (ch === ":") {
      expectKey = false;
    }
  }
  return !inString && expectKey;
}

export function jsonKindSignal(text: string | null | undefined): JsonKindSignal {
  const source = text ?? "";
  if (hasKindKey(source)) return "kind";

  let i = skipWs(source, 0);
  if (i >= source.length) return "undecided";

  // A list of objects: decide on the first element's first key.
  if (source[i] === "[") {
    i = skipWs(source, i + 1);
    if (i >= source.length) return capped(source);
    if (source[i] !== "{") return notKindUnlessPartialKey(source);
  }
  if (source[i] !== "{") return notKindUnlessPartialKey(source);

  i = skipWs(source, i + 1);
  if (i >= source.length) return capped(source);
  // `{}` or not an object key
  if (source[i] !== '"') return notKindUnlessPartialKey(source);

  // Read the first key, honouring escapes; unterminated → still arriving.
  let j = i + 1;
  while (j < source.length) {
    const ch = source[j];
    if (ch === "\\") {
      j += 2;
      continue;
    }
    if (ch === '"') {
      return decodedKey(source.slice(i, j + 1)) === "__kind"
        ? "kind"
        : notKindUnlessPartialKey(source);
    }
    j++;
  }
  return capped(source);
}

/** A first key decided against `__kind` — unless a later key is arriving as one (V6). */
function notKindUnlessPartialKey(source: string): JsonKindSignal {
  return endsInPartialKindKey(source) ? "undecided" : "not_kind";
}

/** A complete JSON key literal (quotes included), decoded; the raw body if it will not parse. */
function decodedKey(literal: string): string {
  try {
    const key: unknown = JSON.parse(literal);
    return typeof key === "string" ? key : literal.slice(1, -1);
  } catch {
    return literal.slice(1, -1);
  }
}

function capped(source: string): JsonKindSignal {
  return source.length > UNDECIDED_LIMIT_CHARS ? "not_kind" : "undecided";
}

function skipWs(source: string, from: number): number {
  let i = from;
  while (i < source.length && /\s/.test(source[i])) i++;
  return i;
}

/**
 * The VALUE form of the same question, for renderers handed parsed data
 * instead of text (the value grid, the JSON viewers): does this value carry a
 * kind anywhere — an object with a string `__kind`, at any depth, or a string
 * whose text is JSON with a `__kind` key? A raw renderer that answers yes
 * renders the value through the one value door (`AnswerValueView`) instead.
 */
export function valueCarriesKind(value: unknown): boolean {
  return carriesKind(value, 0, new Set());
}

/** Past this depth a value is not searched further (cycles and pathological nesting). */
const VALUE_SEARCH_DEPTH = 64;

function carriesKind(value: unknown, depth: number, seen: Set<object>): boolean {
  if (typeof value === "string") return isKindJsonText(value);
  if (value === null || typeof value !== "object") return false;
  if (depth > VALUE_SEARCH_DEPTH || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => carriesKind(item, depth + 1, seen));
  }
  const record = value as Record<string, unknown>;
  if (typeof record.__kind === "string" && record.__kind.trim()) return true;
  for (const item of Object.values(record)) {
    if (carriesKind(item, depth + 1, seen)) return true;
  }
  return false;
}

/** Text that IS a JSON object/array carrying a `__kind` key (not prose mentioning one). */
export function isKindJsonText(text: string): boolean {
  const first = text.trimStart()[0];
  return (first === "{" || first === "[") && hasKindKey(text);
}

/** The kind slug a value claims for itself at its root, or null. */
export function rootKindSlug(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = (value as Record<string, unknown>).__kind;
  return typeof kind === "string" && kind.trim() ? kind : null;
}

/** Fence languages whose body is a JSON region (an unlabelled fence included). */
const JSON_FENCE_LANGS = new Set(["", "json", "jsonc", "json5"]);

/** Whether a fence's language makes its body a JSON region (any case; none counts). */
export function isJsonFenceLanguage(lang: string | null | undefined): boolean {
  return JSON_FENCE_LANGS.has((lang ?? "").trim().toLowerCase());
}

/**
 * Where a kind in markdown is the model QUOTING SOURCE, never data (the
 * owner's ruling, 2026-09-30): inside an inline code span, or inside a fence
 * whose language is not JSON (```ts, ```xml, ```markdown …). Everything else
 * — prose, a blockquote, a list item, a table cell, a 4-space indented block,
 * a JSON fence — is data. [start, end) spans, in order. THE one definition:
 * the splitter, the live accumulator and the leaf gate all read it, so a leaf
 * and the pipeline can never disagree about what is a kind region.
 */
export function quotedSourceRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const range of findCodeRanges(text)) {
    if (range.kind === "span") {
      ranges.push([range.start, range.end]);
      continue;
    }
    const raw = text.slice(range.start, range.end);
    const newline = raw.indexOf("\n");
    const firstLine = (newline === -1 ? raw : raw.slice(0, newline)).replace(/^ {0,3}(?:> ?)*/, "");
    const opener = fenceOpenerOf(firstLine.trimStart());
    if (!opener || !isJsonFenceLanguage(opener.lang)) {
      ranges.push([range.start, range.end]);
    }
  }
  return ranges;
}

/**
 * The MARKDOWN form: does this prose hold a kind REGION — a `__kind` key
 * anywhere outside quoted source (see `quotedSourceRanges`)? A leaf that
 * answers yes hands the text to the pipeline (`MarkdownStream`), which lifts
 * the region by the same definition — prose, table cell, indented block,
 * blockquote, JSON fence, or the whole text being kind JSON.
 */
export function markdownCarriesKind(text: string): boolean {
  if (!hasKindKey(text)) return false;
  if (isKindJsonText(text)) return true;
  const quoted = quotedSourceRanges(text);
  if (quoted.length === 0) return true;
  let outside = "";
  let cursor = 0;
  for (const [start, end] of quoted) {
    if (start < cursor) continue;
    outside += text.slice(cursor, start) + " ";
    cursor = end;
  }
  outside += text.slice(cursor);
  return hasKindKey(outside);
}
