"use client";

/**
 * THE way a tool (Quick Chat, Quick Notes, a conversation's Documents…) opens
 * as a canvas tab. Every tool opener funnels through `openToolInCanvas`, which
 * opens through `openCanvasItem` ("announce, never drop") and adds one rule: a
 * tab that is already open keeps its own data unless the caller replaces it.
 *
 * A tool tab's data is plain JSON the kind's body reads and writes back with
 * `canvas.update` (Quick Chat keeps its conversation there, so a reload brings
 * the same conversation back).
 */

import { canvasItemId, type CanvasController, type CanvasItemId, type CanvasJson } from "@ai-matrx/canvas";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { openCanvasItem } from "./openCanvasItem";

export interface ToolOpenInput {
  kind: string;
  /** Names the THING the tab shows (a conversation id, a note id, "default"). */
  key: string;
  title: string;
  /**
   * Data (and title) for a NEW tab. An existing tab keeps its own unless
   * `replaceData` is set — reopening Quick Chat focuses the conversation you
   * were in, it never resets it.
   */
  data: CanvasJson;
  replaceData?: boolean;
}

/** Opens (or focuses) a tool tab; returns null after announcing why it could not. */
export function openToolInCanvas(canvas: CanvasController | null, input: ToolOpenInput): CanvasItemId | null {
  const keep = Boolean(canvas?.getState().items[canvasItemId(input.kind, input.key)]) && !input.replaceData;
  return openCanvasItem(canvas, {
    kind: input.kind,
    key: input.key,
    // An open tab keeps the title its body gave it (the scratchpad's name).
    title: keep ? undefined : input.title,
    data: keep ? undefined : input.data,
  });
}

/** A handle with `close()`, the shape every overlay opener returned. */
export interface ToolTabHandle {
  close: () => void;
}

export function toolTabHandle(canvas: CanvasController | null, itemId: CanvasItemId | null): ToolTabHandle {
  return {
    close: () => {
      if (canvas && itemId) canvas.close(itemId);
    },
  };
}

/** `useOptionalCanvas` + `openToolInCanvas`, for openers that build their input from options. */
export function useToolOpener<TOptions>(build: (options: TOptions) => ToolOpenInput) {
  const canvas = useOptionalCanvas();
  return (options: TOptions): ToolTabHandle => toolTabHandle(canvas, openToolInCanvas(canvas, build(options)));
}

/** True when the canvas is showing and holds at least one tab of `kind`. */
export function canvasHoldsKind(canvas: CanvasController | null, kind: string): boolean {
  if (!canvas) return false;
  const state = canvas.getState();
  if (!state.isOpen) return false;
  return Object.values(state.items).some((item) => item.kind === kind);
}
