"use client";

/** Actions for a workflow document that already has its own kind renderer. */
import { useId } from "react";

import { RichDocumentActionProvider } from "@ai-matrx/rich-content/rich-document/RichDocumentActionProvider";
import { RichDocumentActionSurface } from "@ai-matrx/rich-content/rich-document/RichDocumentActionSurface";

/** Keep the existing kind component; give its document the Notes action bar. */
export function WorkflowDocumentActions({
  content,
}: {
  content: string | null;
}) {
  const surfaceId = useId();
  if (!content) return null;
  return (
    <div className="mt-2 border-t border-border/50 pt-2">
      <RichDocumentActionProvider
        content={content}
        source={{ type: "raw" }}
        surfaceId={surfaceId}
      />
      <RichDocumentActionSurface surfaceId={surfaceId} variant="mini-bar" />
    </div>
  );
}
