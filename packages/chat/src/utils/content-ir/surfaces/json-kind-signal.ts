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

/**
 * JSON5 lets a key go unquoted (`{__kind: "flashcard_set"}`) or single-quoted.
 * Accepted ONLY in a ```json5 context (X-minor, round 3) — plain JSON never
 * has such a key, and prose that says `__kind:` is not one.
 */
const JSON5_KIND_KEY = /(?:^|[{,]\s*|\n\s*)(?:__kind|'__kind')\s*:/;
const JSON5_KIND_SLUG = /(?:^|[{,]\s*|\n\s*)(?:__kind|'__kind'|"__kind")\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;

/**
 * The key as MARKDOWN may spell it (P8, round 4): `"\_\_kind"` — the renderer
 * un-escapes it to `"__kind"` on screen. Text contexts only.
 */
const MARKDOWN_KIND_KEY = /(?<!\\)"\\_\\_kind"\s*:/;

/**
 * The key as a STRING-HELD kind spells it once serialized again (R3, round 6):
 * `{\"__kind\":…}` — what `JSON.stringify` of an object holding kind JSON in a
 * string value prints, at any nesting (`\\\"`). On screen that is raw kind
 * JSON (ruling c). Rendered-text / stored-text contexts only — inside parsed
 * JSON it is a string VALUE, never a key, so `hasKindKey` alone ignores it.
 */
const ESCAPED_KIND_KEY = /\\+"__kind\\+"\s*:/;
const ESCAPED_KIND_SLUG = /\\+"__kind\\+"\s*:\s*\\+"([A-Za-z0-9_.:-]+)\\+"/;

/**
 * Options for the JSON-text readers: `json5` widens the key rule to JSON5's;
 * `markdown` also reads the markdown-escaped key (`"\_\_kind"`, P8);
 * `escaped` also reads the backslash-escaped key of a string-held kind
 * (`\"__kind\"`, R3 round 6 — screen and search text only).
 */
export interface KindTextOptions {
  json5?: boolean;
  markdown?: boolean;
  escaped?: boolean;
  /** Also read a Python-repr key (`{'__kind': 'flashcard_set'}`) — text contexts only (K4). */
  python?: boolean;
  /** Also read a typographic-quoted key (`“__kind”`, `‘__kind’`) — text contexts only (round 8). */
  smart?: boolean;
  /** Also read an HTML-entity key (`&quot;__kind&quot;`, `&#34;__kind&#34;`) — text contexts only (round 8). */
  entity?: boolean;
  /**
   * Also read a JavaScript object-literal key (`{ __kind: 'flashcard_set' }` —
   * what Node's console prints, a sandbox tool's output) — key position with a
   * quoted value, text contexts only (L-2, round 9).
   */
  js?: boolean;
}

/**
 * EVERY spelling of the key a reader still sees as `__kind` (owner ruling,
 * round 8): literal, `\u005f`-escaped, markdown-escaped `\_\_kind`,
 * backslash-escaped quotes `\"__kind\"`, zero-width characters anywhere in
 * the key, Python repr `'__kind'`, typographic quotes `“__kind”` and HTML
 * entities `&quot;__kind&quot;`. THE options every TEXT context (prose,
 * titles, exports, previews, the screen scan) passes; JSON contexts keep the
 * default, where those spellings are string VALUES (and `valueCarriesKind`
 * reads the strings with this set).
 */
export const ALL_KIND_SPELLINGS: Readonly<KindTextOptions> = Object.freeze({
  markdown: true,
  escaped: true,
  python: true,
  smart: true,
  entity: true,
  js: true,
});

/**
 * Invisible characters a model, a copy-paste or a sanitizer can leave INSIDE
 * the key (`"__\u200Bkind"`): the screen still reads `"__kind"`, so the
 * detector reads through them (K4, round 7). Zero-width space / non-joiner /
 * joiner, word joiner, BOM / zero-width no-break space, soft hyphen.
 */
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const HAS_ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/;

/** The text without zero-width characters (unchanged — same string — when it has none). */
export function withoutZeroWidth(text: string): string {
  return HAS_ZERO_WIDTH.test(text) ? text.replace(ZERO_WIDTH, "") : text;
}

/**
 * The key as a PYTHON REPR spells it (K4, round 7): `{'__kind': 'flashcard_set'}`
 * — what `str(dict)` prints into a server error or a tool's string result.
 * Text contexts only, and only in key position (after `{` or `,`) with a
 * quoted value, so prose that says `'__kind':` is never one.
 */
const PYTHON_KIND_KEY = /[{,]\s*'__kind'\s*:\s*['"]/;
const PYTHON_KIND_SLUG = /[{,]\s*'__kind'\s*:\s*(?:'([A-Za-z0-9_.:-]+)'|"([A-Za-z0-9_.:-]+)")/;

/** Typographic quotes a smart-quoting editor or model writes for `"` and `'`. */
const SMART_DOUBLE = "\u201C\u201D\u201E\u201F\u2033";
const SMART_SINGLE = "\u2018\u2019\u201A\u201B\u2032";
/** The key in typographic quotes (`“__kind”:`, `‘__kind’:`) — key position only. */
const SMART_KIND_KEY = new RegExp(`[${SMART_DOUBLE}${SMART_SINGLE}]__kind[${SMART_DOUBLE}${SMART_SINGLE}"']\\s*:`);
/** The key in HTML entities (`&quot;__kind&quot;:`, `&#34;`, `&#x22;`, `&#39;`, `&apos;`). */
const ENTITY_QUOTE = "&(?:quot|apos|#0*3[49]|#[xX]0*2[27]);";
const ENTITY_KIND_KEY = new RegExp(`${ENTITY_QUOTE}__kind${ENTITY_QUOTE}\\s*:`);

/** Whether a fence language is JSON5 (the one context that widens the key rule). */
export function isJson5Language(lang: string | null | undefined): boolean {
  return (lang ?? "").trim().toLowerCase() === "json5";
}

export function hasKindKey(source: string, options: KindTextOptions = {}): boolean {
  const text = withoutZeroWidth(source);
  return (
    KIND_KEY.test(text) ||
    (options.python === true && PYTHON_KIND_KEY.test(text)) ||
    (options.json5 === true && JSON5_KIND_KEY.test(text)) ||
    (options.markdown === true && MARKDOWN_KIND_KEY.test(text)) ||
    (options.escaped === true && ESCAPED_KIND_KEY.test(text)) ||
    (options.smart === true && SMART_KIND_KEY.test(text)) ||
    (options.entity === true && ENTITY_KIND_KEY.test(text)) ||
    (options.js === true && JS_KIND_KEY.test(text)) ||
    // Every realistic spelling COMBINED in one key (escaped + zero-width,
    // repr + zero-width, `"\__kind"`, `{\"\\_\\_kind\"…}` — L-1, round 9).
    (options.escaped === true && options.python === true && options.smart === true && options.markdown === true &&
      hasSpelledKey(source))
  );
}

/** The key as a JavaScript object literal spells it: unquoted, key position, quoted value (L-2). */
const JS_KIND_KEY = /[{,]\s*__kind\s*:\s*['"]/;

/**
 * EXOTIC spellings (owner ruling, round 9): double HTML entities
 * (`&amp;quot;`), `&#95;` underscores, upper-case / padded entities, fullwidth
 * quotes, bidi marks, invisible operators and combining joiners inside the key.
 * DETECTION ONLY — the leak sentinel and the frame judge report them; no
 * renderer converts them (an adversarial spelling is a defect to see, not a
 * shape to guess at).
 */
export function hasExoticKindKey(text: string): boolean {
  if (!/kind|&#|&amp;|\uFF3F/i.test(text)) return false;
  let plain = text
    .replace(EXOTIC_INVISIBLE, "")
    .replace(/\uFF02/g, '"')
    .replace(/\uFF07/g, "'")
    .replace(/\uFF3F/g, "_");
  for (let pass = 0; pass < 3 && plain.includes("&"); pass++) plain = plain.replace(LOOSE_ENTITY, looseEntity);
  return plain !== text && hasKindKey(plain, ALL_KIND_SPELLINGS);
}

const EXOTIC_INVISIBLE = /[\p{Cf}\u034F\u115F\u1160\u17B4\u17B5\u180E\u3164\uFFA0]/gu;
const LOOSE_ENTITY = /&(#[xX][0-9a-fA-F]{1,8}|#\d{1,8}|[A-Za-z]{2,8});/g;
const LOOSE_NAMED: Record<string, string> = { quot: '"', apos: "'", amp: "&", lt: "<", gt: ">", lowbar: "_" };
function looseEntity(whole: string, body: string): string {
  if (body.startsWith("#")) {
    const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
  }
  return LOOSE_NAMED[body.toLowerCase()] ?? whole;
}

/** Whether TEXT holds the key in ANY spelling a reader sees as `__kind` (round 8). */
export function hasKindKeyAnySpelling(source: string): boolean {
  return hasKindKey(source, ALL_KIND_SPELLINGS);
}

/** The key, then its string value (escapes allowed), captured whole. */
const KIND_SLUG = new RegExp(
  String.raw`(?<!\\)"${KIND_KEY_BODY}"\s*:\s*("(?:[^"\\]|\\.)*")`,
);

/** A slug the loader may name: letters, digits and `_.:-` only. */
const SLUG_TEXT = /^[A-Za-z0-9_.:-]+$/;

/** Whether a `__kind` value is a readable slug (ruling (c): anything else is broken output). */
export function isKindSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_TEXT.test(value);
}

/**
 * The first complete `__kind` slug in the text, or null. For a LOADER only —
 * which kind's skeleton to show while the region arrives. Never an identity:
 * the parser owns which kind a region actually is.
 */
export function firstKindSlug(source: string, options: KindTextOptions = {}): string | null {
  const text = withoutZeroWidth(source);
  let literal = KIND_SLUG.exec(text)?.[1];
  if (!literal && (options.json5 || options.js)) {
    const json5 = JSON5_KIND_SLUG.exec(text)?.[1];
    literal = json5?.startsWith("'") ? JSON.stringify(json5.slice(1, -1)) : json5;
  }
  if (!literal && options.escaped) {
    const escaped = ESCAPED_KIND_SLUG.exec(text)?.[1];
    if (escaped) return escaped;
  }
  if (!literal && options.python) {
    const python = PYTHON_KIND_SLUG.exec(text);
    if (python) return python[1] ?? python[2] ?? null;
  }
  if (!literal && (options.smart || options.entity || options.markdown)) {
    const canonical = normalizeKindSpellings(text);
    if (canonical !== text) return firstKindSlug(canonical, { ...options, smart: false, entity: false, markdown: false });
  }
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

/**
 * The text after any LEADING JSONC comments and whitespace (`// note`,
 * `/* … *\/`) — a ```jsonc / ```json / unlabelled fence that opens with a
 * comment still decides on its first key (X3). An unterminated leading
 * comment (still arriving) leaves nothing: undecided, never raw.
 */
export function withoutLeadingJsonComments(text: string): string {
  let i = 0;
  for (;;) {
    i = skipWs(text, i);
    if (text.startsWith("//", i)) {
      const end = text.indexOf("\n", i);
      if (end === -1) return "";
      i = end + 1;
    } else if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      if (end === -1) return "";
      i = end + 2;
    } else {
      return i === 0 ? text : text.slice(i);
    }
  }
}

export function jsonKindSignal(
  text: string | null | undefined,
  options: KindTextOptions = {},
): JsonKindSignal {
  const source = withoutLeadingJsonComments(text ?? "");
  if (hasKindKey(source, options)) return "kind";

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
      return withoutZeroWidth(decodedKey(source.slice(i, j + 1))) === "__kind"
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
 * A ```json5 body as plain JSON, when the difference is only what JSON5 adds
 * that models actually write: comments, unquoted identifier keys, single-quoted
 * keys/strings and trailing commas. Null when the result still will not parse.
 */
export function json5AsJson(text: string): string | null {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let body = "";
      while (j < text.length && text[j] !== ch) {
        if (text[j] === "\\") {
          body += text[j]! + (text[j + 1] ?? "");
          j += 2;
          continue;
        }
        body += ch === "'" && text[j] === '"' ? '\\"' : text[j]!;
        j++;
      }
      out += `"${body}"`;
      i = j + 1;
      continue;
    }
    if (text.startsWith("//", i)) {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    const key = /^[A-Za-z_$][\w$]*(?=\s*:)/.exec(text.slice(i));
    if (key && /[{,]\s*$/.test(out)) {
      out += `"${key[0]}"`;
      i += key[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  out = out.replace(/,(\s*[}\]])/g, "$1");
  try {
    JSON.parse(out);
    return out;
  } catch {
    return null;
  }
}

/**
 * A Python repr of a dict/list (`{'__kind': 'flashcard_set', 'ok': True}`) as
 * JSON text, or null when it is not one. Strings may be single- or
 * double-quoted; `True` / `False` / `None` become JSON literals.
 */
export function pythonReprAsJson(text: string): string | null {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      let body = "";
      while (j < text.length && text[j] !== ch) {
        if (text[j] === "\\") {
          const next = text[j + 1] ?? "";
          body += next === "'" ? "'" : `\\${next}`;
          j += 2;
          continue;
        }
        body += text[j] === '"' ? '\\"' : text[j]!;
        j++;
      }
      if (j >= text.length) return null;
      out += `"${body}"`;
      i = j + 1;
      continue;
    }
    const word = /^(?:True|False|None)\b/.exec(text.slice(i, i + 5));
    if (word) {
      out += word[0] === "True" ? "true" : word[0] === "False" ? "false" : "null";
      i += word[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  try {
    JSON.parse(out);
    return out;
  } catch {
    return null;
  }
}

/** Whether text holds a Python-repr `'__kind'` key (key position, quoted value). */
export function hasPythonKindKey(text: string): boolean {
  return PYTHON_KIND_KEY.test(withoutZeroWidth(text));
}

/** Where the Python-repr value opening at `start` (`{` or `[`) closes (exclusive), or null. */
export function pythonBalancedEnd(text: string, start: number): number | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

/**
 * THE ONE SPELLING NORMALIZER (K4 round 7, widened round 8, rebuilt round 9).
 * Every text detector, converter and label function runs it (directly, or
 * through `hasKindKeyAnySpelling`) so a kind spelled any REALISTIC way the
 * screen still reads as a kind converts like any other. Each spelled region —
 * from the `{` that owns the key to where its own grammar ends — is rewritten
 * as canonical JSON:
 *
 *   zero-width in the key · HTML entities · typographic quotes ·
 *   backslash-escaped quotes (any depth) · markdown-escaped `\_` · Python repr ·
 *   JavaScript object literal — and any combination of them in one key
 *
 * DO NO HARM (owner ruling, round 9): only characters INSIDE a matched region
 * change (a zero-width character only inside the key itself), a region never
 * reaches past the point where its grammar breaks (an unclosed region in prose
 * ends there and the text after it stays), and the scan is one linear pass.
 * Quoted source (inline code, non-JSON fences) stays as written, and a WHOLE
 * JSON text is never rewritten (a spelling inside it is a string VALUE).
 * Text with no non-canonical spelling comes back as the same string.
 */
export function normalizeKindSpellings(source: string): string {
  if (!mayHoldKindKey(source)) return source;
  // Whole JSON text: a spelling in it is a string VALUE, never rewritten.
  if (/^[{[]/.test(source.trimStart())) {
    try {
      JSON.parse(source);
      // Its own keys still read through a zero-width character (only the keys).
      return withoutZeroWidthInKeys(source);
    } catch {
      // Not JSON: read on.
    }
  }
  let out = "";
  let cursor = 0;
  for (const region of scanKindSpellingRegions(source)) {
    const rewritten = canonicalRegionText(source, region);
    if (rewritten === null) continue;
    out += source.slice(cursor, region.rewriteStart) + rewritten;
    cursor = region.rewriteEnd;
  }
  return cursor === 0 ? source : out + source.slice(cursor);
}

/** The canonical JSON a region is rewritten to by the normalizer, or null to leave it. */
function canonicalRegionText(source: string, region: KindSpellingRegion): string | null {
  if (region.family === "lifted") {
    // A literal / `_` key: only a zero-width character INSIDE the key, or
    // the markdown `\_` the stream ingress also reads, is rewritten.
    if (region.markdown) return region.status === "broken" ? closedJson(region) ?? region.decoded : region.decoded;
    const key = source.slice(region.rewriteStart, region.rewriteEnd);
    return region.keyText === undefined || key === region.keyText ? null : region.keyText;
  }
  if (region.status === "complete") {
    const json = regionJson(region);
    if (json !== null) return json;
    return region.family === "python" || region.family === "js" ? null : region.decoded;
  }
  if (region.status === "broken") return closedJson(region) ?? region.decoded;
  return region.family === "python" || region.family === "js" ? null : region.decoded;
}

/** How a kind key is spelled — which decoders turn its region into JSON. */
export type KindSpellingFamily = "lifted" | "escaped" | "markdown" | "python" | "smart" | "entity" | "js";

/**
 * A kind region in a REALISTIC spelling (round 9). `[start, end)` is the raw
 * region (`{` to where its grammar ended); `[rewriteStart, rewriteEnd)` is what
 * the normalizer replaces (the key alone for a literal key holding only a
 * zero-width character). `status`: `complete` (balanced), `prefix` (still
 * arriving — runs to the end of the text) or `broken` (its grammar failed at
 * `end`; the text after it is NOT part of it). `decoded` is the region's text
 * with its spelling undone (still Python / JS for those families).
 */
export interface KindSpellingRegion {
  start: number;
  end: number;
  rewriteStart: number;
  rewriteEnd: number;
  family: KindSpellingFamily;
  status: "complete" | "prefix" | "broken";
  decoded: string;
  /** Whether the key carried the markdown `\_` (the region was markdown-decoded). */
  markdown: boolean;
  /** A literal key's canonical text (the normalizer's whole rewrite for that family). */
  keyText?: string;
}

const ZW = "[\\u200B-\\u200D\\u2060\\uFEFF\\u00AD]";
/** One underscore of the key: literal, backslash-escaped at any depth, or `_`. */
const KEY_UNDERSCORE = String.raw`(?:\\*_|\\u005[fF])`;
const KEY_CORE = `${ZW}*${KEY_UNDERSCORE}${ZW}*${KEY_UNDERSCORE}${ZW}*k${ZW}*i${ZW}*n${ZW}*d${ZW}*`;
const SMART_ANY = `[${SMART_DOUBLE}${SMART_SINGLE}]`;

/**
 * EVERY REALISTIC SPELLING of the key, and any combination of them (L-1,
 * round 9). Groups: 1 backslashes + 2 core (the JSON family: literal,
 * escaped at any depth, markdown-escaped, zero-width), 3 Python repr core
 * (key position, quoted value), 4 typographic-quote core, 5 HTML-entity core,
 * 6 JavaScript object-literal core (unquoted, key position, quoted value).
 */
const SPELLED_KEY_SOURCE = [
  String.raw`(\\*)"(${KEY_CORE})\\*"\s*:`,
  String.raw`(?<=[{,]\s*)'(${KEY_CORE})'\s*:(?=\s*['"])`,
  `${SMART_ANY}(${KEY_CORE})[${SMART_DOUBLE}${SMART_SINGLE}"']\\s*:`,
  `${ENTITY_QUOTE}(${KEY_CORE})${ENTITY_QUOTE}\\s*:`,
  String.raw`(?<=[{,]\s*)(${KEY_CORE})\s*:(?=\s*['"])`,
].join("|");
const SPELLED_KEY = new RegExp(SPELLED_KEY_SOURCE);
const SPELLED_KEY_G = new RegExp(SPELLED_KEY_SOURCE, "g");

/** Whether text holds the key in any realistic spelling or combination (detection, round 9). */
function hasSpelledKey(text: string): boolean {
  return mayHoldKindKey(text) && SPELLED_KEY.test(text);
}

/**
 * A cheap pre-check every scanner runs first: no key spelling can exist
 * without `kind` (or a zero-width character splitting it). Linear, no regex
 * restarts — the plain text of every frame pays only this.
 */
export function mayHoldKindKey(text: string): boolean {
  return text.includes("kind") || (text.includes("_") && HAS_ZERO_WIDTH.test(text));
}

/** Per call: past this many regions the rest of the text is left as written (hard budget). */
const MAX_REGIONS_PER_CALL = 2000;
/** How far before a `kind` the key's opening quote may sit (backslashes + zero-width + `__`). */
const KEY_LOOKBEHIND = 64;

/** Where `kind` (or `k`+zero-width…`d`) occurs at or after `from`, or -1. */
function nextKindHit(text: string, from: number, zeroWidth: boolean): number {
  if (!zeroWidth) return text.indexOf("kind", from);
  KIND_LETTERS_G.lastIndex = from;
  const m = KIND_LETTERS_G.exec(text);
  return m ? m.index : -1;
}
const KIND_LETTERS_G = new RegExp(`k${ZW}*i${ZW}*n${ZW}*d`, "g");

/** The family a matched key belongs to, and its escape depth. */
function keyFamily(m: RegExpExecArray): { family: KindSpellingFamily; core: string; levels: number } {
  if (m[3] !== undefined) return { family: "python", core: m[3], levels: 0 };
  if (m[4] !== undefined) return { family: "smart", core: m[4], levels: 0 };
  if (m[5] !== undefined) return { family: "entity", core: m[5], levels: 0 };
  if (m[6] !== undefined) return { family: "js", core: m[6], levels: 0 };
  const backslashes = m[1]!.length;
  const core = m[2]!;
  if (backslashes > 0) {
    // `\"` is one level, `\\\"` two, `\\\\\\\"` three: 2^levels − 1 backslashes.
    return { family: "escaped", core, levels: Math.min(4, Math.ceil(Math.log2(backslashes + 1))) };
  }
  const plain = core.replace(ZERO_WIDTH, "");
  if (plain === "__kind" || /^\\u005[fF]_kind$/.test(plain)) return { family: "lifted", core, levels: 0 };
  if (plain === "\\_\\_kind") return { family: "lifted", core, levels: 0 };
  return { family: "markdown", core, levels: 0 };
}

/**
 * THE ONE LINEAR SCAN for kind regions in a realistic spelling (round 9):
 * every candidate is found from a `kind` occurrence, its owning `{` from a
 * forward-only brace cursor, quoted source once, and each region is decoded
 * and bounded by its own grammar in work proportional to its length. Regions
 * are returned in order and never overlap; a region's inner keys belong to it.
 * A key whose `{` grammar fails BEFORE the key is not a region (prose braces).
 */
export function scanKindSpellingRegions(text: string): KindSpellingRegion[] {
  const regions: KindSpellingRegion[] = [];
  if (!mayHoldKindKey(text)) return regions;
  const zeroWidth = HAS_ZERO_WIDTH.test(text);
  let quoted: Array<[number, number]> | null = null;
  const inQuoted = (at: number) => {
    quoted ??= quotedSourceRanges(text);
    let lo = 0;
    let hi = quoted.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const [a, b] = quoted[mid]!;
      if (at < a) hi = mid - 1;
      else if (at >= b) lo = mid + 1;
      else return true;
    }
    return false;
  };
  let cursor = 0;
  let braceScan = 0;
  let lastBrace = -1;
  let hit = nextKindHit(text, 0, zeroWidth);
  while (hit >= 0 && regions.length < MAX_REGIONS_PER_CALL) {
    const windowStart = Math.max(cursor, hit - KEY_LOOKBEHIND);
    const windowEnd = Math.min(text.length, hit + KEY_LOOKBEHIND);
    SPELLED_KEY_G.lastIndex = 0;
    const window = text.slice(windowStart, windowEnd);
    let m: RegExpExecArray | null = null;
    for (let candidate = SPELLED_KEY_G.exec(window); candidate; candidate = SPELLED_KEY_G.exec(window)) {
      if (windowStart + candidate.index + candidate[0].length > hit) {
        m = candidate;
        break;
      }
    }
    if (!m) {
      hit = nextKindHit(text, hit + 1, zeroWidth);
      continue;
    }
    const keyAt = windowStart + m.index;
    const keyEnd = keyAt + m[0].length;
    const next = () => nextKindHit(text, keyEnd, zeroWidth);
    while (braceScan < keyAt) {
      if (text.charCodeAt(braceScan) === 123 /* { */) lastBrace = braceScan;
      braceScan++;
    }
    const brace = lastBrace >= cursor ? lastBrace : -1;
    if (brace < 0 || inQuoted(keyAt) || inQuoted(brace)) {
      hit = next();
      continue;
    }
    const { family, core, levels } = keyFamily(m);
    const markdown = /\\_/.test(core) || (family === "escaped" && /\\{2}_/.test(core));
    const plan = decodePlan(family, levels, markdown);
    const region = boundRegion(text, brace, keyAt, plan);
    if (!region) {
      hit = next();
      continue;
    }
    if (family === "lifted" && !markdown) {
      // Literal key: the region is only scanned (so its inner keys belong to
      // it); the normalizer rewrites the key alone when it holds a zero-width.
      regions.push({
        start: brace,
        end: region.end,
        rewriteStart: keyAt,
        rewriteEnd: keyEnd,
        keyText: m[0].replace(ZERO_WIDTH, ""),
        family,
        status: region.status,
        decoded: withoutZeroWidthInKeys(region.decoded),
        markdown: false,
      });
    } else {
      regions.push({
        start: brace,
        end: region.end,
        rewriteStart: brace,
        rewriteEnd: region.end,
        family,
        status: region.status,
        decoded: withoutZeroWidthInKeys(region.decoded),
        markdown,
      });
    }
    cursor = region.end;
    if (region.status === "prefix") break;
    hit = nextKindHit(text, cursor, zeroWidth);
  }
  return regions;
}

/** Inside decoded text, a key spelled `__kind` with zero-width characters → `__kind` (keys only). */
const ZW_KEY_IN_DECODED = new RegExp(`(["'])${ZW}*_${ZW}*_${ZW}*k${ZW}*i${ZW}*n${ZW}*d${ZW}*\\1(?=\\s*:)`, "g");
function withoutZeroWidthInKeys(decoded: string): string {
  return HAS_ZERO_WIDTH.test(decoded) ? decoded.replace(ZW_KEY_IN_DECODED, (key) => key.replace(ZERO_WIDTH, "")) : decoded;
}

interface DecodePlan {
  steps: SpellingStep[];
  grammar: GrammarDialect;
}

function decodePlan(family: KindSpellingFamily, levels: number, markdown: boolean): DecodePlan {
  const steps: SpellingStep[] = [];
  if (family === "entity") steps.push(entityStep);
  if (family === "smart") steps.push(smartStep);
  for (let level = 0; level < levels; level++) steps.push(escapeStep);
  if (markdown) steps.push(markdownStep);
  const grammar: GrammarDialect =
    family === "js" ? "js" : family === "python" || family === "smart" || family === "entity" ? "python" : "json";
  return { steps, grammar };
}

/** One decoded text and, per decoded character, the raw index it came from (plus the raw end). */
interface DecodedText {
  text: string;
  map: number[];
}

type SpellingStep = (raw: string, i: number) => [string, number];

function decodeWith(raw: string, step: SpellingStep): DecodedText {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < raw.length; ) {
    const [out, consumed] = step(raw, i);
    for (let k = 0; k < out.length; k++) map.push(i);
    text += out;
    i += Math.max(1, consumed);
  }
  map.push(raw.length);
  return { text, map };
}

/** Every step in order, the maps composed back to the raw input. */
function decodeChain(raw: string, steps: SpellingStep[]): DecodedText {
  if (steps.length === 0) {
    const map = new Array<number>(raw.length + 1);
    for (let i = 0; i <= raw.length; i++) map[i] = i;
    return { text: raw, map };
  }
  let current = decodeWith(raw, steps[0]!);
  for (let s = 1; s < steps.length; s++) {
    const next = decodeWith(current.text, steps[s]!);
    const prior = current.map;
    current = { text: next.text, map: next.map.map((at) => prior[at]!) };
  }
  return current;
}

const ENTITY_STEP_RE = /^&(?:(quot|apos|amp|lt|gt)|#(\d{1,6})|#[xX]([0-9a-fA-F]{1,6}));/;
const NAMED_ENTITIES: Record<string, string> = { quot: '"', apos: "'", amp: "&", lt: "<", gt: ">" };
const ESCAPE_CHARS: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", n: "\n", t: "\t", r: "\r", b: "", f: "" };

const entityStep: SpellingStep = (raw, i) => {
  if (raw[i] !== "&") return [raw[i]!, 1];
  const m = ENTITY_STEP_RE.exec(raw.slice(i, i + 12));
  if (!m) return ["&", 1];
  const ch = m[1] ? NAMED_ENTITIES[m[1]]! : String.fromCodePoint(Number.parseInt(m[2] ?? m[3]!, m[2] ? 10 : 16));
  return [ch, m[0].length];
};
const smartStep: SpellingStep = (raw, i) => {
  const ch = raw[i]!;
  if (SMART_DOUBLE.includes(ch)) return ['"', 1];
  if (SMART_SINGLE.includes(ch)) return ["'", 1];
  return [ch, 1];
};
const escapeStep: SpellingStep = (raw, i) => {
  if (raw[i] !== "\\") return [raw[i]!, 1];
  const next = raw[i + 1] ?? "";
  if (next in ESCAPE_CHARS) return [ESCAPE_CHARS[next]!, 2];
  if (next === "u" && /^[0-9a-fA-F]{4}$/.test(raw.slice(i + 2, i + 6))) return [raw.slice(i, i + 6), 6];
  return [raw.slice(i, i + 2), 2];
};
const markdownStep: SpellingStep = (raw, i) => (raw[i] === "\\" && raw[i + 1] === "_" ? ["_", 2] : [raw[i]!, 1]);

/** Smallest decode window; it grows ×4 until the region's grammar settles inside it. */
const FIRST_WINDOW = 128;

/**
 * Decode and bound the region whose `{` is at `brace`: windowed, so the work is
 * proportional to the region, never to the rest of the text. Null when the
 * grammar fails before the key (the `{` is not the key's object).
 */
function boundRegion(
  text: string,
  brace: number,
  keyAt: number,
  plan: DecodePlan,
): { end: number; status: KindSpellingRegion["status"]; decoded: string } | null {
  for (let width = FIRST_WINDOW; ; width *= 4) {
    const hi = Math.min(text.length, brace + width);
    const atEnd = hi === text.length;
    const decoded = decodeChain(text.slice(brace, hi), plan.steps);
    const keyDecoded = firstAtOrAfter(decoded.map, keyAt - brace);
    const verdict = kindGrammar(decoded.text, plan.grammar);
    if (verdict.status === "complete") {
      if (verdict.end <= keyDecoded) return null;
      return { end: brace + decoded.map[verdict.end]!, status: "complete", decoded: decoded.text.slice(0, verdict.end) };
    }
    if (verdict.status === "broken") {
      // A break at the window edge may be a cut escape: look further.
      if (!atEnd && decoded.map[verdict.at]! >= hi - brace - 16) continue;
      if (!verdict.prose) {
        // Malformed JSON, not prose: its balanced close bounds it, as before.
        const end = balancedEnd(decoded.text, plan.grammar !== "json");
        if (end !== null) {
          if (end <= keyDecoded) return null;
          return { end: brace + decoded.map[end]!, status: "complete", decoded: decoded.text.slice(0, end) };
        }
        if (!atEnd) continue;
        return { end: text.length, status: "prefix", decoded: decoded.text };
      }
      // At the end of the text, a half-typed escape or entity (`\`, `&quo`)
      // is still arriving, not broken.
      if (atEnd && ARRIVING_SPELLING_TAIL.test(text.slice(brace + decoded.map[verdict.at]!))) {
        if (verdict.at <= keyDecoded) return null;
        return { end: text.length, status: "prefix", decoded: decoded.text };
      }
      if (verdict.cut <= keyDecoded) return null;
      return { end: brace + decoded.map[verdict.cut]!, status: "broken", decoded: decoded.text.slice(0, verdict.cut) };
    }
    if (!atEnd) continue;
    return { end: text.length, status: "prefix", decoded: decoded.text };
  }
}

/** The end (exclusive) of the quote-aware balanced value opening at 0, or null. */
function balancedEnd(text: string, singleQuotes: boolean): number | null {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || (singleQuotes && ch === "'")) quote = ch;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

/**
 * Where a LITERAL kind object (`text` opens at its `{`) breaks into prose —
 * `{"__kind":"note","title":"Hi" and then…` — after its key: the end of the
 * region, or null (complete, still arriving, or merely malformed). THE one
 * answer the converters, the prose leaf and the live accumulator share, so a
 * settled unclosed object reads the same live and reloaded (L-4, round 9).
 */
export function kindObjectProseBreak(text: string): number | null {
  const key = text.search(LITERAL_KIND_KEY);
  if (key < 0) return null;
  const verdict = kindGrammar(text);
  return verdict.status === "broken" && verdict.prose && verdict.cut > key ? verdict.cut : null;
}
const LITERAL_KIND_KEY = new RegExp(String.raw`(?<!\\)"${KIND_KEY_BODY}"\s*:`);

/** The text's tail after a break that is a spelling still typing: a lone `\` run or a partial entity. */
const ARRIVING_SPELLING_TAIL = /^(?:\\+"?|&#?[A-Za-z0-9]{0,6})$/;

/** The first index whose map value is at least `raw` (maps are non-decreasing). */
function firstAtOrAfter(map: number[], raw: number): number {
  let lo = 0;
  let hi = map.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid]! < raw) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Which JSON-like grammar bounds a region: strict JSON, Python repr, or a JavaScript literal. */
export type GrammarDialect = "json" | "python" | "js";

export type KindGrammarVerdict =
  | { status: "complete"; end: number }
  | { status: "prefix" }
  | { status: "broken"; at: number; cut: number; prose: boolean };

/**
 * Where a JSON-like value opening at 0 ends by its OWN grammar (H-1, round 9):
 * `complete` at its balanced close, `prefix` when the text ends while it is
 * still valid (arriving), or `broken` at the first character that cannot
 * continue it — `cut` is the end of the last whole token before that (after a
 * value, a `,`, or an opener), so the text after `cut` is never part of it.
 * A raw newline inside a string breaks it (JSON strings never hold one), so an
 * unclosed string never runs past its line. One pass, no allocation per char.
 */
export function kindGrammar(
  s: string,
  dialect: GrammarDialect = "json",
): KindGrammarVerdict {
  const closers: number[] = [];
  const singleQuotes = dialect !== "json";
  const bareKeys = dialect === "js";
  const trailingCommas = dialect !== "json";
  // 0 value, 1 value-or-close, 2 key-or-close, 3 colon, 4 after-value
  let expect = 0;
  let lastGood = 0;
  const n = s.length;
  // A break is PROSE when what stops the value is a word (or a newline inside
  // a string) — text after an unclosed object — not JSON punctuation, which is
  // malformed JSON (a trailing comma, a missing comma) and keeps its old reading.
  const broken = (at: number): KindGrammarVerdict => ({
    status: "broken",
    at,
    cut: lastGood,
    prose: !/^[{}[\]:,"'0-9.+-]$/.test(s[at] ?? ""),
  });
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13) {
      i++;
      continue;
    }
    if (expect === 4 || expect === 1 || expect === 2) {
      if (c === 125 /* } */ || c === 93 /* ] */) {
        if (closers.length === 0 || closers[closers.length - 1] !== c) return broken(i);
        if (expect === 4 || trailingCommas || lastCharWasOpener(s, i)) {
          closers.pop();
          i++;
          lastGood = i;
          if (closers.length === 0) return { status: "complete", end: i };
          expect = 4;
          continue;
        }
        return broken(i);
      }
      if (expect === 4) {
        if (c !== 44 /* , */) return broken(i);
        i++;
        lastGood = i;
        expect = closers[closers.length - 1] === 125 ? 2 : 1;
        continue;
      }
    }
    if (expect === 3) {
      if (c !== 58 /* : */) return broken(i);
      i++;
      expect = 0;
      continue;
    }
    const keyPosition = expect === 2;
    if (c === 34 /* " */ || (singleQuotes && c === 39) /* ' */) {
      let j = i + 1;
      for (;;) {
        if (j >= n) return { status: "prefix" };
        const d = s.charCodeAt(j);
        if (d === 92 /* \ */) {
          j += 2;
          continue;
        }
        if (d === 10 || d === 13) return broken(j);
        if (d === c) break;
        j++;
      }
      i = j + 1;
      if (keyPosition) expect = 3;
      else {
        expect = 4;
        lastGood = i;
      }
      continue;
    }
    if (keyPosition) {
      if (!bareKeys || !isIdentStart(c)) return broken(i);
      let j = i + 1;
      while (j < n && isIdentPart(s.charCodeAt(j))) j++;
      if (j >= n) return { status: "prefix" };
      i = j;
      expect = 3;
      continue;
    }
    if (c === 123 /* { */ || c === 91 /* [ */) {
      closers.push(c === 123 ? 125 : 93);
      i++;
      lastGood = i;
      expect = c === 123 ? 2 : 1;
      continue;
    }
    if (c === 45 /* - */ || (c >= 48 && c <= 57)) {
      let j = i + 1;
      while (j < n && /[0-9eE.+-]/.test(s[j]!)) j++;
      if (j >= n) return { status: "prefix" };
      i = j;
      lastGood = i;
      expect = 4;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentPart(s.charCodeAt(j))) j++;
      const word = s.slice(i, j);
      if (j >= n) return VALUE_WORDS[dialect].some((w) => w.startsWith(word)) ? { status: "prefix" } : broken(i);
      if (!VALUE_WORDS[dialect].includes(word)) return broken(i);
      i = j;
      lastGood = i;
      expect = 4;
      continue;
    }
    return broken(i);
  }
  return { status: "prefix" };
}

const VALUE_WORDS: Record<GrammarDialect, string[]> = {
  json: ["true", "false", "null"],
  python: ["True", "False", "None", "true", "false", "null"],
  js: ["true", "false", "null", "undefined", "NaN", "Infinity"],
};

function isIdentStart(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
}
function isIdentPart(c: number): boolean {
  return isIdentStart(c) || (c >= 48 && c <= 57);
}
/** Whether the last non-space character before `at` opens a container (`{}` / `[]` are always fine). */
function lastCharWasOpener(s: string, at: number): boolean {
  for (let k = at - 1; k >= 0; k--) {
    const c = s.charCodeAt(k);
    if (c === 32 || c === 9 || c === 10 || c === 13) continue;
    return c === 123 || c === 91;
  }
  return false;
}

const JSON_ONLY_FAMILIES = new Set<KindSpellingFamily>(["lifted", "escaped", "markdown"]);

/** A complete region as JSON text (Python / JS converted), or null when it will not read. */
export function regionJson(region: Pick<KindSpellingRegion, "family" | "decoded">): string | null {
  const text = region.decoded;
  if (region.family === "js") return json5AsJson(text);
  if (region.family !== "python") {
    try {
      JSON.parse(text);
      return text;
    } catch {
      // A repr-shaped body (single quotes, True/None) reads below.
    }
  }
  return pythonReprAsJson(text);
}

/**
 * A BROKEN (settled, unclosed) region closed where its grammar ended: a
 * dangling `,` or `key:` dropped, every open container closed — the reading
 * the label is drawn from. Null when even that will not read.
 */
export function closedJson(region: Pick<KindSpellingRegion, "family" | "decoded">): string | null {
  let body = region.decoded.replace(/\s+$/, "");
  body = body.replace(/,?\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_$][\w$]*)\s*:\s*$/, "");
  body = body.replace(/,\s*$/, "");
  const closers: string[] = [];
  let quote = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || (ch === "'" && !JSON_ONLY_FAMILIES.has(region.family))) quote = ch;
    else if (ch === "{") closers.push("}");
    else if (ch === "[") closers.push("]");
    else if (ch === "}" || ch === "]") closers.pop();
  }
  if (quote) return null;
  return regionJson({ family: region.family, decoded: body + closers.reverse().join("") });
}

/**
 * The VALUE form of the same question, for renderers handed parsed data
 * instead of text (the value grid, the JSON viewers): does this value carry a
 * kind anywhere — an object with a string `__kind`, at any depth, or a string
 * that holds a kind REGION (`textCarriesKind`: whole kind JSON, or prose with
 * a kind in it — a ```json fence, inline JSON — outside quoted source)? A raw
 * renderer that answers yes renders the value through the one value door
 * (`AnswerValueView`) instead.
 */
export function valueCarriesKind(value: unknown): boolean {
  return carriesKind(value, 0, new Set());
}

/** Past this depth a value is not searched further (cycles and pathological nesting). */
const VALUE_SEARCH_DEPTH = 64;

function carriesKind(value: unknown, depth: number, seen: Set<object>): boolean {
  if (typeof value === "string") return textCarriesKind(value);
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

/**
 * A STRING value that holds a kind region (H1, round 5): text that is kind
 * JSON, or prose with a kind region in it by THE markdown definition
 * (`markdownCarriesKind` — outside quoted source, markdown-escaped key too).
 * `{answer: "Here are your cards: ```json {…kind…}```"}` carries its kind.
 */
export function textCarriesKind(text: string): boolean {
  return isKindJsonText(text) || markdownCarriesKind(text);
}

/**
 * Text that IS a JSON object/array carrying a `__kind` key (not prose
 * mentioning one) — the gate before a `JSON.parse` of the whole text. For
 * "does this string hold a kind anywhere", read `textCarriesKind`.
 */
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
 * Whether an XML card SHOWS SOURCE (the owner's rulings, round 3): a ```xml
 * FENCE is the model quoting source — a kind inside it stays as written (a).
 * An XML TAG the model wraps content in (`<answer>`, `<output>`, any generic
 * tag, closed or not) is STRUCTURE (b): the splitter and the accumulator mark
 * every piece of it `genericXmlContainer`, and a kind inside its prose renders
 * as the kind. THE one answer — XmlBlock's callers and the frame judge read it.
 */
export function isQuotedSourceXmlBlock(block: {
  metadata?: Record<string, unknown> | null;
}): boolean {
  return block.metadata?.genericXmlContainer !== true;
}

/**
 * Where the front matter that opens `source` ends (0 when none): an optional
 * byte-order mark, a first line that is exactly `---` or `+++`, through the
 * same fence (YAML also `...`). Front matter is document properties, never
 * content — a `{"__kind":…}` VALUE inside it is never a kind block, in the
 * static splitter or the live accumulator (RC-B3r round 3, C1).
 */
export function frontMatterEnd(source: string): number {
  const body = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const firstBreak = source.indexOf("\n", body);
  if (firstBreak < 0) return 0;
  const opener = source.slice(body, firstBreak).replace(/\r$/, "");
  if (opener !== "---" && opener !== "+++") return 0;
  for (let pos = firstBreak + 1; pos < source.length; ) {
    const next = source.indexOf("\n", pos);
    const end = next < 0 ? source.length : next;
    const line = source.slice(pos, end).replace(/\r$/, "");
    if (line === opener || (opener === "---" && line === "...")) return end;
    if (next < 0) break;
    pos = next + 1;
  }
  return 0;
}

/**
 * The MARKDOWN form: does this prose hold a kind REGION — a `__kind` key
 * anywhere outside quoted source (see `quotedSourceRanges`)? A leaf that
 * answers yes hands the text to the pipeline (`MarkdownStream`), which lifts
 * the region by the same definition — prose, table cell, indented block,
 * blockquote, JSON fence, or the whole text being kind JSON.
 */
export function markdownCarriesKind(source: string): boolean {
  // Front matter is document properties, hidden on screen and never lifted
  // (X-minor, round 3): a kind there is not a region of the text.
  const text = source.slice(frontMatterEnd(source));
  if (!hasKindKey(text, ALL_KIND_SPELLINGS)) return false;
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
  return hasKindKey(outside, ALL_KIND_SPELLINGS);
}
