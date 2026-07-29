"use client";

import { Suspense, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { safeJsonParse } from "@/components/mardown-display/chat-markdown/block-registry/json-parse-utils";
import { resolveJsonPayload, artifactDedupKey } from "../artifact-renderers";
import MultipleChoiceQuiz from "@/components/mardown-display/blocks/quiz/MultipleChoiceQuiz";
import type { ArtifactRendererProps } from "../types";
// Default export at components/mardown-display/blocks/quiz/MultipleChoiceQuiz.tsx
// Props: quizData, taskId?, conversationId?, messageId?, blockIndex?, sessionId?,
//        enableAutoSave?, autoSaveInterval?, showCanvasButton?, className?
/**
 * Unified renderer for `quiz` (canvasType "quiz") artifacts.
 *
 * Payload shape: `{ quizTitle, category, multipleChoice: [...] }` (camelCase from
 * Python) or `{ quiz_title, multiple_choice: [...] }` (legacy LLM fences).
 * `parseQuizJSON` normalises both before render.
 *
 * Passes conversationId / messageId / blockIndex through so the component's
 * `useMessageBlockPersistence` can round-trip quiz state back into the DB — the
 * same persistence path BlockRenderer uses for in-chat quiz blocks.
 */
export default function QuizArtifact(props: ArtifactRendererProps) {
  const {
    raw,
    data,
    serverData,
    isStreamActive,
    taskId,
    artifactId,
    conversationId,
    messageId,
  } = props;

  const blockIndex = (props as { blockIndex?: number }).blockIndex;

  const payload = useMemo(
    () =>
      resolveJsonPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: (s) => safeJsonParse(s),
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!payload) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <MultipleChoiceQuiz
        quizData={payload as any}
        taskId={artifactDedupKey(taskId, artifactId)}
        conversationId={conversationId}
        messageId={messageId}
        blockIndex={blockIndex}
      />
    </Suspense>
  );
}
