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

import {
  canvasItemId,
  selectCanvasKindVisibility,
  toggleKind,
  type CanvasController,
  type CanvasItemId,
  type CanvasJson,
  type CanvasKindVisibility,
  type CanvasState,
} from "@ai-matrx/canvas";
import { useOptionalCanvas, useOptionalCanvasState } from "@ai-matrx/canvas/react";
import { openCanvasItem } from "./openCanvasItem";
import { reportCanvasOpenDrop } from "@/features/canvas/openRequest";

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

export interface ToolToggleInput {
  kind: string;
  key?: string;
  title: string;
  data: CanvasJson;
  /** What a press does while the tab is in front: close it (default) or put the canvas away. */
  whenVisible?: "close" | "hide";
  /**
   * Where a NEW tab opens. "split-down": in a new pane BELOW whatever the
   * canvas is showing (Notifications); an empty or put-away canvas just opens
   * it. An existing tab never moves.
   *
   * TODO(canvas 0.5.0): becomes the kind's own `preferredTarget` — delete this
   * field and `opensInSplit` once the package honours it inside `toggleKind`.
   */
  target?: "split-down";
}

/** True when a press should open a new pane below the tab now in front. */
function opensInSplit(canvas: CanvasController, input: ToolToggleInput): boolean {
  if (input.target !== "split-down") return false;
  const state = canvas.getState();
  if (!state.isOpen) return false;
  if (selectCanvasKindVisibility(state, input.kind, input.key ?? "default") !== "absent") return false;
  return Boolean(state.panes[state.focusedPaneId]?.activeItemId);
}

/**
 * A toolbar-icon press: absent -> open + reveal, behind -> bring forward, in
 * front -> close (or hide). The package owns the three states (`toggleKind`);
 * this adds the host's rule that a canvas with no column on screen announces
 * the refusal instead of dropping the press. Returns what the tab is now, or
 * null after announcing.
 */
export function toggleToolInCanvas(canvas: CanvasController | null, input: ToolToggleInput): CanvasKindVisibility | null {
  if (!canvas || !canvas.isPresented()) {
    reportCanvasOpenDrop({ reason: "canvas-unavailable", requested: input.title, detail: `${input.kind}::${input.key ?? "default"}` });
    return null;
  }
  if (opensInSplit(canvas, input)) {
    const key = input.key ?? "default";
    canvas.open({ kind: input.kind, key, title: input.title, data: input.data, target: "split-down" });
    return selectCanvasKindVisibility(canvas.getState(), input.kind, key);
  }
  return toggleKind(canvas, input);
}

/** A launcher's pressed state plus its press: `isVisible` is true only while the tab is in front. */
export function useToolToggle(input: ToolToggleInput): { isVisible: boolean; toggle: () => void } {
  const canvas = useOptionalCanvas();
  const key = input.key ?? "default";
  const isVisible = useOptionalCanvasState((state) => selectCanvasKindVisibility(state, input.kind, key) === "visible", false);
  return { isVisible, toggle: () => void toggleToolInCanvas(canvas, input) };
}

type CanvasRecord = { readonly [key: string]: CanvasJson | undefined };

function isCanvasRecord(data: CanvasJson | undefined | null): data is CanvasRecord {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

/** A tab's data as a record ({} when it is not one) — kinds read their fields through this. */
export function canvasRecord(data: CanvasJson | undefined | null): CanvasRecord {
  return isCanvasRecord(data) ? data : {};
}

/** A non-empty string field of a tab's data, or null. */
export function canvasText(data: CanvasJson | undefined | null, field: string): string | null {
  const value = canvasRecord(data)[field];
  return typeof value === "string" && value ? value : null;
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

function holdsKind(state: CanvasState, kind: string): boolean {
  return state.isOpen && Object.values(state.items).some((item) => item.kind === kind);
}

/** True when the canvas is showing and holds at least one tab of `kind`. */
export function canvasHoldsKind(canvas: CanvasController | null, kind: string): boolean {
  return canvas ? holdsKind(canvas.getState(), kind) : false;
}

/** `canvasHoldsKind` as a subscription — re-renders only when the answer changes. */
export function useCanvasHoldsKind(kind: string): boolean {
  return useOptionalCanvasState((state) => holdsKind(state, kind), false);
}
