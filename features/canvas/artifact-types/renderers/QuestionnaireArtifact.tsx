"use client";

import React, { Suspense, lazy, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { separatedMarkdownParser } from "@/components/mardown-display/markdown-classification/processors/custom/parser-separated";
import {
  type ArtifactRendererProps,
  resolveMarkdownPayload,
} from "../artifact-renderers";
import { useArtifactState } from "../persistence/useArtifactState";

const QuestionnaireRenderer = lazy(
  () =>
    import("@/components/mardown-display/blocks/questionnaire/QuestionnaireRenderer"),
);

interface QuestionnaireState extends Record<string, unknown> {
  formState?: Record<string, unknown>;
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
  messageId,
  blockIndex,
  isStreamActive,
}: ArtifactRendererProps) {
  const { state, loaded, save } = useArtifactState<QuestionnaireState>(
    artifactId,
    "generic",
  );

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
  if (artifactId && !loaded) return <MatrxMiniLoader />;

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <QuestionnaireRenderer
        data={parsed}
        questionnaireId={
          artifactId ?? `questionnaire-${messageId}-${blockIndex ?? 0}`
        }
        initialState={state ?? undefined}
        onStateChange={save as (s: QuestionnaireState) => void}
      />
    </Suspense>
  );
}
