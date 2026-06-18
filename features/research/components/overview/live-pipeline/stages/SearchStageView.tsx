"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Globe, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useResearchSources } from "../../../../hooks/useResearchState";
import type {
  PipelineState,
  WorkItem,
} from "../../../../hooks/usePipelineProgress";
import type { ResearchSource } from "../../../../types";
import { SectionCard } from "../ui/SectionCard";
import { StageHeader } from "../ui/StageHeader";
import { StatusDot } from "../ui/StatusDot";
import { Favicon } from "../ui/Favicon";
import { DeltaBadge } from "../ui/DeltaBadge";
import { FoldableSection } from "../ui/FoldableSection";

interface Props {
  state: PipelineState;
  topicId: string;
  /** sources/sec rate from derived */
  ratePerSec: number;
  etaSeconds: number | null;
  /** When non-initial, mark recent sources with delta badges. */
  iterationMode: "initial" | "rebuild" | "update" | null;
}

function KeywordCardBody({ item }: { item: WorkItem }) {
  const totalPages = item.metadata.total_pages ?? item.progress?.total ?? 5;
  const pagesCompleted =
    item.metadata.pages_completed ?? item.progress?.current ?? 0;
  const sources =
    item.metadata.stored_count ?? item.metadata.sources_found ?? 0;
  const percent = Math.round((pagesCompleted / Math.max(1, totalPages)) * 100);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusDot status={item.status} />
          <span className="text-xs font-medium truncate">{item.label}</span>
        </div>
        <span className="text-[11px] tabular-nums text-foreground/80 shrink-0">
          {sources > 0 ? `${sources} sources` : "—"}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-muted/60 overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              item.status === "success" ? "bg-green-500" : "bg-primary",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
          {pagesCompleted}/{totalPages}
        </span>
      </div>
    </>
  );
}

function KeywordCard({ item }: { item: WorkItem }) {
  const isActive = item.status === "active";
  const isDone = item.status === "success";
  const sources =
    item.metadata.stored_count ?? item.metadata.sources_found ?? 0;
  const [expanded, setExpanded] = useState(isActive);

  useEffect(() => {
    if (isActive) {
      setExpanded(true);
    } else if (isDone) {
      setExpanded(false);
    }
  }, [isActive, isDone, item.id]);

  const cardClass = cn(
    "rounded-lg border px-2.5 py-2 transition-colors",
    isActive
      ? "border-primary/40 bg-primary/5"
      : isDone
        ? "border-green-500/30 bg-green-500/5"
        : "border-border/60 bg-card/40",
  );

  if (isActive || !isDone) {
    return (
      <div className={cardClass}>
        <KeywordCardBody item={item} />
      </div>
    );
  }

  return (
    <FoldableSection
      open={expanded}
      onOpenChange={setExpanded}
      pill
      summary={
        <>
          <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
          <span className="truncate">{item.label}</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {sources > 0 ? `${sources} sources` : "done"}
          </span>
        </>
      }
      contentClassName="px-0.5"
    >
      <div className={cardClass}>
        <KeywordCardBody item={item} />
      </div>
    </FoldableSection>
  );
}

interface SourceRowProps {
  source: ResearchSource;
  isNew?: boolean;
  isChanged?: boolean;
}

function SourceRow({ source, isNew, isChanged }: SourceRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded transition-colors",
        "animate-in fade-in slide-in-from-top-1 duration-200",
        "hover:bg-muted/30",
      )}
    >
      <Favicon hostname={source.hostname} size={14} />
      <span className="text-[10px] text-muted-foreground tabular-nums w-24 truncate shrink-0">
        {source.hostname}
      </span>
      <span className="text-[11px] truncate flex-1">
        {source.title ?? source.url}
      </span>
      {isNew && <DeltaBadge delta="new" />}
      {isChanged && <DeltaBadge delta="changed" />}
      {source.rank && (
        <span className="text-[9px] font-mono text-muted-foreground/70 shrink-0">
          #{source.rank}
        </span>
      )}
    </div>
  );
}

export function SearchStageView({
  state,
  topicId,
  ratePerSec,
  etaSeconds,
  iterationMode,
}: Props) {
  const stage = state.stages.search;
  const items = stage.itemOrder.map((id) => stage.items[id]);
  const searchDone = stage.status !== "active" && stage.status !== "pending";
  const [sourceFeedOpen, setSourceFeedOpen] = useState(!searchDone);

  useEffect(() => {
    if (searchDone) {
      setSourceFeedOpen(false);
    }
  }, [searchDone]);

  // Refresh sources query whenever a new keyword finishes (storedCount changes).
  // We bind the refresh key to the sum of stored_count across items.
  const refreshKey = items.reduce(
    (sum, item) => sum + (item.metadata.stored_count ?? 0),
    0,
  );

  const sourcesQuery = useResearchSources(topicId);
  useEffect(() => {
    sourcesQuery.refresh();
    // refreshKey intentionally drives re-fetch; sourcesQuery would create a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Latest 24 sources by discovered_at desc.
  const latestSources = useMemo(() => {
    const all = sourcesQuery.data ?? [];
    const sorted = [...all].sort((a, b) => {
      const aT = a.discovered_at ? Date.parse(a.discovered_at) : 0;
      const bT = b.discovered_at ? Date.parse(b.discovered_at) : 0;
      return bT - aT;
    });
    return sorted.slice(0, 24);
  }, [sourcesQuery.data]);

  // Delta detection: sources discovered after the pipeline started count as "new".
  const pipelineStart = state.startedAt ?? 0;

  const totalSources = items.reduce(
    // Canonical "sources" metric: deduped stored count, falling back to the
    // running search-result count before storage lands. Matches the metrics
    // strip + per-item display so one screen never shows two different totals.
    (sum, item) =>
      sum + (item.metadata.stored_count ?? item.metadata.sources_found ?? 0),
    0,
  );

  return (
    <SectionCard
      title={
        <>
          <Search className="h-3 w-3 text-blue-500" />
          <span>Searching keywords</span>
        </>
      }
    >
      <StageHeader
        title="Parallel keyword search"
        icon={<Search className="h-3 w-3" />}
        stage={stage}
        subtitle={
          <span className="tabular-nums">
            {items.filter((i) => i.status === "success").length} /{" "}
            {items.length} keywords • {totalSources.toLocaleString()} sources
            discovered
          </span>
        }
        ratePerSec={ratePerSec}
        etaSeconds={etaSeconds}
      />

      {items.length > 0 && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {items.map((item) => (
            <KeywordCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {latestSources.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <FoldableSection
            open={sourceFeedOpen}
            onOpenChange={setSourceFeedOpen}
            summary={
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Globe className="h-2.5 w-2.5" />
                Live source feed ({latestSources.length})
              </span>
            }
            trailing={
              <span className="text-[10px] text-muted-foreground tabular-nums">
                of {sourcesQuery.data?.length ?? 0}
              </span>
            }
            contentClassName="pt-1.5"
          >
            <div className="space-y-0 max-h-64 overflow-y-auto">
              {latestSources.map((source) => {
                const discoveredAt = source.discovered_at
                  ? Date.parse(source.discovered_at)
                  : 0;
                const isNew =
                  iterationMode !== "initial" && discoveredAt > pipelineStart;
                return (
                  <SourceRow key={source.id} source={source} isNew={isNew} />
                );
              })}
            </div>
          </FoldableSection>
        </div>
      )}
    </SectionCard>
  );
}
