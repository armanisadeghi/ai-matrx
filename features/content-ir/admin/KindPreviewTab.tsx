"use client";

/**
 * Preview tab — thin admin wrapper over the shared example-preview engine
 * (`features/content-ir/studio/components/KindExamplePreview.tsx`, extracted
 * from this file when the user-facing Shapes studio landed). The engine
 * renders `kind_example` rows through the REAL production path
 * (envelopeFromCompleteValue → metadata.__ir → SafeBlockRenderer →
 * applyIrKindRoute); this wrapper only supplies the admin empty-state copy
 * and the path footnote.
 */

import KindExamplePreview from "@/features/content-ir/studio/components/KindExamplePreview";
import type { ExamplesState } from "@/features/content-ir/studio/kind-examples";

interface KindPreviewTabProps {
  kind: string;
  examples: ExamplesState;
}

export default function KindPreviewTab({ kind, examples }: KindPreviewTabProps) {
  return (
    <KindExamplePreview
      kind={kind}
      examples={examples}
      showPathFootnote
      emptyState={
        <div className="rounded-md border border-border bg-card px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            No examples for this kind yet.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Author a canonical <code className="font-mono">kind_example</code>{" "}
            row (R4) — nothing renders here until a real sample exists.
          </p>
        </div>
      }
    />
  );
}
