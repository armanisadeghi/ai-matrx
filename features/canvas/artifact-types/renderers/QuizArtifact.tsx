"use client";

import { Suspense, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { safeJsonParse } from "@/components/mardown-display/chat-markdown/block-registry/json-parse-utils";
import { resolveJsonPayload, artifactDedupKey } from "../artifact-renderers";
import MultipleChoiceQuiz from "@/components/mardown-display/blocks/quiz/MultipleChoiceQuiz";
import { normalizeRawQuizJSON } from "@/components/mardown-display/blocks/quiz/quiz-parser";
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
 * Quiz progress is stored by the canonical quiz-session persistence hook.
 * Message content remains the immutable generated MessagePart history rather
 * than being patched with renderer-private state.
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
    blockIndex,
  } = props;

  const payload = useMemo(() => {
    const candidate = resolveJsonPayload<unknown>({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: (s) => safeJsonParse(s),
      });
    return normalizeRawQuizJSON(candidate);
  }, [serverData, data, raw, isStreamActive]);

  if (!payload) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <MultipleChoiceQuiz
        quizData={payload}
        taskId={artifactDedupKey(taskId, artifactId)}
        conversationId={conversationId}
        messageId={messageId}
        blockIndex={blockIndex}
      />
    </Suspense>
  );
}
