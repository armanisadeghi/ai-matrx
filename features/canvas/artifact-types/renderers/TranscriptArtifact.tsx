"use client";

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { type ArtifactRendererProps } from "../artifact-renderers";

const TranscriptBlock = lazy(
  () => import("@/components/mardown-display/blocks/transcripts/TranscriptBlock"),
);

/**
 * Unified renderer for `transcript` artifacts — a transcript is durable content,
 * so it materializes (persisted, versioned, render-by-id). Renders the existing
 * TranscriptBlock viewer. Full two-way sync to the transcription system
 * (features/transcripts) is the next adapter layer — see FEATURE.md.
 */
export default function TranscriptArtifact({
  raw,
  data,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <TranscriptBlock content={content} />
    </Suspense>
  );
}
