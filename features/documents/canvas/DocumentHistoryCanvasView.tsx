"use client";

/** The body of a `document-history` canvas tab. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { DocumentHistoryViewer } from "@/features/documents/components/DocumentHistoryViewer";
import { readHistoryTab } from "@/lib/univer/historyKinds";

export default function DocumentHistoryCanvasView({ data }: CanvasKindProps) {
  const tab = readHistoryTab(data);
  if (!tab) return null;
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background p-3">
      <DocumentHistoryViewer documentId={tab.id} editable={tab.editable} />
    </div>
  );
}
