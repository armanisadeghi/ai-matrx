"use client";

/**
 * "What agents receive" for global system context (no scope), straight from
 * the live resolver, as a canvas tab beside the console — the existing
 * `SystemContextPreview`. One tab (`system-context-preview`, key "default");
 * the console's Preview button toggles it. It re-reads on mount, so it comes
 * back after a reload.
 */

import { Eye } from "lucide-react";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import type { ToolToggleInput } from "@/features/canvas/host/toolCanvas";

export const SYSTEM_CONTEXT_PREVIEW_KIND = "system-context-preview";
const TITLE = "What agents receive";

export const SYSTEM_CONTEXT_PREVIEW_TOGGLE: ToolToggleInput = {
  kind: SYSTEM_CONTEXT_PREVIEW_KIND,
  title: TITLE,
  data: null,
};

export const SYSTEM_CONTEXT_PREVIEW_CANVAS_KIND: AnyCanvasKind = defineCanvasKind({
  id: SYSTEM_CONTEXT_PREVIEW_KIND,
  surface: "dom",
  label: TITLE,
  icon: Eye,
  load: () => import("./SystemContextPreviewCanvasView"),
  restore: true,
});
