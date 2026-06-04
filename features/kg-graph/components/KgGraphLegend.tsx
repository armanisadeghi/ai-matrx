// features/kg-graph/components/KgGraphLegend.tsx
//
// Compact overlay key for the active colour encoding. By kind: a swatch per kind
// present in the view. By community: how many groups the Markov clustering found.
// pointer-events-none so it never blocks canvas interaction.

"use client";

import { colorForKind } from "../constants";
import type { KgColorBy } from "../cytoscape/analysis";

interface KgGraphLegendProps {
  colorBy: KgColorBy;
  /** Kinds present in the current view (already filtered/sorted by the canvas). */
  kinds: string[];
  /** Multi-node communities detected by the last analysis pass. */
  communityCount: number;
}

export function KgGraphLegend({
  colorBy,
  kinds,
  communityCount,
}: KgGraphLegendProps) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 max-w-[60%] rounded-md border border-border bg-card/80 px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur">
      {colorBy === "kind" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {kinds.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorForKind(k) }}
              />
              <span className="text-muted-foreground">{k}</span>
            </span>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">
          {communityCount > 0
            ? `${communityCount} ${communityCount === 1 ? "community" : "communities"} detected · unclustered nodes in grey`
            : "No multi-node communities detected"}
        </span>
      )}
    </div>
  );
}
