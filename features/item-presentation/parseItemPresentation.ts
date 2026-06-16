/**
 * Tolerant extractor for the item_presentation payload.
 *
 * The whole point of this block is to look great INSTANTLY — before the JSON
 * fence has even closed. So we never hard-require a full parse:
 *   1. Try a real JSON parse (the happy, complete-stream path).
 *   2. Fall back to a per-key regex scan that pulls `type` / `id` / `name` /
 *      `about` out of partial, still-streaming text.
 *
 * This is what lets enrichment fire "the moment we have the type + id".
 */

import type { ItemPresentationPayload } from "./types";

/** Pull a string value for `key` out of a (possibly partial) JSON string. */
function scanString(raw: string, key: string): string | undefined {
  // Matches  "key" : "value"  with escaped-quote tolerance, value optional-terminated.
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "i");
  const m = raw.match(re);
  if (!m) return undefined;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1];
  }
}

export function parseItemPresentation(content: string): {
  payload: ItemPresentationPayload;
  complete: boolean;
} {
  const raw = content
    .trim()
    .replace(/```+\s*$/, "")
    .trim();

  // 1. Full parse (complete stream).
  try {
    const parsed = JSON.parse(raw);
    const ip = parsed?.item_presentation ?? parsed;
    if (ip && typeof ip === "object") {
      return {
        payload: {
          id: typeof ip.id === "string" ? ip.id : undefined,
          type: typeof ip.type === "string" ? ip.type : undefined,
          name: typeof ip.name === "string" ? ip.name : undefined,
          about: typeof ip.about === "string" ? ip.about : undefined,
        },
        complete: true,
      };
    }
  } catch {
    // fall through to tolerant scan
  }

  // 2. Tolerant per-key scan (partial / streaming).
  return {
    payload: {
      id: scanString(raw, "id"),
      type: scanString(raw, "type"),
      name: scanString(raw, "name"),
      about: scanString(raw, "about"),
    },
    complete: false,
  };
}
