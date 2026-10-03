"use client";

/**
 * THE way app code puts CanvasContent on the canvas. Every opener hook
 * (useCanvas, useOpenArtifactInCanvas, useOpenCanvasItem, block wrappers…)
 * funnels through here, so identity, JSON safety and the "announce, never
 * drop" rule are enforced once.
 */

import {
  selectCanvasActiveItem,
  selectCanvasIsOpen,
  selectCanvasKindVisibility,
  toggleKind,
  type CanvasController,
  type CanvasItemId,
} from "@ai-matrx/canvas";
import { useCanvasIsPresented, useOptionalCanvas, useOptionalCanvasState } from "@ai-matrx/canvas/react";
import { reportCanvasOpenDrop, titleForDrop } from "@/features/canvas/openRequest";
import type { ArtifactDebugTrace, CanvasContent, CanvasContentType } from "@/features/canvas/canvasContent";
import { artifactKey, artifactOpenInput, contentOf, readArtifactItemData, type ArtifactOpenOptions } from "./artifactItem";

export interface ArtifactPointerInput {
  artifactId: string;
  type: CanvasContentType;
  metadata?: CanvasContent["metadata"] & Record<string, unknown>;
  artifactDebug?: ArtifactDebugTrace | null;
}

/**
 * Opens content on a canvas controller; returns null (and announces why) when
 * it cannot. The non-hook core of `openContent`, for callers that must not
 * subscribe to canvas state (headless openers whose effects would otherwise
 * re-run on every item update).
 */
export function openArtifactContent(
  canvas: CanvasController | null,
  content: CanvasContent,
  options: ArtifactOpenOptions = {},
): CanvasItemId | null {
  const requested = titleForDrop(content?.metadata?.title);
  if (!content?.type) {
    reportCanvasOpenDrop({ reason: "no-content", requested });
    return null;
  }
  if (content.data == null) {
    reportCanvasOpenDrop({ reason: "no-content", requested, detail: `type ${content.type} arrived with no data` });
    return null;
  }
  // A provider with no column on screen (kiosk, meeting stage) cannot show anything.
  if (!canvas || !canvas.isPresented()) {
    reportCanvasOpenDrop({ reason: "canvas-unavailable", requested });
    return null;
  }
  return canvas.open(artifactOpenInput(content, options));
}

/** The verbs, read against the canvas at CALL time — they never subscribe. */
export interface ArtifactCanvasActions {
  /** Opens content; returns null (and announces why) when it cannot. */
  openContent: (content: CanvasContent, options?: ArtifactOpenOptions) => CanvasItemId | null;
  /** Opens a saved artifact by pointer — the row is the truth, never a copy. */
  openPointer: (input: ArtifactPointerInput) => CanvasItemId | null;
  /** Adds a tab without revealing the canvas or stealing focus. */
  offer: (content: CanvasContent) => CanvasItemId | null;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  /** Closes every tab and puts the canvas away. */
  clear: () => void;
  closeActive: () => void;
  /** Replaces the active artifact tab's content in place. */
  updateActive: (content: CanvasContent) => boolean;
}

function buildActions(canvas: CanvasController | null): ArtifactCanvasActions {
  const openContent = (content: CanvasContent, options: ArtifactOpenOptions = {}): CanvasItemId | null =>
    openArtifactContent(canvas, content, options);
  return {
    openContent,
    openPointer: (input) =>
      openContent(
        {
          type: input.type,
          data: { artifactId: input.artifactId },
          metadata: { ...input.metadata, canvasItemId: input.artifactId },
        },
        { savedItemId: input.artifactId, artifactDebug: input.artifactDebug ?? null },
      ),
    offer: (content) => openContent(content, { quiet: true }),
    show: () => canvas?.show(),
    hide: () => canvas?.hide(),
    toggle: () => canvas?.toggle(),
    clear: () => {
      if (!canvas) return;
      for (const id of Object.keys(canvas.getState().items)) canvas.close(id as CanvasItemId);
      canvas.hide();
    },
    closeActive: () => {
      const active = canvas?.getState();
      const pane = active ? active.panes[active.focusedPaneId] : undefined;
      if (canvas && pane?.activeItemId) canvas.close(pane.activeItemId);
    },
    updateActive: (content) => {
      if (!canvas) return false;
      const state = canvas.getState();
      const pane = state.panes[state.focusedPaneId];
      const item = pane?.activeItemId ? state.items[pane.activeItemId] : undefined;
      const data = item ? readArtifactItemData(item.data) : null;
      if (!item || !data) return openContent(content) !== null;
      const next = artifactOpenInput(content, { savedItemId: data.savedItemId });
      return canvas.update(item.id, { data: next.data, title: next.title ?? null });
    },
  };
}

