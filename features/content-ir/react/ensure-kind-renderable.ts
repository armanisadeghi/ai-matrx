"use client";

/**
 * THE CONVERGENCE SEAM — fetch-from-render.
 *
 * The loading sequence for a `__kind` block must be IDENTICAL no matter how
 * the block arrived: live stream, DB reload of history, workflow transport,
 * a pasted payload. Before this seam existed, the schema/component cold
 * fetches were triggered only by the LIVE STREAM's kind event
 * (stream-block-accumulator), so a block rendered from the database had
 * nobody fetching its component — it sat on the generic fallback until the
 * user happened to navigate somewhere that warmed the registry and came
 * back. (Arman: "something won't render, but you go to a different page and
 * come back, and suddenly it renders.")
 *
 * The fix is structural: the RENDER PATH itself requests whatever it is
 * missing. Rendering a kind block IS the demand signal, and it exists on
 * every path by definition. Both registries dedupe in-flight requests and
 * remember misses, so calling this once per (mount, kind) is idempotent and
 * cheap; the granular repaint hook (useContentIrKindVersion) re-runs the
 * route when the answers land.
 */

import { useEffect } from "react";
import { kindRegistry } from "../registry/kind-registry";
import { componentRegistry } from "../registry/component-registry";
import { MATRX_CONTENT_IR_PLATFORM } from "../host/route-env";

/**
 * Fire-and-forget: make sure this kind's schema and web output component are
 * fetched (or known-missing). Safe to call redundantly — every layer dedupes.
 */
export function ensureKindRenderable(kind: string): void {
  if (!kindRegistry.getSchema(kind)) {
    kindRegistry.requestSchema(kind);
  }
  if (!componentRegistry.resolve(kind, MATRX_CONTENT_IR_PLATFORM, "output")) {
    componentRegistry.requestComponent(
      kind,
      MATRX_CONTENT_IR_PLATFORM,
      "output",
    );
  }
}

/**
 * Hook form for render paths: request on mount and whenever the kind
 * changes. Pass null for blocks with no envelope kind (nothing to fetch).
 */
export function useEnsureKindRenderable(kind: string | null): void {
  useEffect(() => {
    if (kind) ensureKindRenderable(kind);
  }, [kind]);
}
