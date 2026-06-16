"use client";

import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceImportance } from "../../ranking";

/**
 * Always-visible ranking for a source: the total importance score, plus the
 * per-keyword search rank for every keyword it surfaced under. Rank is
 * everything for a websearch — none of this is hidden.
 */
export function SourceRankBadges({
  importance,
  className,
}: {
  importance: SourceImportance | undefined;
  className?: string;
}) {
  if (!importance || importance.keywordCount === 0) {
    return (
      <span className="text-[11px] text-muted-foreground">
        Not ranked for any keyword
      </span>
    );
  }

  const { score, bestRank, perKeyword } = importance;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
          <TrendingUp className="h-3 w-3" />
          Importance {score}
        </span>
        {bestRank != null && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            best #{bestRank} · {perKeyword.length} keyword
            {perKeyword.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {perKeyword.map((k) => (
          <span
            key={k.keyword_id}
            title={`Rank ${k.rank ?? "—"} for "${k.keyword}"`}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px]"
          >
            <span className="font-mono tabular-nums text-foreground/80">
              #{k.rank ?? "—"}
            </span>
            <span className="text-muted-foreground truncate max-w-[11rem]">
              {k.keyword}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
