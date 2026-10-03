"use client";

/** The body of a cloud-file-editor canvas tab: the existing CloudFileInlineEditor. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { CloudFileInlineEditor } from "@/features/files/components/core/FileEditor/CloudFileInlineEditor";
import { readCloudFileEditorTab } from "./cloudFileEditorKind";

export default function CloudFileEditorCanvasView({ data }: CanvasKindProps) {
  const tab = readCloudFileEditorTab(data);
  if (!tab) return null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <CloudFileInlineEditor fileId={tab.fileId} className="h-full w-full" />
    </div>
  );
}
