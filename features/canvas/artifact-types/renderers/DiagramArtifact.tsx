"use client";

import React, { Suspense, lazy, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseDiagramJSON } from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import {
  type ArtifactRendererProps,
  resolveJsonPayload,
  artifactDedupKey,
} from "../artifact-renderers";

const InteractiveDiagramBlock = lazy(
  () => import("@/components/mardown-display/blocks/diagram/InteractiveDiagramBlock"),
);

/**
 * Unified renderer for `diagram` artifacts — the ONE renderer used by chat,
 * canvas, and artifact-card surfaces. Resolves the payload (serverData ?? canvas
 * object ?? parsed raw JSON) and renders the real InteractiveDiagramBlock.
 *
 * `parseDiagramJSON` takes a raw string; resolveJsonPayload passes the raw
 * string only once streaming is complete (parsing incomplete JSON yields
 * garbage), mirroring the legacy block-loading guard.
 */
export default function DiagramArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  isStreamActive,
}: ArtifactRendererProps) {
  const diagram = useMemo(
    () =>
      resolveJsonPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: (s) => parseDiagramJSON(s),
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!diagram) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <InteractiveDiagramBlock
        diagram={diagram}
        taskId={artifactDedupKey(taskId, artifactId)}
      />
    </Suspense>
  );
}
