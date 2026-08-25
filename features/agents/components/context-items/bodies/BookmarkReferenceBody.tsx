"use client";

/**
 * Drawer body for `input_table` / `input_list` attachments. Each bookmark is a
 * canonical reference item, so this maps them through
 * `bookmarksToReferenceDirectives` and renders the SAME live `ReferenceRenderer`
 * the in-content matrx fences use — chips that resolve their value from Supabase
 * and open the underlying table / list on click. No bespoke table/list preview.
 *
 * The canonical attachment projection validates and places exactly one
 * bookmark on each drawer item. This body never shape-sniffs raw payloads.
 */

import type { ContextItemBodyProps } from "../types";
import { bookmarksToReferenceDirectives } from "@/features/matrx-envelope/bookmarkToReference";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";

export function BookmarkReferenceBody({ item }: ContextItemBodyProps) {
  const directives = bookmarksToReferenceDirectives(item.refs.bookmarks ?? []);

  if (directives.length === 0) {
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
      {directives.map((directive, i) => (
        <MatrxEnvelopeBlock
          key={`${directive.slug}-${i}`}
          content={directive.shell}
        />
      ))}
    </div>
  );
}
