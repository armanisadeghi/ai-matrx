"use client";

/** The body of a `workbook-history` canvas tab. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { WorkbookHistoryViewer } from "@/features/workbooks/components/WorkbookHistoryViewer";
import { readHistoryTab } from "@/lib/univer/historyKinds";

export default function WorkbookHistoryCanvasView({ data }: CanvasKindProps) {
  const tab = readHistoryTab(data);
  if (!tab) return null;
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background p-3">
      <WorkbookHistoryViewer workbookId={tab.id} editable={tab.editable} />
    </div>
  );
}
