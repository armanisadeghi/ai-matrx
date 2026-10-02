// features/kg-suggestions/components/source-preview/SourcePreviewContext.tsx
//
// How ANY suggestion decision card (KgSuggestionRowItem, deep in the drawer or
// the manager table) previews its source document: as a canvas tab
// (`kg-source-preview`, keyed by the source), beside whatever inbox the person
// is triaging from. Opening one never re-renders or closes that inbox.
//
// A card calls `useOpenSourcePreview()`. Where a canvas column is on screen it
// gets the canvas opener; where none is (a kiosk, a meeting stage) it gets
// `null` and falls back to a link-out / window open.

"use client";

import { useCanvasIsPresented, useOptionalCanvas } from "@ai-matrx/canvas/react";
import { openCanvasItem } from "@/features/canvas/host/openCanvasItem";
import { sourcePreviewOpenInput } from "./sourcePreviewKind";

export interface SourcePreviewTarget {
  kind: string;
  id: string;
  snippet: string | null;
  /** Pre-resolved title (optional) so the tab can show it instantly. */
  title?: string | null;
}

/**
 * Card-side hook. Returns an `openPreview` fn when the canvas can show the
 * source, else `null` so the card can fall back to a link-out / window open.
 */
export function useOpenSourcePreview():
  | ((target: SourcePreviewTarget) => void)
  | null {
  const canvas = useOptionalCanvas();
  const presented = useCanvasIsPresented();
  if (!canvas || !presented) return null;
  return (target) => {
    openCanvasItem(canvas, sourcePreviewOpenInput(target));
  };
}
