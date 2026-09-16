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
  getCachedToolRenderer,
  getCachedToolMeta,
  isKnownNoToolRenderer,
  loadToolRenderer,
  type ToolRendererMeta,
} from "./toolRendererCache";
import { useToolRendererVersion } from "./useToolRendererVersion";

export type DbToolRendererResolution = "resolving" | "custom" | "generic";

export interface DbToolRendererState {
  meta: ToolRendererMeta | null;
  resolution: DbToolRendererResolution;
}

interface VersionedDbToolRendererState extends DbToolRendererState {
  toolName: string | null;
  version: number;
}

function readRendererState(
  toolName: string | null | undefined,
  version: number,
): VersionedDbToolRendererState {
  if (!toolName) {
    return { toolName: null, version, meta: null, resolution: "generic" };
  }

  return {
    toolName,
    version,
    meta: getCachedToolMeta(toolName),
    resolution: getCachedToolRenderer(toolName)
      ? "custom"
      : isKnownNoToolRenderer(toolName)
        ? "generic"
        : "resolving",
  };
}

/**
 * Resolve both the DB-authored shell metadata and whether the tool actually
 * has a compiled custom renderer. The explicit resolution state matters to
 * the shell: `null` metadata alone cannot distinguish a cache miss still in
 * flight from a confirmed generic fallback.
 */
export function useDbToolRendererState(
  toolName: string | null | undefined,
): DbToolRendererState {
  const version = useToolRendererVersion(toolName);
  const [state, setState] = useState<VersionedDbToolRendererState>(() =>
    readRendererState(toolName, version),
  );

  const current =
    state.toolName === (toolName ?? null) && state.version === version
      ? state
      : readRendererState(toolName, version);

  useEffect(() => {
    if (!toolName) return undefined;
    let cancelled = false;
    void loadToolRenderer(toolName).then(() => {
      if (!cancelled) setState(readRendererState(toolName, version));
    });
    return () => {
      cancelled = true;
    };
  }, [toolName, version]);

  return { meta: current.meta, resolution: current.resolution };
}

export function useDbToolMeta(
  toolName: string | null | undefined,
): ToolRendererMeta | null {
  return useDbToolRendererState(toolName).meta;
}