// One actions object per controller: stable identities whether or not the
// React Compiler compiled the calling component (same rule as chatCanvasPort).
const ACTIONS = new WeakMap<CanvasController, ArtifactCanvasActions>();
const NO_CANVAS = buildActions(null);

/**
 * The canvas verbs for a component that OPENS things (a code block, a rich
 * block, a menu item). Subscribes to nothing, so opening, hiding or switching
 * the canvas never re-renders it. Read state with `useArtifactCanvas()` only
 * where the component actually shows that state.
 */
export function useArtifactCanvasActions(): ArtifactCanvasActions {
  const canvas = useOptionalCanvas();
  if (!canvas) return NO_CANVAS;
  let actions = ACTIONS.get(canvas);
  if (!actions) {
    actions = buildActions(canvas);
    ACTIONS.set(canvas, actions);
  }
  return actions;
}

/**
 * The verbs PLUS the canvas state (availability, open flag, active content).
 * Re-renders on every open, hide and tab switch — use it only where that state
 * is on screen; an opener uses `useArtifactCanvasActions()`.
 */
export function useArtifactCanvas() {
  const actions = useArtifactCanvasActions();
  const isPresented = useCanvasIsPresented();
  const isOpen = useCanvasStateSafe();
  const activeContent = useActiveContent();
  return {
    ...actions,
    isAvailable: isPresented,
    isOpen,
    /** The content of the tab the person is looking at, if it is an artifact. */
    activeContent,
  };
}

function useCanvasStateSafe(): boolean {
  return useOptionalCanvasState(selectCanvasIsOpen, false);
}

function useActiveContent(): CanvasContent | null {
  const active = useOptionalCanvasState(selectCanvasActiveItem, null);
  const data = active ? readArtifactItemData(active.data) : null;
  return data ? contentOf(data) : null;
}

/**
 * AN "OPEN IN CANVAS" BUTTON IS A TOGGLE (2026-10-03). A message's artifact
 * opener had no pressed state and a second press opened nothing new — unlike
 * every launcher, whose press is absent → open, behind → bring forward,
 * in front → close (`toggleKind`). This names the tab the content opens as
 * (the SAME kind + key `artifactOpenInput` gives it) so the button can show
 * `aria-pressed` while that tab is in front and close it on the next press.
 * Opening still goes through the caller's own opener (it may persist first).
 */
export function useArtifactContentToggle(content: CanvasContent | null): {
  isVisible: boolean;
  /** Closes the tab when it is in front; false when there was nothing to close. */
  closeIfVisible: () => boolean;
} {
  const canvas = useOptionalCanvas();
  const kind = content?.type ?? null;
  const key = content ? artifactKey(content) : null;
  const isVisible = useOptionalCanvasState(
    (state) => (kind && key ? selectCanvasKindVisibility(state, kind, key) === "visible" : false),
    false,
  );
  return {
    isVisible,
    closeIfVisible: () => {
      if (!canvas || !kind || !key) return false;
      if (selectCanvasKindVisibility(canvas.getState(), kind, key) !== "visible") return false;
      toggleKind(canvas, { kind, key });
      return true;
    },
  };
}
