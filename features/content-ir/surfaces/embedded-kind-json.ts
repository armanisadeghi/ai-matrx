/**
 * Recover complete self-described kind objects from ANY containing text.
 *
 * Markdown, code fences, and XML are arrival containers, not type authority.
 * Once a complete JSON object directly declares a non-empty `__kind`, that
 * object is its own Content IR region even when an outer parser already
 * classified the surrounding bytes as code, XML, or prose.
 *
 * Generic XML opts into literal-context exclusion so tag attributes, code,
 * comments, and CDATA remain examples owned by their container. Otherwise the
 * scanner is syntax-agnostic about the outer container. It only promotes candidates that independently pass JSON.parse and carry a
 * direct string discriminator. Failed/malformed candidates remain untouched.
 */

import { readXmlTag } from "@/components/mardown-display/blocks/xml/readXmlTag";
import { findCodeRanges } from "@ai-matrx/content-ir/source";

export interface EmbeddedKindJsonRegion {
  start: number;
  end: number;
  content: string;
  kind: string;
}

export type EmbeddedKindJsonPiece =
  | { type: "container"; content: string }
  | { type: "kind"; content: string; kind: string }
  /**
   * JSON punctuation that only held kinds together — the `[`, `,` and `]` of
   * an array of kinds. Kept so the partition stays lossless; never rendered
   * (a lone `[` drawn as a JSON card is noise, not content — A6).
   */
  | { type: "chrome"; content: string }
  /**
   * The non-kind DATA of a JSON wrapper around kinds (`{"result":{…kind…},
   * "note":"x"}`, A7): `content` is the source span it replaces (lossless),
   * `json` is the wrapper's value with every kind removed — valid JSON, drawn
   * as genuine JSON. A wrapper that holds only kinds has no residual piece.
   */
  | { type: "residual"; content: string; json: string };

function matchingJsonObjectEnd(source: string, start: number): number | null {
  if (source[start] !== "{" && source[start] !== "[") return null;

  const stack: string[] = [source[start]];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }
    if (char !== "}" && char !== "]") continue;

    const opening = stack.pop();
    if (
      (char === "}" && opening !== "{") ||
      (char === "]" && opening !== "[")
    ) {
      return null;
    }
    if (stack.length === 0) return index + 1;
  }

  return null;
}

function skipWhitespace(source: string, cursor: number): number {
  while (/\s/.test(source[cursor] ?? "")) cursor++;
  return cursor;
}

function jsonStringEnd(source: string, start: number): number | null {
  if (source[start] !== '"') return null;

  let escaped = false;
  for (let cursor = start + 1; cursor < source.length; cursor++) {
    const char = source[cursor];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      return cursor + 1;
    }
  }
  return null;
}

function jsonValueEnd(source: string, start: number): number | null {
  const char = source[start];
  if (char === '"') return jsonStringEnd(source, start);
  if (char === "{" || char === "[") return matchingJsonObjectEnd(source, start);

  const end = source.slice(start).search(/[\s,}\]]/);
  const tokenEnd = end === -1 ? source.length : start + end;
  const token = source.slice(start, tokenEnd);
  return /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(
    token,
  )
    ? tokenEnd
    : null;
}

/**
 * Returns the structural boundary of an unfinished or malformed object whose
 * root directly declares `__kind`. That root owns all of its descendants even
 * though it cannot be promoted as a renderable JSON region itself.
 */
function malformedKindOwnerEnd(
  source: string,
  start: number,
  boundary = source.length,
): number | null {
  let cursor = skipWhitespace(source, start + 1);
  let kindFound = false;
  const ownerEnd = () => (kindFound ? boundary : null);

  while (cursor < boundary) {
    const keyStart = cursor;
    const keyEnd = jsonStringEnd(source, keyStart);
    if (keyEnd === null || keyEnd > boundary) return ownerEnd();

    let key: unknown;
    try {
      key = JSON.parse(source.slice(keyStart, keyEnd));
    } catch {
      return ownerEnd();
    }

    cursor = skipWhitespace(source, keyEnd);
    if (cursor >= boundary || source[cursor] !== ":") return ownerEnd();
    cursor = skipWhitespace(source, cursor + 1);

    const valueStart = cursor;
    const valueEnd = jsonValueEnd(source, valueStart);
    if (valueEnd === null || valueEnd > boundary) return ownerEnd();

    if (key === "__kind") {
      try {
        const value = JSON.parse(source.slice(valueStart, valueEnd));
        kindFound ||= typeof value === "string" && value.trim().length > 0;
      } catch {
        return ownerEnd();
      }
    }

    cursor = skipWhitespace(source, valueEnd);
    if (source[cursor] === "}") return kindFound ? cursor + 1 : null;
    if (cursor >= boundary || source[cursor] !== ",") return ownerEnd();
    cursor = skipWhitespace(source, cursor + 1);
  }

  return ownerEnd();
}

