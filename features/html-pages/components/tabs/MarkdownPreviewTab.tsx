"use client";

import React from "react";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { ContentSource } from "@/features/rich-document/types";
import type { MarkdownTabProps } from "../types";

export function MarkdownPreviewTab({
  state,
  analysisData,
  messageId,
}: MarkdownTabProps) {
  return (
    <div className="w-full h-full overflow-auto bg-background dark:bg-background">
      <div className="flex justify-center min-h-full">
        <div className="max-w-[750px] w-full p-6 border-x-3 border-gray-500 dark:border-gray-500 shadow-sm min-h-full">
          <RichDocument
            content={state.currentMarkdown}
            source={{ type: "raw" } as ContentSource}
            contentClassName="bg-transparent dark:bg-transparent p-4"
            isStreamActive={false}
            analysisData={analysisData}
            messageId={messageId}
            allowFullScreenEditor={false}
            actionsVariant="icon-only"
            actionsPosition="top-right"
            actionsBehavior="hover-only"
            actions={{ exclude: ["announcements", "preferences"] }}
          />
        </div>
      </div>
    </div>
  );
}
