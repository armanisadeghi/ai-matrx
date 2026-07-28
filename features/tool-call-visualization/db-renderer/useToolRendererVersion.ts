"use client";

/**
 * useToolRendererVersion — late-arrival repaint for DB-driven tool renderers.
 *
 * `DbToolRendererImpl` reads the module `toolRendererCache` once on mount and
 * caches the compiled renderer in local state; it never re-fetches on its own.
 * So when a renderer row changes AFTER a card mounted — an agent editing the
 * renderer mid-session via the `toolcomp_*` tools, or an admin saving a revision
 * — busting the module cache is invisible to the mounted card and it stays stuck
 * on the STALE compiled renderer until a hard refresh.
 *
 * This hook subscribes the card to the cache's repaint signal and returns a
 * monotonic version for its tool. When `invalidateToolRenderer(toolName)` (or
 * the wholesale `invalidateAllToolRenderers()`) fires, the version changes and
 * the card re-resolves from the now-busted cache. Granular: a targeted bump only
 * changes the edited tool's snapshot, so unrelated cards don't re-render (their
 * snapshot is unchanged and `useSyncExternalStore` bails out). Mirrors
 * content-ir's per-kind `useContentIrKindVersion`.
 */

import { useCallback, useSyncExternalStore } from "react";

import {
  getToolRendererVersion,
  subscribeToolRenderer,
} from "./toolRendererCache";

const zero = () => 0;

export function useToolRendererVersion(toolName: string): number {
  const getSnapshot = useCallback(
    () => getToolRendererVersion(toolName),
    [toolName],
  );
  // SSR snapshot is `zero`: the impl is client-only (`dynamic({ ssr: false })`),
  // so the server value is never actually rendered.
  return useSyncExternalStore(subscribeToolRenderer, getSnapshot, zero);
}