/** String literals in a valid anonymous JSON wrapper are never regions. */
function jsonStringRanges(
  source: string,
  start: number,
  end: number,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let cursor = start; cursor < end; cursor++) {
    if (source[cursor] !== '"') continue;
    const stringEnd = jsonStringEnd(source, cursor);
    if (stringEnd === null || stringEnd > end) break;
    ranges.push([cursor, stringEnd]);
    cursor = stringEnd - 1;
  }
  return ranges;
}

function declaredKind(candidate: string): string | null {
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const kind = (parsed as Record<string, unknown>).__kind;
    return typeof kind === "string" && kind.trim() ? kind : null;
  } catch {
    return null;
  }
}

/**
 * Literal markdown/XML regions do not grant embedded JSON a new render owner:
 * code (fences and spans, by THE one code-range rule — @ai-matrx/content-ir/
 * source; an unpaired backtick is text, never "literal to the end"), HTML
 * comments, CDATA and XML tags.
 */
function literalRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const code = findCodeRanges(source);
  let next = 0;
  let cursor = 0;
  while (cursor < source.length) {
    while (next < code.length && code[next]!.start < cursor) next++;
    const range = code[next];
    if (range && range.start === cursor) {
      ranges.push([range.start, range.end]);
      cursor = range.end;
      next++;
      continue;
    }
    if (source.startsWith("<!--", cursor)) {
      const end = source.indexOf("-->", cursor + 4);
      const rangeEnd = end === -1 ? source.length : end + 3;
      ranges.push([cursor, rangeEnd]);
      cursor = rangeEnd;
      continue;
    }
    if (source.startsWith("<![CDATA[", cursor)) {
      const end = source.indexOf("]]>", cursor + 9);
      const rangeEnd = end === -1 ? source.length : end + 3;
      ranges.push([cursor, rangeEnd]);
      cursor = rangeEnd;
      continue;
    }
    if (source[cursor] === "<") {
      const tag = readXmlTag(source, cursor);
      if (tag) {
        const end = cursor + tag.raw.length;
        ranges.push([cursor, end]);
        cursor = end;
        continue;
      }
    }
    cursor++;
  }
  return ranges;
}

/** Outermost complete self-described objects, in source order. */
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

export function findEmbeddedKindJsonRegions(
  source: string,
  options: { excludeLiteralContexts?: boolean } = {},
): EmbeddedKindJsonRegion[] {
  const regions: EmbeddedKindJsonRegion[] = [];
  const excluded = options.excludeLiteralContexts ? literalRanges(source) : [];
  const jsonStrings: Array<[number, number]> = [];
  let excludedIndex = 0;
  let jsonStringIndex = 0;

  for (let start = frontMatterEnd(source); start < source.length; start++) {
    while (
      excludedIndex < excluded.length &&
      excluded[excludedIndex][1] <= start
    ) {
      excludedIndex++;
    }
    while (
      jsonStringIndex < jsonStrings.length &&
      jsonStrings[jsonStringIndex][1] <= start
    ) {
      jsonStringIndex++;
    }
    if (
      excludedIndex < excluded.length &&
      start >= excluded[excludedIndex][0] &&
      start < excluded[excludedIndex][1]
    )
      continue;
    if (
      jsonStringIndex < jsonStrings.length &&
      start >= jsonStrings[jsonStringIndex][0] &&
      start < jsonStrings[jsonStringIndex][1]
    )
      continue;
    if (source[start] !== "{") continue;
    const end = matchingJsonObjectEnd(source, start);
    if (end === null) {
      const ownerEnd = malformedKindOwnerEnd(source, start);
      if (ownerEnd !== null) start = ownerEnd - 1;
      continue;
    }

    const content = source.slice(start, end);
    const kind = declaredKind(content);
    if (!kind) {
      const ownerEnd = malformedKindOwnerEnd(source, start, end);
      if (ownerEnd !== null) {
        start = ownerEnd - 1;
        continue;
      }
      // A loop, never a spread: a JSON value with ~100k strings overflowed the
      // call stack (RangeError on a stored chat row — the splitter crashed).
      for (const range of jsonStringRanges(source, start, end)) jsonStrings.push(range);
      continue;
    }

    regions.push({ start, end, content, kind });
    start = end - 1;
  }

  return regions;
}

/**
 * The array punctuation around runs of kinds: for every run of regions joined
 * only by commas, opened by a `[` (the last non-space byte before the run) and
 * closed by a `]` (the first one after it), the spans `[…`, `,` and `…]` are
 * chrome. Returned as [start, end) spans, in order.
 */
function kindArrayChromeSpans(
  source: string,
  regions: EmbeddedKindJsonRegion[],
): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let first = 0;
  while (first < regions.length) {
    let last = first;
    while (
      last + 1 < regions.length &&
      /^\s*,\s*$/.test(source.slice(regions[last]!.end, regions[last + 1]!.start))
    ) {
      last++;
    }
    const before = source.slice(0, regions[first]!.start);
    const open = /\[\s*$/.exec(before);
    const after = source.slice(regions[last]!.end);
    const close = /^\s*\]/.exec(after);
    if (open && close) {
      spans.push([open.index, regions[first]!.start]);
      for (let k = first; k < last; k++) {
        spans.push([regions[k]!.end, regions[k + 1]!.start]);
      }
      spans.push([regions[last]!.end, regions[last]!.end + close[0].length]);
    }
    first = last + 1;
  }
  return spans;
}

