/**
 * Recover complete self-described kind objects from ANY containing text.
 *
 * Markdown, code fences, and XML are arrival containers, not type authority.
 * Once a complete JSON object directly declares a non-empty `__kind`, that
 * object is its own Content IR region even when an outer parser already
 * classified the surrounding bytes as code, XML, or prose.
 *
 * The scanner is deliberately syntax-agnostic about the OUTER container. It
 * only promotes candidates that independently pass JSON.parse and carry a
 * direct string discriminator. Failed/malformed candidates remain untouched.
 */

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
  if (source[start] !== "{") return null;

  const stack: string[] = ["{"];
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

function declaredKind(candidate: string): string | null {
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const kind = (parsed as Record<string, unknown>).__kind;
    return typeof kind === "string" && kind.trim() ? kind : null;
  } catch {
    return null;
  }
}

/** Outermost complete self-described objects, in source order. */
export function findEmbeddedKindJsonRegions(
  source: string,
): EmbeddedKindJsonRegion[] {
  const regions: EmbeddedKindJsonRegion[] = [];

  for (let start = 0; start < source.length; start++) {
    if (source[start] !== "{") continue;
    const end = matchingJsonObjectEnd(source, start);
    if (end === null) continue;

    const content = source.slice(start, end);
    const kind = declaredKind(content);
    if (!kind) continue;

    regions.push({ start, end, content, kind });
    start = end - 1;
  }

  return regions;
}

/** Losslessly partition a container around every recovered kind region. */
export function splitAroundEmbeddedKindJson(
  source: string,
): EmbeddedKindJsonPiece[] {
  const regions = findEmbeddedKindJsonRegions(source);
  if (regions.length === 0) return [{ type: "container", content: source }];

  const pieces: EmbeddedKindJsonPiece[] = [];
  let cursor = 0;
  for (const region of regions) {
    if (region.start > cursor) {
      pieces.push({ type: "container", content: source.slice(cursor, region.start) });
    }
    pieces.push({ type: "kind", content: region.content, kind: region.kind });
    cursor = region.end;
  }
  if (cursor < source.length) {
    pieces.push({ type: "container", content: source.slice(cursor) });
  }
  return pieces;
}
