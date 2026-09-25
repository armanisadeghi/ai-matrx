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
        {/* Edits the page body source (content.html) — the one file every
            other tab and Publish build from. This used to call a
            `getCurrentHtmlContent` / `setEditedCompleteHtml` the state never
            had (hidden by `as any`): the editor opened empty and every edit
            was silently dropped. */}
        <SmallCodeEditor
          language="html"
          initialCode={state.contentHtml}
          onChange={(newCode) => {
            if (newCode !== undefined) actions.setContentHtml(newCode);
          }}
          height={editorWrapperHeight ? `${editorWrapperHeight}px` : undefined}
        />
      </div>
    </div>
  );
}
