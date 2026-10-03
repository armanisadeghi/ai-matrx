"use client";

/** The body of a `knowledge-assets` canvas tab: the existing KnowledgeAssetPanel. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { KnowledgeAssetPanel } from "@/features/rag/components/library/KnowledgeAssetPanel";
import { readKnowledgeAssetsTab } from "./knowledgeAssetsKind";

export default function KnowledgeAssetsCanvasView({ data }: CanvasKindProps) {
  const doc = readKnowledgeAssetsTab(data);
  if (!doc) return null;
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background">
      <KnowledgeAssetPanel doc={doc} />
    </div>
  );
}
