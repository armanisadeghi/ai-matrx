"use client";

// features/mandates/record-next/MandateTryResultView.tsx
//
// ONE settled mandate answer, drawn by the platform's real renderers — never a
// JSON dump (the admin bench's `OutputPreview` prints `JSON.stringify`; that is
// fine for an admin comparing columns, wrong for a person trying their job).
//
//   structured answer + output kind → the kind's own component
//                                     (`KindInstanceRender`), whose floor is
//                                     `StructuredValueView`;
//   structured answer, no kind      → `StructuredValueView`;
//   a file URL                      → `InlineMediaRef` (durable file id);
//   text                            → `MarkdownStream` (settled content).

import MarkdownStream from "@/components/MarkdownStream";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { InlineMediaRef } from "@ai-matrx/media/react";
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";

export function MandateTryResultView({
  output,
  artifact,
  outputKind,
}: {
  output: string;
  artifact: unknown;
  outputKind: string | null;
}) {
  if (artifact != null && typeof artifact === "object") {
    return outputKind ? (
      <KindInstanceRender
        kind={outputKind}
        value={artifact}
        showRoutingNote={false}
        variant="bare"
        unroutableFallback={<StructuredValueView value={artifact} kind={outputKind} />}
      />
    ) : (
      <StructuredValueView value={artifact} />
    );
  }
  const text = output.trim();
  const fileId = text ? fileIdFromUserFilesUrl(text) : null;
  if (fileId) return <InlineMediaRef ref={fileId} size="xl" fit="cover" />;
  if (!text) {
    return <p className="text-sm text-muted-foreground">The run finished with an empty answer.</p>;
  }
  return <MarkdownStream imagePolicy="ai" content={text} hideCopyButton={false} />;
}
