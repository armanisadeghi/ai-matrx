"use client";

// features/marketing/seo/topical-map/views/graph/GraphToolbar.tsx
//
// The drawing's own controls: where you are, how it is grouped, how it is laid
// out, and how dense it currently is. It renders a plain element;
// `GraphViewImpl` puts it inside React Flow's `Panel` (this file must not
// import the canvas engine — eslint's reactFlowStaticImportBan).
//
// The regroup dropdown is the reason this component reads the store at all:
// `seo.map_facet` is org-scoped, and the organization comes off the MAP row
// (`useTopicalMap(mapId).data.organization_id`), never off an ambient "current
// organization" — a map you are looking at is not necessarily a map of the org
// you last switched to.
//
// A refused facet read shows the FUNCTION'S OWN SENTENCE through
// `TopicalMapFailed`; there is no reworded "could not load facets" anywhere in
// this feature.

import { LayoutGrid, Undo2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { TopicalMapFailed } from "../../components/TopicalMapStates";
import { useMapFacets, useTopicalMap } from "../../hooks";
import type { GraphBand } from "./bands";
import { graphBandLabel } from "./bands";

/** The sentinel the Select uses for "group by nothing" — Radix refuses "". */
const NO_GROUPING = "__none__";

export interface GraphToolbarProps {
  mapId: string;
  /** The focused topic's slug, or null for the whole map. */
  focusSlug: string | null;
  /** The focused topic's NAME, or null when the drawing does not hold it. */
  focusName: string | null;
  onClearFocus: () => void;
  groupBy: string | null;
  onGroupByChange: (groupBy: string | null) => void;
  onAutoArrange: () => void;
  band: GraphBand;
  visibleCount: number;
  /** A record-only grantee: view controls stay, write controls are absent. */
  readOnly: boolean;
}

export function GraphToolbar({
  mapId,
  focusSlug,
  focusName,
  onClearFocus,
  groupBy,
  onGroupByChange,
  onAutoArrange,
  band,
  visibleCount,
  readOnly,
}: GraphToolbarProps) {
  const map = useTopicalMap(mapId);
  const organizationId = map.data?.organization_id ?? "";
  const facets = useMapFacets({ organizationId }, Boolean(organizationId));

  return (
    <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card/95 p-1.5 shadow-md backdrop-blur">
      {focusSlug ? (
        <>
          <button
            type="button"
            onClick={onClearFocus}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            Back to the whole map
          </button>
          <span
            className="max-w-[180px] truncate rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-foreground"
            title={focusName ?? focusSlug}
          >
            {focusName ??
              /* The focus names a topic this drawing does not hold — the whole
                 map is shown, and the crumb says why rather than pretending. */
              `${focusSlug} — not in this drawing`}
          </span>
        </>
      ) : null}

      <Select
        value={groupBy ?? NO_GROUPING}
        onValueChange={(value) => onGroupByChange(value === NO_GROUPING ? null : value)}
      >
        <SelectTrigger
          className="h-7 w-[150px] text-[11px]"
          aria-label="Group the drawing by a facet"
        >
          <SelectValue placeholder="No grouping" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_GROUPING}>No grouping</SelectItem>
          {(facets.data ?? []).map((facet) => (
            <SelectItem key={facet.id} value={facet.key}>
              {facet.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {readOnly ? null : (
        <button
          type="button"
          onClick={onAutoArrange}
          title="Lay the visible topics out again on screen. Nothing is saved."
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
          Auto-arrange
        </button>
      )}

      <span className="px-1.5 text-[11px] text-muted-foreground">
        {graphBandLabel(band)} · {visibleCount} topic{visibleCount === 1 ? "" : "s"} on screen
      </span>

      {facets.isError ? (
        <div className="w-full">
          <TopicalMapFailed what="the facets this map can be grouped by" error={facets.error} />
        </div>
      ) : null}
      {map.isError ? (
        <div className="w-full">
          <TopicalMapFailed what="this map" error={map.error} />
        </div>
      ) : null}
    </div>
  );
}
