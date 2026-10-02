"use client";

/** The body of a `kg-source-preview` tab: the canonical source preview. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { SuggestionSourcePreview } from "./SuggestionSourcePreview";
import { readSourcePreviewData } from "./sourcePreviewKind";

export default function SourcePreviewCanvasView({ data }: CanvasKindProps) {
  const target = readSourcePreviewData(data);
  if (!target) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        This tab names no source.
      </div>
    );
  }
  return (
    <SuggestionSourcePreview
      kind={target.kind}
      id={target.id}
      snippet={target.snippet}
      title={target.title ?? null}
      className="h-full"
    />
  );
}
