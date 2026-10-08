"use client";

/**
 * A document's Knowledge Assets builder as a canvas tab — the existing
 * `KnowledgeAssetPanel`, beside the source it builds from (the reader stays
 * fully visible). One tab per document (`knowledge-assets`, keyed by the
 * document id); every studio's "Knowledge Assets" action toggles it, and a
 * `?assets` deep link opens it.
 */

import { Wand2 } from "lucide-react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { canvasRecord, canvasText, type ToolOpenInput, subjectTitle } from "@/features/canvas/host/toolCanvas";
import type { KnowledgeAssetDoc } from "@/features/rag/components/library/KnowledgeAssetPanel";

export const KNOWLEDGE_ASSETS_KIND = "knowledge-assets";
const LABEL = "Knowledge Assets";

export function readKnowledgeAssetsTab(data: CanvasJson | undefined | null): KnowledgeAssetDoc | null {
  const id = canvasText(data, "id");
  if (!id) return null;
  const pages = canvasRecord(data).totalPages;
  return { id, name: canvasText(data, "name") ?? "", totalPages: typeof pages === "number" ? pages : null };
}

/** The toggle (and open) request for one document's tab. */
export function knowledgeAssetsInput(doc: KnowledgeAssetDoc | null): ToolOpenInput {
  return {
    kind: KNOWLEDGE_ASSETS_KIND,
    key: doc?.id ?? "",
    // Names its document — two documents' tabs never share a title.
    title: subjectTitle(LABEL, doc?.name),
    data: { id: doc?.id ?? null, name: doc?.name ?? null, totalPages: doc?.totalPages ?? null },
  };
}

export const KNOWLEDGE_ASSETS_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<CanvasJson>({
  id: KNOWLEDGE_ASSETS_KIND,
  surface: "dom",
  label: LABEL,
  icon: Wand2,
  load: () => import("./KnowledgeAssetsCanvasView"),
  unavailable: (data) => (readKnowledgeAssetsTab(data) ? null : "No document"),
  restore: true,
});
