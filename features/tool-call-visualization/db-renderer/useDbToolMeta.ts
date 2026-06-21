"use client";

/**
 * useDbToolMeta — resolves a tool's author-declared shell metadata
 * (display_name, results_label) from its `tool_ui` row, so the collapsed line
 * reads the label the renderer's author chose ("Weather") instead of the
 * humanized tool name ("Travel Get Weather").
 *
 * Synchronous when warm: returns the cached metadata on the first render if the
 * renderer was already fetched/prefetched. Cold path: kicks off the shared
 * `loadToolRenderer` fetch (deduped + reused by the body renderer) and
 * re-renders once the row lands. Tools with no DB row resolve to null and the
 * caller keeps its in-code / humanized label — zero cost on the 97% path.
 */
import { useEffect, useState } from "react";

import {
  getCachedToolMeta,
  loadToolRenderer,
  type ToolRendererMeta,
} from "./toolRendererCache";

export function useDbToolMeta(
  toolName: string | null | undefined,
): ToolRendererMeta | null {
  // Warm first paint: the initializer reads the cache, so a prefetched tool
  // renders its label with no flash. The effect drives the cold path.
  const [meta, setMeta] = useState<ToolRendererMeta | null>(() =>
    toolName ? getCachedToolMeta(toolName) : null,
  );

  useEffect(() => {
    if (!toolName) return;
    let cancelled = false;
    // `loadToolRenderer` is the SHARED, deduped fetch the body renderer already
    // fires; it populates the metadata cache the moment the row lands (before
    // compile). Resolves immediately when warm / negative-cached, so the only
    // state write is async — no synchronous setState-in-effect. Reading the
    // cache inside `.then` keeps `meta` reactive (compiler-safe).
    void loadToolRenderer(toolName).then(() => {
      if (!cancelled) setMeta(getCachedToolMeta(toolName));
    });
    return () => {
      cancelled = true;
    };
  }, [toolName]);

  return meta;
}
