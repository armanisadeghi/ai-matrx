"use client";

/**
 * The source document behind a knowledge-graph suggestion, as a canvas tab
 * (`kg-source-preview`) keyed by the source (`<kind>:<id>`). Opening the same
 * source again focuses its tab; the snippet it was opened for travels with it.
 * Light: registers at boot, the body loads only when a tab renders.
 */

import { Quote } from "lucide-react";
import type { CanvasOpenInput } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import type { SourcePreviewTarget } from "./SourcePreviewContext";

export const SOURCE_PREVIEW_KIND = "kg-source-preview";

type SourcePreviewData = {
  kind: string;
  id: string;
  snippet: string | null;
  title: string | null;
};

export function sourcePreviewOpenInput(target: SourcePreviewTarget): CanvasOpenInput {
  const data: SourcePreviewData = {
    kind: target.kind,
    id: target.id,
    snippet: target.snippet,
    title: target.title ?? null,
  };
  return {
    kind: SOURCE_PREVIEW_KIND,
    key: `${target.kind}:${target.id}`,
    ...(target.title ? { title: target.title } : {}),
    data,
  };
}

export function readSourcePreviewData(data: unknown): SourcePreviewTarget | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { kind, id, snippet, title } = data as Record<string, unknown>;
  if (typeof kind !== "string" || typeof id !== "string") return null;
  return {
    kind,
    id,
    snippet: typeof snippet === "string" ? snippet : null,
    title: typeof title === "string" ? title : null,
  };
}

export const SOURCE_PREVIEW_CANVAS_KIND: AnyCanvasKind = defineCanvasKind({
  id: SOURCE_PREVIEW_KIND,
  surface: "dom",
  label: "Source",
  icon: Quote,
  load: () => import("./SourcePreviewCanvasView"),
  // The source is a row; the tab reads it again after a reload.
  restore: true,
});
