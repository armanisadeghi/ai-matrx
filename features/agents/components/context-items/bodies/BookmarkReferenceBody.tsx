"use client";

/**
 * Drawer body for `input_table` / `input_list` attachments. Each bookmark is a
 * canonical reference item, so this maps them through
 * `bookmarksToReferenceEnvelopes` and renders the SAME live `ReferenceRenderer`
 * the in-content matrx fences use — chips that resolve their value from Supabase
 * and open the underlying table / list on click. No bespoke table/list preview.
 *
 * Reads bookmarks from every representation it can arrive in:
 *   - a post-submit block          → `raw.data.bookmarks`
 *   - a pre-submit resource bag    → `raw.bookmarks`
 *   - a single table/list resource → `raw` IS one bookmark-shaped object
 * (each normalized to an array). `bookmarkToReference` ignores anything that
 * isn't a known bookmark type, so over-broad input is safe.
 */

import type { ContextItemBodyProps } from "../types";
import { bookmarksToReferenceEnvelopes } from "@/features/matrx-envelope/bookmarkToReference";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";

function asBookmarkArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return null;
}

function extractBookmarks(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;

  // 1. Post-submit block: raw.data.bookmarks.
  const data = r.data;
  if (data && typeof data === "object") {
    const fromData = asBookmarkArray((data as Record<string, unknown>).bookmarks);
    if (fromData) return fromData;
  }

  // 2. Pre-submit resource bag: raw.bookmarks.
  const fromBag = asBookmarkArray(r.bookmarks);
  if (fromBag) return fromBag;

  // 3. The source IS a single bookmark-shaped object (e.g. TableResourceData).
  if (typeof r.type === "string") return [r];

  return [];
}

export function BookmarkReferenceBody({ item }: ContextItemBodyProps) {
  const envelopes = bookmarksToReferenceEnvelopes(extractBookmarks(item.raw));

  if (envelopes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs italic text-muted-foreground">
          No references attached.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 space-y-2 overflow-y-auto p-4">
      {envelopes.map((env, i) => (
        <MatrxEnvelopeBlock key={`${env.type}-${i}`} content={env} />
      ))}
    </div>
  );
}