/** True when a value is a JSON object that directly declares a non-empty `__kind`. */
function isKindValue(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const kind = (value as Record<string, unknown>).__kind;
  return typeof kind === "string" && kind.trim().length > 0;
}

/** The value with every kind object removed (array items and object members). */
function withoutKinds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((item) => !isKindValue(item)).map(withoutKinds);
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!isKindValue(item)) out[key] = withoutKinds(item);
    }
    return out;
  }
  return value;
}

/** Whether anything but empty containers is left. */
function carriesData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(carriesData);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(carriesData);
  }
  return true;
}

/** Only braces, brackets, commas, colons, whitespace and object KEYS. */
function isPureJsonStructure(span: string): boolean {
  return /^[\s{}[\],:]*$/.test(
    span.replace(/"(?:[^"\\]|\\.)*"\s*:/g, ""),
  );
}

/**
 * A container that is, as a whole, a JSON object or array holding kinds (A7):
 * every non-kind span is chrome, and the wrapper's own data — the value with
 * its kinds removed — rides ONE residual piece at the first span that carries
 * any. Null when the source is not a parseable JSON wrapper.
 */
function wrapperPieces(
  source: string,
  regions: EmbeddedKindJsonRegion[],
): EmbeddedKindJsonPiece[] | null {
  const trimmed = source.trim();
  if (!/^[[{]/.test(trimmed)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || isKindValue(parsed)) {
    return null;
  }
  const residual = withoutKinds(parsed);
  const residualJson = carriesData(residual) ? JSON.stringify(residual, null, 2) : null;

  const pieces: EmbeddedKindJsonPiece[] = [];
  let residualPlaced = residualJson === null;
  const pushSpan = (content: string) => {
    if (!content) return;
    if (!residualPlaced && !isPureJsonStructure(content)) {
      pieces.push({ type: "residual", content, json: residualJson as string });
      residualPlaced = true;
      return;
    }
    pieces.push({ type: "chrome", content });
  };
  let cursor = 0;
  for (const region of regions) {
    pushSpan(source.slice(cursor, region.start));
    pieces.push({ type: "kind", content: region.content, kind: region.kind });
    cursor = region.end;
  }
  pushSpan(source.slice(cursor));
  if (!residualPlaced) {
    // Data the scan could not pin to a span (it sits between keys only):
    // still shown, after the kinds.
    pieces.push({ type: "residual", content: "", json: residualJson as string });
  }
  return pieces;
}

/** Losslessly partition a container around every recovered kind region. */
export function splitAroundEmbeddedKindJson(
  source: string,
  options: { excludeLiteralContexts?: boolean } = {},
): EmbeddedKindJsonPiece[] {
  const regions = findEmbeddedKindJsonRegions(source, options);
  if (regions.length === 0) return [{ type: "container", content: source }];

  const wrapped = wrapperPieces(source, regions);
  if (wrapped) return wrapped;

  // Every boundary in order: kind regions and chrome spans never overlap.
  const marks: Array<
    { start: number; end: number } & (
      | { type: "kind"; kind: string }
      | { type: "chrome" }
    )
  > = [
    ...regions.map((r) => ({ start: r.start, end: r.end, type: "kind" as const, kind: r.kind })),
    ...kindArrayChromeSpans(source, regions).map(([start, end]) => ({
      start,
      end,
      type: "chrome" as const,
    })),
  ].sort((a, b) => a.start - b.start);

  const pieces: EmbeddedKindJsonPiece[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start > cursor) {
      pieces.push({
        type: "container",
        content: source.slice(cursor, mark.start),
      });
    }
    if (mark.end > mark.start) {
      pieces.push(
        mark.type === "kind"
          ? { type: "kind", content: source.slice(mark.start, mark.end), kind: mark.kind }
          : { type: "chrome", content: source.slice(mark.start, mark.end) },
      );
    }
    cursor = Math.max(cursor, mark.end);
  }
  if (cursor < source.length) {
    pieces.push({ type: "container", content: source.slice(cursor) });
  }
  return pieces;
}

/**
 * A recovered PROSE piece, shaped exactly as the live stream shapes the same
 * bytes (A5, 2026-09-30): the stream splits `Here: {"__kind":…} after` into
 * three lines as it arrives, so its prose blocks are trimmed at the end (every
 * text block is) and, after a kind, start where the next character does — the
 * spaces after the object and the one line break that ended its line are the
 * boundary, not content. Both hosts call this on every text piece, so a live
 * message and its reload draw the same blocks.
 */
export function normalizeRecoveredProsePiece(
  content: string,
  followsKind: boolean,
): string {
  const start = followsKind ? content.replace(/^[ \t]*(?:\r?\n)?/, "") : content;
  return start.trimEnd();
}
