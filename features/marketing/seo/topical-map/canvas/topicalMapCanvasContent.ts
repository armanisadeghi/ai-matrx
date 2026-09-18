/**
 * features/marketing/seo/topical-map/canvas/topicalMapCanvasContent.ts — the
 * `topical_map` canvas POINTER (R12; precedent `working_document`).
 *
 * A map in the chat canvas is a pointer `{ mapId, screen, siteId }` to a live
 * workspace the body reads from the store and the `seo.*` functions — never an
 * artifact. There is nothing serializable worth freezing: the map's truth is
 * its rows, and a `canvas_items` copy would be a stale second map that drifts
 * the moment somebody accepts a proposal. That is why the type sits in
 * `NON_PERSISTABLE_CANVAS_TYPES` and why this file is PURE (no React, no
 * Redux): the tool-result canvas registry and the kind component both build
 * the same content from it.
 */

import type { CanvasContent } from "@/features/canvas/redux/canvasSlice";

import type { MapWorkspaceScreen } from "../useMapWorkspaceParams";

export interface TopicalMapCanvasPointer {
  mapId: string;
  screen: MapWorkspaceScreen;
  siteId: string | null;
}

export interface BuildTopicalMapCanvasContentOptions {
  mapId: string;
  /** Defaults to the outline — the map's index screen. */
  screen?: MapWorkspaceScreen | null;
  siteId?: string | null;
  /** The pane title; the map's name when the caller has it. */
  title?: string | null;
  /** The chat this pane was opened from, when the opener knows it. */
  conversationId?: string | null;
}

/** One pane per map: offering the same map twice must show ONE pane. */
export function topicalMapCanvasSourceId(mapId: string): string {
  return `topical-map:${mapId}`;
}

export function buildTopicalMapCanvasContent({
  mapId,
  screen,
  siteId,
  title,
  conversationId,
}: BuildTopicalMapCanvasContentOptions): CanvasContent {
  const pointer: TopicalMapCanvasPointer = {
    mapId,
    screen: screen ?? "outline",
    siteId: siteId ?? null,
  };
  return {
    type: "topical_map",
    data: pointer,
    metadata: {
      title: title?.trim() || "Topical map",
      conversationId: conversationId ?? undefined,
      sourceMessageId: topicalMapCanvasSourceId(mapId),
    },
  };
}

/** Narrow a canvas `data` value back onto the pointer; null when it is not one. */
export function readTopicalMapCanvasPointer(data: unknown): TopicalMapCanvasPointer | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (typeof value.mapId !== "string" || !value.mapId) return null;
  const screen = value.screen;
  return {
    mapId: value.mapId,
    screen: isWorkspaceScreen(screen) ? screen : "outline",
    siteId: typeof value.siteId === "string" && value.siteId ? value.siteId : null,
  };
}

const SCREENS: readonly MapWorkspaceScreen[] = [
  "outline",
  "table",
  "graph",
  "text",
  "pages",
  "history",
];

export function isWorkspaceScreen(value: unknown): value is MapWorkspaceScreen {
  return typeof value === "string" && (SCREENS as readonly string[]).includes(value);
}

/** The six screens in the order the shell header lists them. */
export const MAP_WORKSPACE_SCREENS = SCREENS;
