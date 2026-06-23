"use client";

/**
 * DbEmitRendererImpl — renders a workflow node's emission.
 *
 * Three branches, decided by `componentRef`:
 *
 *   1. componentRef === null  → the generic path. Render `GenericEmitRenderer`
 *      directly (no fetch, no compile). For mode==="confirmation" this yields a
 *      simple inline confirmation line from title / payload.message.
 *   2. componentRef set, custom renderer resolves → render the compiled
 *      component inside the error boundary (fallback = GenericEmitRenderer).
 *   3. componentRef set, no row / fails to compile → fall through to
 *      GenericEmitRenderer.
 *
 * Resolution per render mirrors `DbToolRendererImpl`:
 *   - Positive cache hit → render the compiled component immediately.
 *   - Negative cache hit → render GenericEmitRenderer (no custom renderer).
 *   - Otherwise          → fire a single deduped fetch+compile; render the
 *     generic body while it resolves (compile is synchronous + fast once the
 *     row lands, and the generic body is a correct, complete rendering — so the
 *     custom component simply upgrades it in place rather than flashing blank).
 *
 * This is the SYNCHRONOUS-compiler path. The component itself loads lazily (see
 * DbEmitRenderer.tsx) so `@babel/standalone` never enters the main bundle — it
 * arrives only when a node actually has a custom renderer.
 */
import React, { useEffect, useRef, useState } from "react";

import { EmitRendererErrorBoundary } from "./EmitRendererErrorBoundary";
import {
  getCachedEmitRenderer,
  isKnownNoEmitRenderer,
  loadEmitRenderer,
} from "./emitRendererCache";
import { GenericEmitRenderer } from "./GenericEmitRenderer";
import type { EmitRendererProps } from "./types";

export interface DbEmitRendererImplProps extends EmitRendererProps {
  /** A `tool_ui.tool_name` to render with, or null = the generic renderer. */
  componentRef: string | null;
}

export const DbEmitRendererImpl: React.FC<DbEmitRendererImplProps> = ({
  componentRef,
  ...emitProps
}) => {
  // Seed from the positive cache so a warmed/prefetched renderer paints on the
  // first render with no flash. `null` means "not resolved yet this mount" (or
  // there's no ref to resolve at all).
  const [component, setComponent] =
    useState<React.ComponentType<EmitRendererProps> | null>(() =>
      componentRef ? getCachedEmitRenderer(componentRef) : null,
    );
  // Once we've resolved (component OR confirmed-negative OR no ref), stop.
  const [resolved, setResolved] = useState<boolean>(() => {
    if (!componentRef) return true;
    return (
      getCachedEmitRenderer(componentRef) !== null ||
      isKnownNoEmitRenderer(componentRef)
    );
  });
  const fetchedRef = useRef(false);

  // Fire the fetch exactly once per mount when a ref is set and nothing is
  // cached yet. The shared in-flight promise in the cache dedups across sibling
  // emissions; the `cancelled` guard avoids a state update after unmount.
  useEffect(() => {
    if (!componentRef || component || resolved || fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    void loadEmitRenderer(componentRef).then((compiled) => {
      if (cancelled) return;
      if (compiled) setComponent(() => compiled);
      setResolved(true);
    });

    return () => {
      cancelled = true;
    };
  }, [componentRef, component, resolved]);

  if (component) {
    const Compiled = component;
    return (
      <EmitRendererErrorBoundary
        componentRef={componentRef ?? ""}
        fallback={<GenericEmitRenderer {...emitProps} />}
      >
        <Compiled {...emitProps} />
      </EmitRendererErrorBoundary>
    );
  }

  // No ref, resolved-negative, or still fetching: the generic body is a
  // complete, correct rendering — show it now; a custom renderer upgrades it in
  // place once it resolves.
  return <GenericEmitRenderer {...emitProps} />;
};
