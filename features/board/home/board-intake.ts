/**
 * What a paste or a drop becomes on a board (pure). Files are uploaded by the
 * file item type (`items/file-drop.ts`); everything else is routed here:
 *   a web address  → a web page tile (an image address → an image tile);
 *   any other text → a new Note seeded with that text (a real Note in Notes).
 * Several lines that are each a web address become one tile per address.
 */

import type { PlacedItem } from "../items/types";
import { looksLikeImageUrl, parseWebUrl } from "../items/web-address";

const MAX_URLS = 12;

export function intakeText(text: string): PlacedItem[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const urls = lines.map(asAddress);
  if (urls.every((u): u is URL => u !== null) && urls.length <= MAX_URLS) {
    return urls.map((url) =>
      looksLikeImageUrl(url)
        ? { title: url.pathname.split("/").pop() || url.hostname, source: { kind: "image", url: url.href } }
        : { title: url.hostname, source: { kind: "html", url: url.href } },
    );
  }
  const firstLine = lines[0].slice(0, 80);
  return [{ title: firstLine || "Note", source: { kind: "entity", entity: "note", id: null, meta: { seed: trimmed } } }];
}

/** A line that is a web address and nothing else ("hello" is text, not a host). */
function asAddress(line: string): URL | null {
  if (/\s/.test(line)) return null;
  const url = parseWebUrl(line);
  return url && (url.hostname.includes(".") || url.hostname === "localhost") ? url : null;
}
