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
import React, { useEffect, useRef, useState } from "react";

import { GenericRenderer } from "../registry/GenericRenderer";
import type { ToolRendererProps } from "../types";
import { ToolRendererErrorBoundary } from "./ToolRendererErrorBoundary";
import {
  getCachedToolRenderer,
  isKnownNoToolRenderer,
  loadToolRenderer,
} from "./toolRendererCache";

export interface DbToolRendererImplProps extends ToolRendererProps {
  toolName: string;
}

export const DbToolRendererImpl: React.FC<DbToolRendererImplProps> = ({
  toolName,
  ...toolProps
}) => {
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
  const fetchedRef = useRef(false);

  // Fire the fetch exactly once per mount when nothing is cached yet. The
  // shared in-flight promise in the cache dedups across sibling cards; the
  // `cancelled` guard avoids a state update after unmount.
  useEffect(() => {
    if (component || resolved || fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    void loadToolRenderer(toolName).then((compiled) => {
      if (cancelled) return;
      if (compiled) setComponent(() => compiled);
      setResolved(true);
    });

    return () => {
      cancelled = true;
    };
  }, [toolName, component, resolved]);

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
