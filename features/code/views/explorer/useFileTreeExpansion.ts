"use client";

import { useCallback, useState } from "react";

/**
 * Tracks which directory paths are expanded in the file tree.
 * Kept local (per-workspace instance) rather than in Redux — the state is
 * ephemeral UI and doesn't need to survive reloads.
 */
export function useFileTreeExpansion(initialExpanded: string[] = ["/"]) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialExpanded),
  );

  const isExpanded = useCallback(
    (path: string) => expanded.has(path),
    [expanded],
  );

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expand = useCallback((path: string) => {
    setExpanded((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const expandAll = useCallback((paths: readonly string[]) => {
    setExpanded((prev) => {
      const missingPath = paths.some((path) => !prev.has(path));
      if (!missingPath) return prev;
      const next = new Set(prev);
      for (const path of paths) next.add(path);
      return next;
    });
  }, []);

  const collapse = useCallback((path: string) => {
    setExpanded((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  return { isExpanded, toggle, expand, expandAll, collapse };
}
