"use client";

/**
 * useToolRendererVersion — subscribes a mounted consumer to a tool's renderer
 * version (bumped by `invalidateToolRenderer` / `invalidateAllToolRenderers`).
 *
 * The in-session repaint half of D115: when an agent edits a `tool_ui` row,
 * `toolStateEffects` fires the invalidation by name, the cache bumps the
 * version, and every card/label reading this hook re-resolves against the
 * (now empty) cache — no hard refresh.
 */
import { useSyncExternalStore } from "react";

import {
  getToolRendererVersion,
  subscribeToolRendererVersions,
} from "./toolRendererCache";

export function useToolRendererVersion(
  toolName: string | null | undefined,
): number {
  return useSyncExternalStore(
    subscribeToolRendererVersions,
    () => (toolName ? getToolRendererVersion(toolName) : 0),
    () => 0,
  );
}
