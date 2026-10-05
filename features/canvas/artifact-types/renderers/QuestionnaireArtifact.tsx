"use client";

import { Suspense, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { separatedMarkdownParser } from "@/components/mardown-display/markdown-classification/processors/custom/parser-separated";
import { resolveMarkdownPayload } from "../artifact-renderers";
import { durableRecordId } from "@ai-matrx/kit/ids";
import { useBlockState } from "@/features/block-state/useBlockState";
import QuestionnaireRenderer from "@/components/mardown-display/blocks/questionnaire/QuestionnaireRenderer";
import type { ArtifactRendererProps } from "../types";
interface QuestionnaireState extends Record<string, unknown> {
  formState?: Record<string, unknown>;
  /** What the person submitted (the answers chip is derived from it). */
  submittedAnswers?: { question: string; answer: string }[];
  submittedTitle?: string | null;
}

/**
 * Unified renderer for `questionnaire` — an interactive form is durable,
 * referenceable content, so it materializes. The user's ANSWERS persist per
 * viewer to `canvas_item_state` via `useArtifactState` (keyed by the artifact
 * id) — NOT the old message-bound `_matrxState` — so they survive reload and the
 * agent sees them as context on the next turn. QuestionnaireRenderer parses its
 * own markdown payload; this adapter resolves it + wires the state channel.
 */
export default function QuestionnaireArtifact({
  raw,
  data,
  serverData,
  artifactId,
  conversationId,
  messageId,
  blockIndex,
  isStreamActive,
}: ArtifactRendererProps) {
  const { state, loaded, patch: save } = useBlockState<
    QuestionnaireState
  >({
    // The answers chip: derived from the saved state once the person has submitted.
    remark: (saved) => {
      const answers = (saved as QuestionnaireState).submittedAnswers;
      if (!conversationId || !messageId || !Array.isArray(answers) || answers.length === 0) return null;
      return {
        kind: "answers",
        target: { conversationId, messageId: durableRecordId(messageId) ?? null, blockIndex: blockIndex ?? null },
        title: (saved as QuestionnaireState).submittedTitle ?? null,
        answers,
      };
    },
  });

  const parsed = useMemo(
    () =>
      resolveMarkdownPayload<unknown>({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: separatedMarkdownParser,
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!parsed) return isStreamActive ? <MatrxMiniLoader /> : null;

  // Wait for persisted answers before rendering so initialState seeds correctly.
  if (!loaded) return <MatrxMiniLoader />;

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <QuestionnaireRenderer
        data={parsed}
        questionnaireId={
          artifactId ?? `questionnaire-${messageId}-${blockIndex ?? 0}`
        }
        conversationId={conversationId}
        messageId={messageId}
        blockIndex={blockIndex}
        initialState={state ?? undefined}
        onStateChange={save as (s: QuestionnaireState) => void}
      />
    </Suspense>
  );
}
