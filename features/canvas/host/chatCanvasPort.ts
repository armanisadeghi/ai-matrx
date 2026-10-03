"use client";

/**
 * The app's canvas, as the chat package's `canvas` port.
 *
 * The package names content by type string and pointer; this binding checks
 * the type against the app's content vocabulary (an unknown type is refused
 * with the canvas's own "unknown-type" notice), then opens through the same
 * core every app opener uses (`openArtifactContent`), so identity, JSON safety
 * and "announce, never drop" behave exactly as for app code.
 */

import {
  canvasItemId,
  selectCanvasActiveItem,
  selectCanvasKindVisibility,
  type CanvasController,
  type CanvasState,
} from "@ai-matrx/canvas";
import { useSyncExternalStore } from "react";
import { useOptionalCanvas, useOptionalCanvasState } from "@ai-matrx/canvas/react";
import type {
  ChatCanvasContent,
  ChatCanvasOpeners,
  ChatCanvasPort,
  ChatCanvasTab,
  ChatCanvasTabOpen,
  ChatCanvasTabRef,
  ChatCanvasView,
} from "@ai-matrx/chat/host";
import type { CanvasContent, CanvasContentType } from "@/features/canvas/canvasContent";
import { reportCanvasOpenDrop, titleForDrop } from "@/features/canvas/openRequest";
import { readArtifactPointerId } from "@/features/canvas/artifact-types/artifactId";
import { readArtifactItemData, contentOf } from "./artifactItem";
import { useCanvasSources } from "./canvasSources";
import { openArtifactContent } from "./useArtifactCanvas";
import { canvasText, openToolInCanvas, toggleToolInCanvas } from "./toolCanvas";

/** Every content type, checked exhaustive against the union at compile time. */
const CONTENT_TYPES = {
  quiz: true,
  presentation: true,
  iframe: true,
  html: true,
  code: true,
  image: true,
  diagram: true,
  comparison: true,
  timeline: true,
  research: true,
  troubleshooting: true,
  "decision-tree": true,
  flashcards: true,
  recipe: true,
  resources: true,
  code_preview: true,
  code_edit_error: true,
  progress: true,
  math_problem: true,
  mermaid: true,
  svg: true,
  chart: true,
  map: true,
  stats: true,
  diff: true,
  questionnaire: true,
  react: true,
  table: true,
  transcript: true,
  structured_info: true,
  tree: true,
  tasks: true,
  cloud_browser: true,
  udt_document: true,
  sandbox: true,
  topical_map: true,
  kind_value: true,
} as const satisfies Record<CanvasContentType, true>;

function isCanvasContentType(type: string): type is CanvasContentType {
  return Object.prototype.hasOwnProperty.call(CONTENT_TYPES, type);
}

/** The chat's content as the app's, or null after announcing an unknown type. */
function toCanvasContent(content: ChatCanvasContent): CanvasContent | null {
  if (!isCanvasContentType(content.type)) {
    reportCanvasOpenDrop({
      reason: "unknown-type",
      requested: titleForDrop(content.metadata?.title),
      detail: `type ${content.type}`,
    });
    return null;
  }
  return { type: content.type, data: content.data, metadata: content.metadata };
}

function buildOpeners(canvas: CanvasController | null): ChatCanvasOpeners {
  const open = (content: ChatCanvasContent, quiet: boolean, savedItemId?: string): boolean => {
    const app = toCanvasContent(content);
    if (!app) return false;
    const options = { ...(quiet ? { quiet } : {}), ...(savedItemId ? { savedItemId } : {}) };
    return openArtifactContent(canvas, app, options) !== null;
  };
  return {
    isAvailable: canvas !== null,
    open: (content) => open(content, false),
    offer: (content) => open(content, true),
    openPointer: ({ artifactId, type, metadata }) =>
      open(
        { type, data: { artifactId }, metadata: { ...metadata, canvasItemId: artifactId } },
        false,
        artifactId,
      ),
    hide: () => canvas?.hide(),
    toggle: () => canvas?.toggle(),
  };
}

