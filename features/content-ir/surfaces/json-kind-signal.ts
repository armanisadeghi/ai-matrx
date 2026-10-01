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

export type JsonKindSignal = "undecided" | "kind" | "not_kind";

/**
 * A pathological first key (or a region that is only whitespace and brackets)
 * must not hold a loader forever — past this, an undecided region is treated
 * as JSON so its content is never hidden behind a lid.
 */
const UNDECIDED_LIMIT_CHARS = 2000;

/** A `"__kind"` KEY (not an escaped occurrence inside a string value). */
const KIND_KEY = /(?<!\\)"__kind"\s*:/;

export function hasKindKey(text: string): boolean {
  return KIND_KEY.test(text);
}

const KIND_SLUG = /(?<!\\)"__kind"\s*:\s*"([A-Za-z0-9_.:-]+)"/;

/**
 * The first complete `__kind` slug in the text, or null. For a LOADER only —
 * which kind's skeleton to show while the region arrives. Never an identity:
 * the parser owns which kind a region actually is.
 */
export function firstKindSlug(text: string): string | null {
  return KIND_SLUG.exec(text)?.[1] ?? null;
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
    if (source[i] !== "{") return "not_kind";
  }
  if (source[i] !== "{") return "not_kind";

  i = skipWs(source, i + 1);
  if (i >= source.length) return capped(source);
  if (source[i] !== '"') return "not_kind"; // `{}` or not an object key

  // Read the first key, honouring escapes; unterminated → still arriving.
  let j = i + 1;
  while (j < source.length) {
    const ch = source[j];
    if (ch === "\\") {
      j += 2;
      continue;
    }
    if (ch === '"') {
      const key = source.slice(i + 1, j);
      return key === "__kind" ? "kind" : "not_kind";
    }
    j++;
  }
  return capped(source);
}

function capped(source: string): JsonKindSignal {
  return source.length > UNDECIDED_LIMIT_CHARS ? "not_kind" : "undecided";
}

function skipWs(source: string, from: number): number {
  let i = from;
  while (i < source.length && /\s/.test(source[i])) i++;
  return i;
}
