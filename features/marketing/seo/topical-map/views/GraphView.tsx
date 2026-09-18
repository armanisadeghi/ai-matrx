"use client";

/**
 * GRAPH — the map drawn as a graph.
 *
 * Phase 0 renders the U1 harness. Lane C owns the real drawing, and it is the
 * ONE dynamic import edge in this feature (CONTRACTS §0):
 * `GraphView.tsx` → `GraphViewImpl.tsx`, `ssr: false`, because xy-flow measures
 * the DOM. That edge does not exist yet — there is nothing behind it to load —
 * and adding it now would be a boundary around a harness, which buys neither of
 * the two things a dynamic import buys (code-splitting skill, rules 1 and 4).
 */

import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { MapTreeHarness } from "./MapTreeHarness";

export function GraphView({ mapId, siteId }: MapViewProps) {
  return <MapTreeHarness mapId={mapId} siteId={siteId} view="graph" />;
}
