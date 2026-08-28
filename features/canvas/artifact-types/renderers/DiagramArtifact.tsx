"use client";

import { Suspense, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import {
  materializeDiagramDefaults,
  parseDiagramJSON,
  type DiagramData,
} from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import { resolveJsonPayload, artifactDedupKey } from "../artifact-renderers";
import InteractiveDiagramBlock from "@/components/mardown-display/blocks/diagram/InteractiveDiagramBlock";
import type { ArtifactRendererProps } from "../types";
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
  mode,
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  conversationId,
  messageId,
  blockIndex,
  isStreamActive,
}: ArtifactRendererProps) {
  const diagram = useMemo(
    () =>
      (() => {
        const resolved = resolveJsonPayload({
          serverData,
          data,
          raw,
          isStreamActive,
          parse: (s) => parseDiagramJSON(s),
        });
        return resolved
          ? materializeDiagramDefaults(resolved as DiagramData)
          : null;
      })(),
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
        messageId={messageId}
        conversationId={conversationId}
        artifactId={artifactId}
        blockIndex={blockIndex}
        // On a surface where the diagram IS the page (canvas pane, shared
        // canvas viewer) the compact `card` presentation is wrong: it caps
        // itself at h-[600px]/max-w-6xl and repeats the title the surface
        // already shows, so the diagram occupies half a viewport and clips
        // when zoomed. `workspace` is the full-height, uncapped presentation.
        presentation={mode === "canvas" ? "workspace" : "card"}
      />
    </Suspense>
  );
}
