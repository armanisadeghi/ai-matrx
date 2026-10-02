"use client";

/**
 * Canvas kinds that show "something about the current item" — a record, a
 * source document, one engine's answer. Each feature owns its kind beside its
 * code; this is only where they register, at boot, so a remembered tab renders
 * on the first paint after hydration. Every kind here is light: its body loads
 * only when one of its tabs renders.
 */

import { registerCanvasKinds } from "@ai-matrx/canvas/react";
import { RECORD_PEEK_CANVAS_KIND } from "@/features/window-panels/detail/canvas/recordPeekKind";
import { AI_ANSWER_CANVAS_KIND } from "@/features/marketing/seo/ai-visibility/canvas/aiAnswerKind";
import { SOURCE_PREVIEW_CANVAS_KIND } from "@/features/kg-suggestions/components/source-preview/sourcePreviewKind";

export function registerFeatureCanvasKinds(): () => void {
  return registerCanvasKinds([RECORD_PEEK_CANVAS_KIND, AI_ANSWER_CANVAS_KIND, SOURCE_PREVIEW_CANVAS_KIND]);
}
