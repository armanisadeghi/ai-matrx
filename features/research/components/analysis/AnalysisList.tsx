"use client";

import { useState, useMemo } from "react";
import {
  Brain,
  ExternalLink,
  Globe,
  DollarSign,
  Coins,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Hammer,
  ChevronLeft,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import MarkdownStream from "@/components/markdown";
import { useTopicContext } from "../../context/ResearchContext";
import {
  useAnalysesForTopic,
  useResearchSources,
} from "../../hooks/useResearchState";
import { useResearchApi } from "../../hooks/useResearchApi";
import { useResearchStream } from "../../hooks/useResearchStream";
import { useStreamDebug } from "../../context/ResearchContext";
import { ResearchFilterBar, type FilterDef } from "../shared/ResearchFilterBar";
import type { FilterOption } from "@/components/hierarchy-filter/HierarchyFilterPill";
import {
  type ResearchAnalysis,
  type ResearchDataEvent,
  type ResearchSource,
  tokenUsageFromJson,
} from "../../types";
import { filterAndSortBySearch } from "@/utils/search-scoring";

/** A string with real (non-whitespace) content. */
const hasText = (s: string | null | undefined): boolean =>
  !!s && s.trim().length > 0;

function StatsBar({
  total,
  successful,
  failed,
  totalCost,
  totalTokens,
}: {
  total: number;
  successful: number;
  failed: number;
  totalCost: number;
  totalTokens: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
      <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-2.5 py-2">
        <div className="h-7 w-7 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
          <Hammer className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground leading-none">
            Analyses
          </p>
          <p className="text-sm font-bold tabular-nums mt-0.5 leading-none">
            {total}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-2.5 py-2">
        <div className="h-7 w-7 rounded-lg bg-green-500/8 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground leading-none">
            Passed
          </p>
          <p className="text-sm font-bold tabular-nums text-green-600 dark:text-green-400 mt-0.5 leading-none">
            {successful}
            {failed > 0 && (
              <span className="text-destructive/60 text-[10px] font-medium ml-1">
                ({failed} failed)
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-2.5 py-2">
        <div className="h-7 w-7 rounded-lg bg-amber-500/8 flex items-center justify-center shrink-0">
          <DollarSign className="h-3.5 w-3.5 text-amber-500" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground leading-none">Cost</p>
          <p className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-0.5 leading-none">
            ${totalCost.toFixed(2)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-2.5 py-2">
        <div className="h-7 w-7 rounded-lg bg-blue-500/8 flex items-center justify-center shrink-0">
          <Coins className="h-3.5 w-3.5 text-blue-500" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground leading-none">
            Tokens
          </p>
          <p className="text-sm font-bold tabular-nums mt-0.5 leading-none">
            {totalTokens > 1_000_000
              ? `${(totalTokens / 1_000_000).toFixed(1)}M`
              : totalTokens > 1000
                ? `${(totalTokens / 1000).toFixed(1)}k`
                : totalTokens}
          </p>
        </div>
      </div>
    </div>
  );
}

interface ListItemProps {
  analysis: ResearchAnalysis;
  source: ResearchSource | undefined;
  isSelected: boolean;
  onSelect: () => void;
}

function ListItem({ analysis, source, isSelected, onSelect }: ListItemProps) {
  const isFailed = analysis.status === "failed";
  const usage = tokenUsageFromJson(analysis.token_usage);
  const tokenCost = usage?.estimated_cost;
  const createdAt = new Date(analysis.created_at);
  const formattedDate = createdAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "rounded-lg px-2.5 py-2 cursor-pointer transition-all border",
        isSelected
          ? "bg-primary/8 border-primary/20 shadow-sm"
          : isFailed
            ? "bg-destructive/[0.03] border-destructive/20 hover:bg-destructive/[0.06]"
            : "bg-transparent border-transparent hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-1.5">
        {isFailed ? (
          <XCircle className="h-3 w-3 text-destructive shrink-0" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
        )}
        <span
          className={cn(
            "text-[11px] font-medium truncate flex-1",
            isFailed
              ? "text-destructive/80"
              : isSelected
                ? "text-foreground"
                : "text-foreground/80",
          )}
        >
          {source?.title ?? source?.hostname ?? "Unknown Source"}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 pl-[18px]">
        {source?.hostname && (
          <span className="text-[9px] text-muted-foreground truncate">
            {source.hostname}
          </span>
        )}
        <span className="text-[9px] text-muted-foreground/30 tabular-nums">
          {formattedDate}
        </span>
        {tokenCost != null && tokenCost > 0 && (
          <span className="text-[9px] text-amber-500/50 tabular-nums ml-auto shrink-0">
            ${tokenCost.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
}

interface DetailPanelProps {
  analysis: ResearchAnalysis;
  source: ResearchSource | undefined;
  topicId: string;
  onRetried: () => void;
  onBack: () => void;
  isMobile: boolean;
}

function DetailPanel({
  analysis,
  source,
  topicId,
  onRetried,
  onBack,
  isMobile,
}: DetailPanelProps) {
  const api = useResearchApi();
  const [retrying, setRetrying] = useState(false);

  const isFailed = analysis.status === "failed";
  const createdAt = new Date(analysis.created_at);
  const usage = tokenUsageFromJson(analysis.token_usage);
  const tokenCost = usage?.estimated_cost;
  const totalTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await api.retryAnalysis(topicId, analysis.id);
      onRetried();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Source context bar */}
      <div className="flex-shrink-0 border-b border-border/40 bg-card/30">
        <div className="flex items-center gap-2 px-4 py-2">
          {isMobile && (
            <button
              onClick={onBack}
              className="inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors shrink-0 -ml-1"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div
            className={cn(
              "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
              isFailed ? "bg-destructive/10" : "bg-primary/8",
            )}
          >
            {isFailed ? (
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <Brain className="h-3.5 w-3.5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">
              {source?.title ?? source?.hostname ?? "Unknown Source"}
            </p>
            <div className="flex items-center gap-2 mt-px">
              {source?.hostname && (
                <span className="text-[10px] text-muted-foreground">
                  {source.hostname}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {createdAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {analysis.model_id && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                  {analysis.model_id}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isFailed && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
              >
                {retrying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Retry
              </button>
            )}
            {source && (
              <Link
                href={`/research/topics/${topicId}/sources/${source.id}`}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium matrx-glass-card text-muted-foreground hover:text-foreground transition-colors"
              >
                Source
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
        {source?.url && (
          <div className="flex items-center gap-1.5 px-4 pb-2">
            <Globe className="h-3 w-3 text-muted-foreground/30 shrink-0" />
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-primary truncate transition-colors"
            >
              {source.url}
            </a>
            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />
          </div>
        )}
      </div>

      {/* Main content — the analysis result */}
      <div className="flex-1 overflow-y-auto">
        {isFailed ? (
          <div className="p-6 flex flex-col items-center justify-center min-h-[300px] gap-4 text-center">
            <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-7 w-7 text-destructive/60" />
            </div>
            <div className="space-y-1 max-w-md">
              <p className="text-sm font-medium text-destructive">
                Analysis Failed
              </p>
              {analysis.error && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {analysis.error}
                </p>
              )}
            </div>
          </div>
        ) : hasText(analysis.result) ? (
          <article className="px-5 py-5 sm:px-8 sm:py-6 max-w-3xl">
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-[13.5px] prose-p:leading-[1.75] prose-headings:text-sm prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-base prose-h2:mt-6 prose-h2:mb-2 prose-h3:mt-4 prose-h3:mb-1.5 prose-ul:text-[13.5px] prose-ol:text-[13.5px] prose-li:text-[13.5px] prose-li:leading-[1.75] prose-blockquote:text-[13px] prose-blockquote:border-primary/30 prose-strong:font-semibold prose-code:text-[12px] prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
              <MarkdownStream content={analysis.result!} />
            </div>
          </article>
        ) : (
          // Terminal success but no text — be honest rather than blank.
          <div className="px-6 py-10 flex flex-col items-center justify-center gap-2 text-center">
            <AlertCircle className="h-6 w-6 text-amber-500/60" />
            <p className="text-sm font-medium text-foreground/70">
              No analysis content
            </p>
            <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
              This source was processed but produced no summary — usually the
              page had too little usable text. Re-scrape it or retry the
              analysis.
            </p>
          </div>
        )}
      </div>

      {/* Token usage footer */}
      {usage && (
        <div className="flex-shrink-0 flex items-center gap-4 px-4 py-2 border-t border-border/30 bg-muted/5">
          {usage.input_tokens != null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              Input: {usage.input_tokens.toLocaleString()}
            </span>
          )}
          {usage.output_tokens != null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              Output: {usage.output_tokens.toLocaleString()}
            </span>
          )}
          {totalTokens > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              Total: {totalTokens.toLocaleString()}
            </span>
          )}
          {usage.model && (
            <span className="text-[10px] text-muted-foreground/30">
              {usage.model}
            </span>
          )}
          {tokenCost != null && tokenCost > 0 && (
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 tabular-nums ml-auto">
              ${tokenCost.toFixed(4)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnalysisList() {
  const { topicId } = useTopicContext();
  const api = useResearchApi();
  const isMobile = useIsMobile();
  const debug = useStreamDebug();
  const stream = useResearchStream();

  const {
    data: analyses,
    isLoading,
    refresh: refetchAnalyses,
  } = useAnalysesForTopic(topicId);
  const { data: sources } = useResearchSources(topicId, { limit: 500 });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [streamingText, setStreamingText] = useState("");
  const [streamingLabel, setStreamingLabel] = useState("");

  const analysisList = (analyses ?? []) as ResearchAnalysis[];
  const sourceMap = useMemo(() => {
    const map = new Map<string, ResearchSource>();
    for (const s of (sources ?? []) as ResearchSource[]) {
      map.set(s.id, s);
    }
    return map;
  }, [sources]);

  const models = useMemo(
    () =>
      [
        ...new Set(
          analysisList.map((a) => a.model_id).filter(Boolean) as string[],
        ),
      ].sort(),
    [analysisList],
  );

  const filtered = useMemo(() => {
    let items = analysisList;
    if (statusFilter) items = items.filter((a) => a.status === statusFilter);
    if (modelFilter) items = items.filter((a) => a.model_id === modelFilter);
    if (search) {
      items = filterAndSortBySearch(items, search, [
        { get: (a) => sourceMap.get(a.source_id)?.title, weight: "title" },
        {
          get: (a) => sourceMap.get(a.source_id)?.hostname,
          weight: "subtitle",
        },
        { get: (a) => sourceMap.get(a.source_id)?.url, weight: "subtitle" },
        { get: (a) => sourceMap.get(a.source_id)?.description, weight: "body" },
        { get: (a) => a.result, weight: "body" },
        { get: (a) => a.error, weight: "body" },
        { get: (a) => a.model_id, weight: "meta" },
      ]);
    }
    return items;
  }, [analysisList, statusFilter, modelFilter, search, sourceMap]);

  const selectedAnalysis = filtered.find((a) => a.id === selectedId) ?? null;

  const stats = useMemo(() => {
    const successful = analysisList.filter(
      (a) => a.status === "success",
    ).length;
    const failed = analysisList.filter((a) => a.status === "failed").length;
    let totalCost = 0;
    let totalTokens = 0;
    for (const a of analysisList) {
      const u = tokenUsageFromJson(a.token_usage);
      if (u) {
        totalCost += u.estimated_cost ?? 0;
        totalTokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
      }
    }
    return {
      total: analysisList.length,
      successful,
      failed,
      totalCost,
      totalTokens,
    };
  }, [analysisList]);

  const statusOptions: FilterOption[] = [
    { id: "success", label: "Success" },
    { id: "failed", label: "Failed" },
  ];
  const modelOptions: FilterOption[] = useMemo(
    () => models.map((m) => ({ id: m, label: m })),
    [models],
  );

  const filterDefs: FilterDef[] = useMemo(() => {
    const defs: FilterDef[] = [
      {
        key: "status",
        label: "Status",
        allLabel: "All",
        options: statusOptions,
        selectedId: statusFilter,
        onSelect: setStatusFilter,
      },
    ];
    if (models.length > 0) {
      defs.push({
        key: "model",
        label: "Model",
        allLabel: "All Models",
        options: modelOptions,
        selectedId: modelFilter,
        onSelect: setModelFilter,
      });
    }
    return defs;
  }, [statusOptions, modelOptions, statusFilter, modelFilter, models.length]);

  const handleAnalyzeAll = async () => {
    setStreamingText("");
    setStreamingLabel("Analyzing all sources...");
    const res = await api.analyzeAll(topicId);
    stream.startStream(res, {
      onData: (payload: ResearchDataEvent) => {
        if (payload.type === "analysis_start") {
          setStreamingLabel(
            `Analyzing source ${payload.total > 0 ? `(${payload.total} remaining)` : ""}...`,
          );
        }
        if (
          payload.type === "analysis_complete" ||
          payload.type === "analysis_failed"
        ) {
          refetchAnalyses();
        }
        if (payload.type === "analyze_all_complete") {
          setStreamingText("");
          setStreamingLabel("");
          refetchAnalyses();
        }
      },
      onChunk: (text) => setStreamingText((prev) => prev + text),
      onEnd: () => {
        setStreamingText("");
        setStreamingLabel("");
        refetchAnalyses();
      },
    });
    debug.pushEvents(stream.rawEvents, "analyze-all");
  };

  const handleRetryAll = async () => {
    await api.retryFailedAnalyses(topicId);
    refetchAnalyses();
  };

  const actionButtons = (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={handleAnalyzeAll}
        disabled={stream.isStreaming}
        className="inline-flex items-center gap-1 h-6 px-2 rounded-full matrx-glass-card text-[10px] font-medium text-primary disabled:opacity-50 transition-colors"
      >
        {stream.isStreaming ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
        ) : (
          <Brain className="h-2.5 w-2.5" />
        )}
        <span className="hidden sm:inline">Analyze</span>
      </button>
      {stats.failed > 0 && (
        <button
          onClick={handleRetryAll}
          disabled={stream.isStreaming}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-full matrx-glass-card text-[10px] font-medium text-destructive disabled:opacity-50 transition-colors"
        >
          <RefreshCw className="h-2.5 w-2.5" />
          <span>{stats.failed}</span>
        </button>
      )}
    </div>
  );

  if (isMobile && selectedAnalysis) {
    return (
      <DetailPanel
        analysis={selectedAnalysis}
        source={sourceMap.get(selectedAnalysis.source_id)}
        topicId={topicId}
        onRetried={refetchAnalyses}
        onBack={() => setSelectedId(null)}
        isMobile
      />
    );
  }

  const listPanel = (
    <div
      className={cn(
        "flex flex-col overflow-hidden",
        !isMobile && "w-72 xl:w-80 shrink-0 border-r border-border/40",
        isMobile && "flex-1",
      )}
    >
      <div className="flex-shrink-0 px-2 pt-2 pb-1.5">
        <ResearchFilterBar
          title="Analyses"
          count={`${filtered.length}`}
          filters={filterDefs}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search analyses..."
          trailing={actionButtons}
        />
      </div>

      {/* Live streaming indicator */}
      {stream.isStreaming && (streamingText || streamingLabel) && (
        <div className="mx-2.5 mb-1.5 rounded-lg border border-primary/20 bg-primary/[0.03] px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
            <span className="text-[10px] font-medium text-primary truncate">
              {streamingLabel || "Analyzing…"}
            </span>
          </div>
          {streamingText && (
            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1 pl-[18px]">
              {streamingText.slice(0, 200)}
            </p>
          )}
        </div>
      )}

      {/* Analysis list */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-20 md:pb-2">
        {isLoading ? (
          <div className="space-y-1.5 px-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[240px] gap-3 text-center px-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center">
              <Brain className="h-6 w-6 text-primary/40" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground/70">
                {analysisList.length === 0 ? "No analyses yet" : "No matches"}
              </p>
              <p className="text-[10px] text-muted-foreground max-w-[240px]">
                {analysisList.length === 0
                  ? "Run AI analysis to extract insights and structured summaries from your sources."
                  : "Try adjusting your search or filters."}
              </p>
            </div>
            {analysisList.length === 0 && (
              <button
                onClick={handleAnalyzeAll}
                disabled={stream.isStreaming}
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all min-h-[44px]"
              >
                {stream.isStreaming ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Brain className="h-3 w-3" />
                )}
                Analyze All Sources
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-px">
            {filtered.map((analysis) => (
              <ListItem
                key={analysis.id}
                analysis={analysis}
                source={sourceMap.get(analysis.source_id)}
                isSelected={selectedId === analysis.id}
                onSelect={() => setSelectedId(analysis.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-3 pt-2.5 pb-1.5">
          <StatsBar {...stats} />
        </div>
        {listPanel}
      </div>
    );
  }

  // Desktop: master-detail split
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-3 sm:px-4 pt-3 pb-2">
        <StatsBar {...stats} />
      </div>
      <div className="flex-1 flex min-h-0">
        {listPanel}

        {/* Detail panel — desktop only */}
        <div className="flex-1 min-w-0">
          {selectedAnalysis ? (
            <DetailPanel
              analysis={selectedAnalysis}
              source={sourceMap.get(selectedAnalysis.source_id)}
              topicId={topicId}
              onRetried={refetchAnalyses}
              onBack={() => setSelectedId(null)}
              isMobile={false}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
              <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center">
                <Brain className="h-8 w-8 text-primary/20" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground/50">
                  Select an analysis
                </p>
                <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed">
                  Choose an analysis from the list to read the full AI-generated
                  insights for that source.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
