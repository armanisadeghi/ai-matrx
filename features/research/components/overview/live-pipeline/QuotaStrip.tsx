"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResearchTopic } from "../../../types";
import type {
  PipelineState,
  PipelineDerived,
} from "../../../hooks/usePipelineProgress";

interface Props {
  topic: ResearchTopic | null | undefined;
  state: PipelineState;
  derived: PipelineDerived;
}

interface BarProps {
  label: string;
  current: number;
  cap: number;
  unit?: string;
}

function Bar({ label, current, cap, unit }: BarProps) {
  const percent = cap > 0 ? Math.min(100, (current / cap) * 100) : 0;
  const atCap = current >= cap;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-[80px]">
        <span
          className={cn(
            "text-[10px] tabular-nums shrink-0",
            atCap ? "text-amber-600 dark:text-amber-400 font-medium" : "text-foreground/80",
          )}
        >
          {current}/{cap}
          {unit && <span className="text-muted-foreground/70 ml-0.5">{unit}</span>}
        </span>
        <div className="flex-1 h-1 rounded-full bg-muted/60 overflow-hidden min-w-[40px]">
          <div
            className={cn(
              "h-full transition-all",
              atCap ? "bg-amber-500" : "bg-primary/70",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Live capacity bars showing how the pipeline is using its quota ladder
 * (per QUOTA_LADDER.md). Hidden if the topic isn't loaded yet.
 */
export function QuotaStrip({ topic, state, derived }: Props) {
  if (!topic) return null;

  const keywordsUsed = state.stages.search.itemOrder.length;
  const sourcesPerKeyword = topic.scrapes_per_keyword;
  const analysesPerKeyword = topic.analyses_per_keyword;

  // Aggregate scrape "good" vs cap (cap = scrapes_per_keyword × keyword_count, approx).
  const scrapesGoodMax =
    keywordsUsed > 0 ? keywordsUsed * sourcesPerKeyword : sourcesPerKeyword;
  const scrapesGood = state.stages.scrape.totals.succeeded;

  return (
    <div className="px-3 py-1.5 border-b border-border/30 bg-muted/10 space-y-1">
      <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
        <Bar
          label="Keywords"
          current={keywordsUsed}
          cap={topic.max_keywords}
        />
        <Bar
          label="Scrapes"
          current={scrapesGood}
          cap={scrapesGoodMax}
          unit={`(${sourcesPerKeyword}/kw)`}
        />
        <Bar
          label="Analyses"
          current={derived.totalAnalysesCompleted}
          cap={analysesPerKeyword * Math.max(1, keywordsUsed)}
          unit={`(${analysesPerKeyword}/kw)`}
        />
        <Bar
          label="Kw syntheses"
          current={
            Object.values(state.stages.synthesize.items).filter(
              (i) => i.metadata.scope === "keyword" && i.status === "success",
            ).length
          }
          cap={topic.max_keyword_syntheses}
        />
        <Bar
          label="Reports"
          current={
            Object.values(state.stages.synthesize.items).filter(
              (i) => i.metadata.scope === "topic" && i.status === "success",
            ).length
          }
          cap={topic.max_topic_syntheses}
        />
        <Bar
          label="Documents"
          current={state.stages.report.items["document"]?.status === "success" ? 1 : 0}
          cap={topic.max_documents}
        />
      </div>
      {derived.dedupLabel && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-400">
          <Star className="h-2.5 w-2.5 shrink-0" />
          <span>
            <span className="font-semibold">8-for-1 dedup:</span>{" "}
            {derived.dedupLabel}
          </span>
        </div>
      )}
    </div>
  );
}
