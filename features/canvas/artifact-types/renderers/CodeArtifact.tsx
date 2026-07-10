"use client";

import React, { Suspense } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { ArtifactRendererProps } from "../artifact-renderers";
import { CodeBlockWithContextAttach } from "@/features/canvas/materialization/CodeBlockWithContextAttach";

/**
 * Unified renderer for `code` artifacts — chat, canvas, and artifact-card surfaces.
 *
 * Resolves both the code string and language from the data/raw payload.
 * When conversationId + messageId are present, the kebab menu includes
 * "Add to conversation context" (idempotent re-attach for already-id'd rows).
 */
export default function CodeArtifact({
  raw,
  data,
  isStreamActive,
  metadata,
  conversationId,
  messageId,
  artifactId,
}: ArtifactRendererProps) {
  const code =
    typeof data === "string"
      ? data
      : ((data as { code?: string })?.code ?? raw ?? "");

  const language =
    (data as { language?: string })?.language ??
    (typeof metadata?.language === "string" ? metadata.language : null) ??
    "text";

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <CodeBlockWithContextAttach
        code={code}
        language={language}
        isStreamActive={isStreamActive}
        conversationId={conversationId}
        messageId={messageId}
        // When already materialized, the attach primitive reuses this id.
        // Passed via a data attribute on the menu action through the hook's
        // existingArtifactId — CodeBlockWithContextAttach reads it from a
        // dedicated prop below.
        existingArtifactId={artifactId}
      />
    </Suspense>
  );
}
