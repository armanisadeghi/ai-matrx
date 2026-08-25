"use client";

/**
 * `serp_placement` — THE canonical component for one position on a results
 * page (Rank Kinds Run, Stage B).
 *
 * 🚨 THE POINT OF THIS COMPONENT IS THAT IT RENDERS ALMOST NOTHING. The
 * placement carries the two ranks, the block type and the "you are here"
 * flag; the RESULT itself is a discriminated union over the EIGHT search kinds
 * the search pilot already shipped, componented and verified. So the payload
 * is handed straight to `RankKindNested`, which recognizes it as a search kind
 * and forwards it to `SearchKindNested` — the identical static-sibling-map +
 * db-override seam the search collection uses. A result inside a tracked SERP
 * therefore renders through the exact same component (and honours the exact
 * same user-authored db override) as the same result inside a search.
 *
 * Never add a branch here that renders a nested kind itself. That is the
 * second-renderer defect the canonical-component law exists to prevent, and it
 * is the reason this family mints no `serp_organic_result`.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { isRecord, num, readSearchKindValue } from "../search-kinds/search-kind-data";
import { RankKindNested } from "./RankKindNested";
import {
  RankBadge,
  RankChip,
  TrackedTargetMarker,
  resultTypeLabel,
} from "./rank-kind-shared";

interface SerpPlacementBlockProps {
  serverData?: unknown;
  className?: string;
}

export function SerpPlacementBlock({
  serverData,
  className,
}: SerpPlacementBlockProps) {
  const { value } = readSearchKindValue<"serp_placement">(serverData);

  const absolute = num(value.absolute_rank);
  const organic = num(value.organic_rank);
  const isTarget = value.is_tracked_target === true;
  const result = isRecord(value.result) ? value.result : null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3",
        isTarget
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-card",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-1">
        <RankBadge
          rank={absolute}
          caption="on page"
          emphasis={isTarget}
        />
        {organic !== null && organic !== absolute && (
          <RankBadge rank={organic} caption="organic" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <RankChip>{resultTypeLabel(value.result_type)}</RankChip>
          {isTarget && <TrackedTargetMarker />}
        </div>

        {result ? (
          // The whole delegation. Eight shipped kinds, zero of them re-drawn.
          <RankKindNested value={result} />
        ) : (
          <p className="text-xs italic text-muted-foreground">
            This position was recorded, but the engine returned no result body
            for it.
          </p>
        )}
      </div>
    </div>
  );
}

export default SerpPlacementBlock;
