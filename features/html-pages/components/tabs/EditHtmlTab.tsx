"use client";

import React from "react";
import { useMeasure } from "@/hooks/usehooks";
import SmallCodeEditor from "@/features/code-editor/components/code-block/SmallCodeEditor";
import type { HtmlPreviewTabProps } from "../types";

export function EditHtmlTab({ state, actions }: HtmlPreviewTabProps) {
  const [editorWrapperRef, { height: editorWrapperHeight }] =
    useMeasure<HTMLDivElement>();

  return (
    <div className="h-full flex flex-col">
      <div
        ref={editorWrapperRef}
        className="flex-1 min-h-0 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden"
      >
        <SmallCodeEditor
          language="html"
          initialCode={(actions as any).getCurrentHtmlContent?.() || ""}
          onChange={(newCode) => {
            if (newCode) {
              (actions as any).setEditedCompleteHtml?.(newCode);
            }
          }}
          height={editorWrapperHeight ? `${editorWrapperHeight}px` : undefined}
        />
      </div>
    </div>
  );
}