// One openers object per controller: stable identities whether or not the
// React Compiler compiled the calling component.
const OPENERS = new WeakMap<CanvasController, ChatCanvasOpeners>();
const NO_CANVAS = buildOpeners(null);

function useChatCanvasOpenersForApp(): ChatCanvasOpeners {
  const canvas = useOptionalCanvas();
  if (!canvas) return NO_CANVAS;
  let openers = OPENERS.get(canvas);
  if (!openers) {
    openers = buildOpeners(canvas);
    OPENERS.set(canvas, openers);
  }
  return openers;
}

/** The saved artifact the active tab shows — a string, so subscribers re-render only on change. */
function selectActiveArtifactId(state: CanvasState): string | null {
  const active = selectCanvasActiveItem(state);
  const data = active ? readArtifactItemData(active.data) : null;
  if (!data) return null;
  const content = contentOf(data);
  return content.metadata?.canvasItemId ?? readArtifactPointerId(content.data) ?? null;
}

function useChatCanvasViewForApp(): ChatCanvasView {
  const { isOpen, sourceIds, activeSourceId } = useCanvasSources();
  const activeArtifactId = useOptionalCanvasState(selectActiveArtifactId, null);
  return { isOpen, sourceIds, activeSourceId, activeArtifactId };
}

/**
 * A named package tab's press. Without `selected`: the launcher toggle
 * (absent → open · behind → focus · in front → close). With it: in front on
 * that value → close; otherwise open or focus the tab and show that value.
 */
export function toggleChatCanvasTab(
  canvas: CanvasController | null,
  tab: ChatCanvasTabRef,
  open: ChatCanvasTabOpen,
): void {
  const input = { kind: tab.kind, key: tab.key, title: open.title, data: { ...open.data } };
  if (open.selected === undefined) {
    toggleToolInCanvas(canvas, input);
    return;
  }
  const id = canvasItemId(tab.kind, tab.key);
  const state = canvas?.getState();
  const item = state?.items[id];
  if (canvas && state && item && selectCanvasKindVisibility(state, tab.kind, tab.key) === "visible" && canvasText(item.data, "selected") === open.selected) {
    canvas.close(id);
    return;
  }
  const opened = openToolInCanvas(canvas, { ...input, data: { ...input.data, selected: open.selected } });
  const current = opened ? canvas?.getState().items[opened] : undefined;
  if (canvas && opened && current && canvasText(current.data, "selected") !== open.selected) {
    const base = current.data && typeof current.data === "object" && !Array.isArray(current.data) ? current.data : {};
    canvas.update(opened, { data: { ...base, selected: open.selected } });
  }
}

const NEVER = () => () => undefined;

/** Is a canvas column on screen — re-renders when one mounts or unmounts. */
function useCanvasPresented(canvas: CanvasController | null): boolean {
  return useSyncExternalStore(
    canvas ? (listener: () => void) => canvas.subscribePresentation(listener) : NEVER,
    () => canvas?.isPresented() ?? false,
    () => false,
  );
}

function useChatCanvasTabForApp(tab: ChatCanvasTabRef): ChatCanvasTab {
  const canvas = useOptionalCanvas();
  // A store with no column on screen (kiosk, meeting stage) cannot show the tab.
  const presented = useCanvasPresented(canvas);
  const isVisible = useOptionalCanvasState(
    (state) => selectCanvasKindVisibility(state, tab.kind, tab.key) === "visible",
    false,
  );
  const selected = useOptionalCanvasState(
    (state) => canvasText(state.items[canvasItemId(tab.kind, tab.key)]?.data, "selected"),
    null,
  );
  return {
    isAvailable: presented,
    isVisible,
    selected,
    toggle: (open) => toggleChatCanvasTab(canvas, tab, open),
  };
}

export const appChatCanvasPort: ChatCanvasPort = {
  useView: useChatCanvasViewForApp,
  useOpeners: useChatCanvasOpenersForApp,
  useTab: useChatCanvasTabForApp,
};
