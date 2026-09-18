"use client";

/**
 * TEXT — `seo.map_outline`, exactly what an agent receives, read-only and
 * copyable. Moved out of `TopicalMapWorkspaceBody` unchanged (Phase 0).
 *
 * This screen is deliberately NOT a rendering of the map: it is the bytes the
 * agent is handed, so what the person reads here and what the agent read are
 * provably the same thing.
 */

import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "../components/TopicalMapStates";
import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { useMapOutline } from "../hooks";

export function TextView({ mapId, siteId }: MapViewProps) {
  const outline = useMapOutline(mapId, { siteId: siteId ?? undefined });

  if (outline.isPending) return <TopicalMapLoading what="the agent outline" />;
  if (outline.isError)
    return <TopicalMapFailed what="the agent outline" error={outline.error} />;

  if (!outline.data.trim()) {
    return (
      <TopicalMapEmpty
        title="The outline is empty"
        detail="seo.map_outline returned nothing, which means this map has no topics an agent could be shown yet."
      />
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Text view
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        This is the map exactly as an agent receives it (seo.map_outline), not a
        rendering of it.
      </p>
      <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-xs">
        {outline.data}
      </pre>
    </section>
  );
}
