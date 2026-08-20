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
import React, { useEffect, useState } from "react";

import { EmitRendererErrorBoundary } from "./EmitRendererErrorBoundary";
import {
  getCachedEmitRenderer,
  loadEmitRenderer,
} from "./emitRendererCache";
import { GenericEmitRenderer } from "./GenericEmitRenderer";
import type { EmitRendererProps } from "./types";
import { useEmitRendererVersion } from "./useEmitRendererVersion";

export interface DbEmitRendererImplProps extends EmitRendererProps {
  /** A `tool_ui.tool_name` to render with, or null = the generic renderer. */
  componentRef: string | null;
}

export const DbEmitRendererImpl: React.FC<DbEmitRendererImplProps> = ({
  componentRef,
  ...emitProps
}) => {
  const version = useEmitRendererVersion(componentRef);

  // Seed from the positive cache so a warmed/prefetched renderer paints on the
  // first render with no flash. `null` means "not resolved yet this mount" (or
  // there's no ref to resolve at all).
  const [component, setComponent] =
    useState<React.ComponentType<EmitRendererProps> | null>(() =>
      componentRef ? getCachedEmitRenderer(componentRef) : null,
    );
  // Resolve once per (componentRef, version) — the D115 shape, mirroring
  // `DbToolRendererImpl`. `loadEmitRenderer` answers from the positive/negative
  // cache immediately when warm (one microtask), and shares one deduped
  // fetch+compile across sibling emissions when cold. A version bump re-enters
  // with the cache cleared; the previous compile keeps rendering until the
  // fresh one lands, so an edited renderer repaints with no blank flash.
  useEffect(() => {
    if (!componentRef) {
      setComponent(null);
      return undefined;
    }

    let cancelled = false;
    void loadEmitRenderer(componentRef).then((compiled) => {
      if (cancelled) return;
      setComponent(() => compiled);
    });

    return () => {
      cancelled = true;
    };
  }, [componentRef, version]);

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
