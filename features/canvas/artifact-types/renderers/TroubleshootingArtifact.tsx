"use client";

import { Suspense, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseTroubleshootingMarkdown } from "@/components/mardown-display/blocks/troubleshooting/parseTroubleshootingMarkdown";
import {
  artifactDedupKey,
  resolveMarkdownPayload,
} from "../artifact-renderers";
import { useBlockState } from "@/features/block-state/useBlockState";
import type { TroubleshootingState } from "@/components/mardown-display/blocks/troubleshooting/TroubleshootingBlock";
import TroubleshootingBlock from "@/components/mardown-display/blocks/troubleshooting/TroubleshootingBlock";
import type { ArtifactRendererProps } from "../types";
/**
 * Unified renderer for `troubleshooting` artifacts — the ONE renderer used by
 * chat, canvas, and artifact-card surfaces. Resolves the payload (serverData ??
 * canvas object ?? parsed raw markdown) and renders the real
 * TroubleshootingBlock.
 */
export default function TroubleshootingArtifact({
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
  const troubleshooting = useMemo(
    () =>
      resolveMarkdownPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: parseTroubleshootingMarkdown,
      }),
    [serverData, data, raw, isStreamActive],
  );

  // Answer state also rides the next message as one interaction chip (the
  // shape interaction seam); view state never does.
  const { state, loaded, patch: save } = useBlockState<
    TroubleshootingState & Record<string, unknown>
  >({ title: (troubleshooting as { title?: string } | null)?.title ?? null, data: troubleshooting });

  if (!troubleshooting) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  // Wait for persisted state to load before rendering so initialState seeds correctly.
  if (!loaded) {
    return <MatrxMiniLoader />;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <TroubleshootingBlock
        troubleshooting={troubleshooting}
        taskId={artifactDedupKey(taskId, artifactId)}
        artifactId={artifactId}
        conversationId={conversationId}
        messageId={messageId}
        blockIndex={blockIndex}
        initialState={state ?? undefined}
        onStateChange={save as (state: TroubleshootingState) => void}
      />
    </Suspense>
  );
}
