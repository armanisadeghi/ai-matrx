"use client";

// features/scopes/components/PartialValueBadge.tsx
//
// THE "PARTIAL" STATE OF A SCOPE VALUE (lane 9 SCOPES-ON-THE-STORE, D-LAST, 2026-10-02).
// A value over the store's 100,000-byte ceiling is kept as a file; when the web could not read
// that file whole (gone, size or SHA-256 mismatch, no Web Crypto, still being saved) the cell holds
// only its first words and carries `value_incomplete` (service/storeScopeReads.ts). Every editor
// that shows such a cell shows this badge, so nobody mistakes the start for the whole value — and
// the one write path refuses to save it back (utils/incompleteValue.ts).

import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/official/InfoHint";
import type { IncompleteValue } from "@/features/scopes/utils/incompleteValue";

/** The tooltip (≤ 140 chars, one sentence): what the person sees and what saving needs. */
export const PARTIAL_VALUE_HINT = "Only the start loaded. Saving needs the whole text pasted in.";

export function PartialValueBadge({ incomplete }: { incomplete: IncompleteValue | null | undefined }) {
  if (!incomplete) return null;
  return (
    <span className="inline-flex items-center gap-1" data-testid="scope-value-partial">
      <Badge
        variant="outline"
        className="text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-400"
      >
        Partial
      </Badge>
      <InfoHint text={PARTIAL_VALUE_HINT} label="Why partial" />
    </span>
  );
}
