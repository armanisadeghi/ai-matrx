"use client";

/**
 * DbToolRendererImpl — renders a tool's DB-stored renderer.
 *
 * Resolution per render:
 *   1. Positive cache hit  -> render the compiled component inside the error
 *      boundary (fallback = GenericRenderer).
 *   2. Negative cache hit   -> render GenericRenderer (tool has no DB renderer).
 *   3. Otherwise            -> fire a single deduped fetch+compile; render null
 *      while it resolves (compile is synchronous + fast once the row lands, so
 *      a big spinner would only flash). On resolve we either cache+re-render
 *      the component or mark negative and fall to GenericRenderer.
 *
 * This is the SYNCHRONOUS-compiler path. The component itself loads lazily
 * (see DbToolRenderer.tsx) so `@babel/standalone` never enters the main chat
 * bundle — it arrives only when a tool actually has a DB renderer.
 */
import React, { useEffect, useState } from "react";

import { GenericRenderer } from "../registry/GenericRenderer";
import type { ToolRendererProps } from "../types";
import { ToolRendererErrorBoundary } from "./ToolRendererErrorBoundary";
import {
  getCachedToolRenderer,
  isKnownNoToolRenderer,
  loadToolRenderer,
} from "./toolRendererCache";
import { useToolRendererVersion } from "./useToolRendererVersion";

export interface DbToolRendererImplProps extends ToolRendererProps {
  toolName: string;
}

export const DbToolRendererImpl: React.FC<DbToolRendererImplProps> = ({
  toolName,
  ...toolProps
}) => {
  // Bumps when the tool's renderer is invalidated (agent edited its `tool_ui`
  // row mid-session) — re-runs resolution against the now-empty cache so the
  // card repaints with the fresh code, no hard refresh (D115).
  const version = useToolRendererVersion(toolName);

  // Seed from the positive cache so a warmed/prefetched renderer paints on the
  // first render with no flash. `null` means "not resolved yet this mount".
  const [component, setComponent] =
    useState<React.ComponentType<ToolRendererProps> | null>(() =>
      getCachedToolRenderer(toolName),
    );
  // Once we've resolved (component OR confirmed-negative), stop fetching.
  const [resolved, setResolved] = useState<boolean>(
    () =>
      getCachedToolRenderer(toolName) !== null ||
      isKnownNoToolRenderer(toolName),
  );

  // Resolve once per (toolName, version). `loadToolRenderer` answers from the
  // positive/negative cache immediately when warm, so this is one microtask on
  // the warm path and the shared deduped fetch+compile on the cold path. A
  // version bump re-enters with the cache cleared; the previous compile keeps
  // rendering until the fresh one lands (no blank flash), then swaps in.
  useEffect(() => {
    let cancelled = false;
    void loadToolRenderer(toolName).then((compiled) => {
      if (cancelled) return;
      setComponent(() => compiled);
      setResolved(true);
    });

    return () => {
      cancelled = true;
    };
  }, [toolName, version]);

  if (component) {
    const Compiled = component;
    return (
      <ToolRendererErrorBoundary
        toolName={toolName}
        fallback={<GenericRenderer {...toolProps} />}
      >
        <Compiled {...toolProps} />
      </ToolRendererErrorBoundary>
    );
  }

  // Resolved with no renderer -> the canonical generic fallback.
  if (resolved) return <GenericRenderer {...toolProps} />;

  // Still fetching: render nothing (compile is fast; avoid a spinner flash).
  return null;
};
