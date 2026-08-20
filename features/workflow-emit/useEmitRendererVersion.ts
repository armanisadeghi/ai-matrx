"use client";

/**
 * useEmitRendererVersion — subscribes a mounted emission to its renderer's
 * version (bumped by `invalidateEmitRenderer` / `invalidateAllEmitRenderers`).
 *
 * The in-session repaint half of D115 for the workflow-emit surface: when an
 * agent edits a `tool_ui` row, `toolStateEffects` fires the invalidation by
 * NAME, this cache bumps the version, and every mounted emission reading this
 * hook re-resolves against the (now empty) cache — no hard refresh.
 *
 * Mirrors `tool-call-visualization/db-renderer/useToolRendererVersion.ts`.
 */
import { useSyncExternalStore } from "react";

import {
  getEmitRendererVersion,
  subscribeEmitRendererVersions,
} from "./emitRendererCache";

export function useEmitRendererVersion(
  componentRef: string | null | undefined,
): number {
  return useSyncExternalStore(
    subscribeEmitRendererVersions,
    () => (componentRef ? getEmitRendererVersion(componentRef) : 0),
    () => 0,
  );
}
