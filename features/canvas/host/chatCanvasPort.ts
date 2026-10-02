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

import { selectCanvasActiveItem, type CanvasController, type CanvasState } from "@ai-matrx/canvas";
import { useOptionalCanvas, useOptionalCanvasState } from "@ai-matrx/canvas/react";
import type {
  ChatCanvasContent,
  ChatCanvasOpeners,
  ChatCanvasPort,
  ChatCanvasView,
} from "@ai-matrx/chat/host";
import type { CanvasContent, CanvasContentType } from "@/features/canvas/canvasContent";
import { reportCanvasOpenDrop, titleForDrop } from "@/features/canvas/openRequest";
import { readArtifactPointerId } from "@/features/canvas/artifact-types/artifactId";
import { readArtifactItemData, contentOf } from "./artifactItem";
import { useCanvasSources } from "./canvasSources";
import { openArtifactContent } from "./useArtifactCanvas";

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

export const appChatCanvasPort: ChatCanvasPort = {
  useView: useChatCanvasViewForApp,
  useOpeners: useChatCanvasOpenersForApp,
};
