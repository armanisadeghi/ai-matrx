"use client";

// features/marketing/local/rank-grid/RankGridMap.tsx — the grid on a map:
// preview dots before any spend, rank bubbles after. Renders through the one
// Leaflet canvas (`MapCanvas`), split in place behind the screen's own
// condition (a preview or result exists) and kept off the server render.

import dynamic from "next/dynamic";
import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import type { MapMarker } from "@/components/mardown-display/blocks/map/MapCanvas";
import { BUBBLE_CLASS, LEGEND } from "./grid-model";

const MapCanvas = dynamic(() => import("@/components/mardown-display/blocks/map/MapCanvas"), {
  ssr: false,
  loading: () => <RegionSkeleton shape="cards" count={1} aria-label="Loading map" />,
});

export function RankGridMap({
  markers,
  showLegend,
}: {
  markers: MapMarker[];
  showLegend: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-[28rem] overflow-hidden rounded-md border border-border" data-testid="rank-grid-map">
        <MapCanvas markers={markers} />
      </div>
      {showLegend ? (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
          {LEGEND.map((item) => (
            <li key={item.tone} className="flex items-center gap-1">
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded-full border-2 px-0.5 text-xs font-semibold ${BUBBLE_CLASS[item.tone]}`}
              >
                {item.text}
              </span>
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
