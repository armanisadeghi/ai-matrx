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

export interface EmbeddedKindJsonRegion {
  start: number;
  end: number;
  content: string;
  kind: string;
}

export type EmbeddedKindJsonPiece =
  | { type: "container"; content: string }
  | { type: "kind"; content: string; kind: string };

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

/** Literal markdown/XML regions do not grant embedded JSON a new render owner. */
function literalRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let fence: { start: number; char: "`" | "~"; ticks: number } | null = null;
  let cursor = 0;
  const lineEndAt = (offset: number) => {
    const newline = source.indexOf("\n", offset);
    return newline === -1 ? source.length : newline;
  };
  while (cursor < source.length) {
    const lineStart = cursor === 0 || source[cursor - 1] === "\n";
    const lineEnd = fence || lineStart ? lineEndAt(cursor) : cursor;
    if (fence) {
      const line = source.slice(cursor, lineEnd);
      const marker = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line);
      if (
        marker &&
        marker[1][0] === fence.char &&
        marker[1].length >= fence.ticks &&
        marker[2].trim() === ""
      ) {
        ranges.push([
          fence.start,
          lineEnd < source.length ? lineEnd + 1 : lineEnd,
        ]);
        fence = null;
      }
      cursor = lineEnd < source.length ? lineEnd + 1 : lineEnd;
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
    // Fence openings exist only at a physical line start (after indentation).
    if (lineStart) {
      const marker = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(
        source.slice(cursor, lineEnd),
      );
      if (marker) {
        fence = {
          start: cursor,
          char: marker[1][0] as "`" | "~",
          ticks: marker[1].length,
        };
        cursor = lineEnd < source.length ? lineEnd + 1 : lineEnd;
        continue;
      }
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
    if (source[cursor] === "`") {
      let markerEnd = cursor;
      while (source[markerEnd] === "`") markerEnd++;
      let slashes = 0;
      for (let slash = cursor - 1; source[slash] === "\\"; slash--) slashes++;
      if (slashes % 2 === 0) {
        const ticks = markerEnd - cursor;
        let close = markerEnd;
        while (close < source.length) {
          if (source[close] !== "`") {
            close++;
            continue;
          }
          let closeEnd = close;
          while (source[closeEnd] === "`") closeEnd++;
          if (closeEnd - close === ticks) break;
          close = closeEnd;
        }
        const rangeEnd = close >= source.length ? source.length : close + ticks;
        ranges.push([cursor, rangeEnd]);
        cursor = rangeEnd;
        continue;
      }
    }
    cursor++;
  }
  if (fence) ranges.push([fence.start, source.length]);
  return ranges;
}

/** Outermost complete self-described objects, in source order. */
export function findEmbeddedKindJsonRegions(
  source: string,
  options: { excludeLiteralContexts?: boolean } = {},
): EmbeddedKindJsonRegion[] {
  const regions: EmbeddedKindJsonRegion[] = [];
  const excluded = options.excludeLiteralContexts ? literalRanges(source) : [];
  const jsonStrings: Array<[number, number]> = [];
  let excludedIndex = 0;
  let jsonStringIndex = 0;

  for (let start = 0; start < source.length; start++) {
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
      jsonStrings.push(...jsonStringRanges(source, start, end));
      continue;
    }

    regions.push({ start, end, content, kind });
    start = end - 1;
  }

  return regions;
}

/** Losslessly partition a container around every recovered kind region. */
export function splitAroundEmbeddedKindJson(
  source: string,
  options: { excludeLiteralContexts?: boolean } = {},
): EmbeddedKindJsonPiece[] {
  const regions = findEmbeddedKindJsonRegions(source, options);
  if (regions.length === 0) return [{ type: "container", content: source }];

  const pieces: EmbeddedKindJsonPiece[] = [];
  let cursor = 0;
  for (const region of regions) {
    if (region.start > cursor) {
      pieces.push({
        type: "container",
        content: source.slice(cursor, region.start),
      });
    }
    pieces.push({ type: "kind", content: region.content, kind: region.kind });
    cursor = region.end;
  }
  if (cursor < source.length) {
    pieces.push({ type: "container", content: source.slice(cursor) });
  }
  return pieces;
}
