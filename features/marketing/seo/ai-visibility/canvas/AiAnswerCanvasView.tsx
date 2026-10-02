"use client";

/**
 * The body of an `ai-visibility-answer` tab: the answer through the ONE
 * rendering engine's front door (`RichDocument`), which brings copy and the
 * rest of the document actions with it.
 */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { readAiAnswerData } from "./aiAnswerKind";

export default function AiAnswerCanvasView({ data }: CanvasKindProps) {
  const answer = readAiAnswerData(data);
  if (!answer) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        No answer in this tab.
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-3xl px-5 py-4">
        {answer.model ? (
          <p className="mb-3 truncate text-xs text-muted-foreground">{answer.model}</p>
        ) : null}
        <RichDocument
          content={answer.answer}
          source={{ type: "raw", title: `${answer.engine} answer` }}
          imagePolicy="ai"
          className="text-sm leading-relaxed"
        />
      </div>
    </div>
  );
}
