"use client";

/**
 * Which SOURCES are on the canvas — the question every headless opener asks
 * ("is this chat's sandbox / document / tool result already a tab? is it the
 * one on screen?").
 *
 * A source id is the producer's stable identity for its tab: the content's
 * `metadata.messageId ?? metadata.sourceMessageId` (the same precedence the
 * old slice used), falling back to the tab's own id for content that names no
 * source. Everything is read as STRINGS so a subscriber re-renders only when
 * what the canvas holds actually changes, never on every data update.
 */

import {
  selectCanvasActiveItem,
  selectCanvasIsOpen,
  type CanvasController,
  type CanvasItem,
  type CanvasState,
} from "@ai-matrx/canvas";
import { useOptionalCanvas, useOptionalCanvasState } from "@ai-matrx/canvas/react";
import type { CanvasContent } from "@/features/canvas/canvasContent";
import { contentOf, readArtifactItemData } from "./artifactItem";
import { openArtifactContent } from "./useArtifactCanvas";

/** The source id of one canvas tab, or null when it names none. */
export function canvasItemSourceId(item: CanvasItem): string | null {
  const data = readArtifactItemData(item.data);
  if (!data) return null;
  const meta = contentOf(data).metadata;
  return meta?.messageId ?? meta?.sourceMessageId ?? null;
}

const SOURCE_SEPARATOR = "\u0000";

/** The source ids inside a `sourceKey`. */
export function splitCanvasSourceKey(sourceKey: string): string[] {
  return sourceKey ? sourceKey.split(SOURCE_SEPARATOR) : [];
}

function selectSourceKey(state: CanvasState): string {
  return Object.values(state.items)
    .map((item) => canvasItemSourceId(item) ?? item.id)
    .join(SOURCE_SEPARATOR);
}

function selectActiveSourceId(state: CanvasState): string | null {
  const active = selectCanvasActiveItem(state);
  return active ? (canvasItemSourceId(active) ?? active.id) : null;
}

export interface CanvasSources {
  /** Is the canvas column showing? */
  readonly isOpen: boolean;
  /** Source ids of every tab (a tab with no source contributes its own id). */
  readonly sourceIds: readonly string[];
  /** The same, as one stable string — safe as an effect dependency. */
  readonly sourceKey: string;
  /** Source id of the tab the person is looking at, or null. */
  readonly activeSourceId: string | null;
}

/** Live view of the canvas's sources. Safe outside a canvas provider. */
export function useCanvasSources(): CanvasSources {
  const isOpen = useOptionalCanvasState(selectCanvasIsOpen, false);
  const sourceKey = useOptionalCanvasState(selectSourceKey, "");
  const activeSourceId = useOptionalCanvasState(selectActiveSourceId, null);
  return {
    isOpen,
    sourceIds: splitCanvasSourceKey(sourceKey),
    sourceKey,
    activeSourceId,
  };
}

export interface CanvasOpeners {
  readonly isAvailable: boolean;
  /** Shows the content now; false (announced) when the canvas cannot. */
  readonly open: (content: CanvasContent) => boolean;
  /** Adds a tab without revealing the canvas or stealing focus. */
  readonly offer: (content: CanvasContent) => boolean;
  readonly hide: () => void;
  readonly toggle: () => void;
}

function buildOpeners(canvas: CanvasController | null): CanvasOpeners {
  return {
    isAvailable: canvas !== null,
    open: (content) => openArtifactContent(canvas, content) !== null,
    offer: (content) => openArtifactContent(canvas, content) !== null,
    hide: () => canvas?.hide(),
    toggle: () => canvas?.toggle(),
  };
}

// One openers object per controller, so the functions are referentially
// stable whether or not the React Compiler compiled the calling component.
const OPENERS = new WeakMap<CanvasController, CanvasOpeners>();
const NO_CANVAS = buildOpeners(null);

/**
 * Open / offer / hide WITHOUT subscribing to canvas state, with stable
 * identities. For headless openers whose effects call these:
 * `useArtifactCanvas` re-renders on every update of the active tab, so an
 * effect depending on it re-offers, which updates the tab, which re-renders —
 * a loop.
 */
export function useCanvasOpeners(): CanvasOpeners {
  const canvas = useOptionalCanvas();
  if (!canvas) return NO_CANVAS;
  let openers = OPENERS.get(canvas);
  if (!openers) {
    openers = buildOpeners(canvas);
    OPENERS.set(canvas, openers);
  }
  return openers;
}
