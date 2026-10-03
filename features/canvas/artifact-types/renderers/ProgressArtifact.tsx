"use client";

import { Suspense, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseProgressMarkdown } from "@/components/mardown-display/blocks/progress/parseProgressMarkdown";
import {
  resolveMarkdownPayload,
  artifactDedupKey,
} from "../artifact-renderers";
import { useArtifactState } from "../persistence/useArtifactState";
import type { ProgressTrackerState } from "@/components/mardown-display/blocks/progress/ProgressTrackerBlock";
import ProgressTrackerBlock from "@/components/mardown-display/blocks/progress/ProgressTrackerBlock";
import type { ArtifactRendererProps } from "../types";
/**
 * Unified renderer for `progress` (progress_tracker) artifacts — the ONE
 * renderer used by chat, canvas, and artifact-card surfaces. Resolves the
 * payload (serverData ?? canvas object ?? parsed raw markdown) and renders the
 * real ProgressTrackerBlock.
 */
export default function ProgressArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  isStreamActive,
  conversationId,
  messageId,
  blockIndex,
}: ArtifactRendererProps) {
  const tracker = useMemo(
    () =>
      resolveMarkdownPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: parseProgressMarkdown,
      }),
    [serverData, data, raw, isStreamActive],
  );

  // Answer state also rides the next message as one interaction chip (the
  // shape interaction seam); view state never does.
  const { state, loaded, save } = useArtifactState<
    ProgressTrackerState & Record<string, unknown>
  >(artifactId, "generic", undefined, undefined, {
    kind: "progress",
    title: (tracker as { title?: string } | null)?.title ?? null,
    conversationId,
    messageId,
    blockIndex,
    data: tracker,
  });

  if (!tracker) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  // Wait for persisted state to load before rendering so initialState seeds correctly.
  if (artifactId && !loaded) {
    return <MatrxMiniLoader />;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <ProgressTrackerBlock
        tracker={tracker}
        taskId={artifactDedupKey(taskId, artifactId)}
        artifactId={artifactId}
        conversationId={conversationId}
        messageId={messageId}
        blockIndex={blockIndex}
        initialState={state ?? undefined}
        onStateChange={save as (state: ProgressTrackerState) => void}
      />
    </Suspense>
  );
}
