// features/rich-document/actions/sources/raw.ts
//
// Source adapter for raw / unstructured content. No edit / delete / re-run —
// raw sources are read-only by definition. instanceKey uses a short hash of
// the content so two distinct raw payloads on the same page don't collide.

import type { ContentSource, ContentSourceAdapter } from "../../types";

// Deterministic short string hash (FNV-1a). Used only for instance keys, never
// for security; collisions are tolerable at this scale.
// A document re-renders on every keystroke of its editor while its content is
// unchanged; hashing a megabyte twice per render was measurable typing lag in
// the Markdown Studio (2026-09-26). Long inputs remember their last few hashes
// (V8 caches a string's own hash, so the lookup is O(1) after the first).
const LONG_INPUT = 4096;
const recent = new Map<string, string>();

function shortHash(input: string): string {
  if (input.length >= LONG_INPUT) {
    const hit = recent.get(input);
    if (hit !== undefined) return hit;
    const computed = fnv1a(input);
    if (recent.size >= 8) recent.delete(recent.keys().next().value as string);
    recent.set(input, computed);
    return computed;
  }
  return fnv1a(input);
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const rawAdapter: ContentSourceAdapter = {
  instanceKeyPrefix: (source: ContentSource) => {
    if (source.type !== "raw") {
      throw new Error(
        `rawAdapter received non-raw source: ${source.type}`,
      );
    }
    // Raw sources have no identifier — derive a stable hash placeholder.
    // The actual content hash is appended at call time via instanceKey().
    return "raw";
  },
};

export { shortHash };
