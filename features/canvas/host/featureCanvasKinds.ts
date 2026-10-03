"use client";

/**
 * Canvas kinds that show "something about the current item" — a record, a
 * source document, one engine's answer, a person's journey, a directive's
 * shape, a map topic, the suggestion inbox — and a page's own live panel. Each feature owns its kind beside its
 * code; this is only where they register, at boot, so a remembered tab renders
 * on the first paint after hydration. Every kind here is light: its body loads
 * only when one of its tabs renders.
 */

import { registerCanvasKinds, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { RECORD_PEEK_CANVAS_KIND } from "@/features/window-panels/detail/canvas/recordPeekKind";
import { AI_ANSWER_CANVAS_KIND } from "@/features/marketing/seo/ai-visibility/canvas/aiAnswerKind";
import { SOURCE_PREVIEW_CANVAS_KIND } from "@/features/kg-suggestions/components/source-preview/sourcePreviewKind";
import { USER_JOURNEY_CANVAS_KIND } from "@/features/admin/users/canvas/userJourneyKind";
import { DIRECTIVE_SHAPE_CANVAS_KIND } from "@/features/directive-catalog/canvas/directiveShapeKind";
import { TOPICAL_MAP_TOPIC_CANVAS_KIND } from "@/features/marketing/seo/topical-map/canvas/topicKind";
import { KG_SUGGESTIONS_CANVAS_KIND } from "@/features/kg-suggestions/canvas/kgSuggestionsKind";
import {
  DOCUMENT_HISTORY_CANVAS_KIND,
  WORKBOOK_HISTORY_CANVAS_KIND,
} from "@/features/data-tables/canvas/historyKinds";
import { PAGE_PANEL_CANVAS_KIND } from "./pagePanel";

export const FEATURE_CANVAS_KINDS: readonly AnyCanvasKind[] = [
  RECORD_PEEK_CANVAS_KIND,
  AI_ANSWER_CANVAS_KIND,
  SOURCE_PREVIEW_CANVAS_KIND,
  USER_JOURNEY_CANVAS_KIND,
  DIRECTIVE_SHAPE_CANVAS_KIND,
  TOPICAL_MAP_TOPIC_CANVAS_KIND,
  KG_SUGGESTIONS_CANVAS_KIND,
  // A document's / a workbook's snapshot history beside its editor.
  DOCUMENT_HISTORY_CANVAS_KIND,
  WORKBOOK_HISTORY_CANVAS_KIND,
  // A page's own live panel (a table's row detail, an admin form) — see pagePanel.tsx.
  PAGE_PANEL_CANVAS_KIND,
];

export function registerFeatureCanvasKinds(): () => void {
  return registerCanvasKinds(FEATURE_CANVAS_KINDS);
}
