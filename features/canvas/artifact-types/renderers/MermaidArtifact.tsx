"use client";

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import {
  type ArtifactRendererProps,
  artifactDedupKey,
} from "../artifact-renderers";

// Canvas mode: the full editable workbench — default export, props: source, metadata?
// Path confirmed from CanvasBody's `mermaid` case:
//   `import("@/components/mermaid/workbench/MermaidWorkbench")`
const MermaidWorkbench = lazy(
  () => import("@/components/mermaid/workbench/MermaidWorkbench"),
);

// Inline / artifact mode: the in-chat block — default export, props:
//   content?, serverData?, metadata?, isStreamActive?, conversationId?,
//   messageId?, blockIndex?, taskId?, artifactId?
// Path confirmed from BlockRenderer's `mermaid` case:
//   `BlockComponents.MermaidBlock` → components/mardown-display/blocks/mermaid/MermaidBlock.tsx
const MermaidBlock = lazy(
  () => import("@/components/mardown-display/blocks/mermaid/MermaidBlock"),
);

/**
 * Unified renderer for `mermaid` (canvasType "mermaid") artifacts.
 *
 * Mermaid payloads are raw source text, not JSON — no parse step needed. The
 * source is resolved as: `data` string ?? `raw` string.
 *
 * - mode === "canvas": `<MermaidWorkbench source={content} metadata={metadata} />`
 * - else:              `<MermaidBlock content={content} … />` with full persistence
 *                      props so the toolbar's "Save to canvas" and version tracking
 *                      work identically to the in-chat block.
 *
 * The `isStreamActive` guard only controls the no-content fallback (show loader
 * when there is literally nothing to render yet). Mermaid itself handles
 * streaming gracefully — it re-renders as source accumulates.
 */
export default function MermaidArtifact(props: ArtifactRendererProps) {
  const {
    raw,
    data,
    serverData,
    metadata,
    isStreamActive,
    mode,
    taskId,
    artifactId,
    conversationId,
    messageId,
  } = props;

  const blockIndex = (props as { blockIndex?: number }).blockIndex;

  // Mermaid source is always raw text, never JSON.
  const content = typeof data === "string" ? data : raw;

  if (!content) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  if (mode === "canvas") {
    return (
      <Suspense fallback={<MatrxMiniLoader />}>
        <MermaidWorkbench source={content} metadata={metadata} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <MermaidBlock
        content={content}
        serverData={serverData as any}
        metadata={metadata}
        isStreamActive={isStreamActive}
        conversationId={conversationId}
        messageId={messageId}
        taskId={artifactDedupKey(taskId, artifactId)}
        artifactId={artifactId}
        blockIndex={blockIndex}
      />
    </Suspense>
  );
}
