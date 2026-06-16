"use client";

import { useState, useMemo } from "react";
import {
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTopicContext, useStreamDebug } from "../../context/ResearchContext";
import {
  useResearchSynthesis,
  useResearchKeywords,
} from "../../hooks/useResearchState";
import { useResearchApi } from "../../hooks/useResearchApi";
import { useResearchStream } from "../../hooks/useResearchStream";
import { ResearchFilterBar, type FilterDef } from "../shared/ResearchFilterBar";
import { StoppedEarlyNote } from "../shared/StoppedEarlyNote";
import type { FilterOption } from "@/components/hierarchy-filter/HierarchyFilterPill";
import type { ResearchSynthesis, ResearchDataEvent } from "../../types";
import { idMatchesQuery } from "@/utils/search-scoring";
import MarkdownStream from "@/components/markdown";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";

/** A string with real (non-whitespace) content. */
const hasText = (s: string | null | undefined): boolean =>
  !!s && s.trim().length > 0;

/** A status that means the work is done (so an empty body is final, not pending). */
const isTerminalStatus = (status: string): boolean =>
  status === "success" || status === "complete" || status === "failed";

/** Render structured JSON output as a fenced code block — bounded + crash-safe. */
const structuredToMarkdown = (data: unknown): string => {
  try {
    const s = JSON.stringify(data, null, 2);
    const clipped =
      s.length > 20000 ? `${s.slice(0, 20000)}\n… (truncated)` : s;
    return `\`\`\`json\n${clipped}\n\`\`\``;
  } catch {
    return "_Structured output could not be displayed._";
  }
};

function SynthesisCard({
  synthesis,
  label,
}: {
  synthesis: ResearchSynthesis;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColors: Record<string, string> = {
    complete:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    success:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    pending:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-accent/30 transition-colors min-h-[44px]"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold truncate">{label}</span>
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px] font-normal capitalize",
                statusColors[synthesis.status] ?? "",
              )}
            >
              {synthesis.status}
            </Badge>
            <span className="text-[10px] text-muted-foreground capitalize">
              {synthesis.scope}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {new Date(synthesis.created_at).toLocaleDateString()} · v
            {synthesis.version}
            {synthesis.model_id && ` · ${synthesis.model_id}`}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-3 py-3">
          {hasText(synthesis.result) ? (
            <div className="space-y-2">
              {synthesis.status === "failed" && (
                <StoppedEarlyNote
                  reason={synthesis.error || "Synthesis stopped early."}
                />
              )}
              <MarkdownStream content={synthesis.result!} />
              <div className="flex justify-end">
                <ContentActionBar
                  content={synthesis.result!}
                  title={label}
                  instanceKey={`synthesis-${synthesis.id}`}
                  metadata={{
                    synthesisId: synthesis.id,
                    scope: synthesis.scope,
                    version: synthesis.version,
                    model_id: synthesis.model_id ?? undefined,
                    keyword_id: synthesis.keyword_id ?? undefined,
                  }}
                />
              </div>
            </div>
          ) : synthesis.result_structured ? (
            // Completed with structured-only output — surface it honestly
            // rather than showing nothing for a paid-for call.
            <div>
              {synthesis.status === "failed" && (
                <StoppedEarlyNote
                  reason={synthesis.error || "Synthesis stopped early."}
                />
              )}
              <MarkdownStream
                content={structuredToMarkdown(synthesis.result_structured)}
              />
            </div>
          ) : synthesis.error ? (
            // No content at all + an error → a real failure.
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {synthesis.error}
            </div>
          ) : isTerminalStatus(synthesis.status) ? (
            // Terminal but empty — be explicit instead of an endless spinner.
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                This synthesis completed but produced no text output. Re-run the
                synthesis to regenerate it.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SynthesisList() {
  const { topicId } = useTopicContext();
  const api = useResearchApi();
  const debug = useStreamDebug();
  const stream = useResearchStream();

  const {
    data: allSyntheses,
    isLoading: synthLoading,
    refresh: refetchSyntheses,
  } = useResearchSynthesis(topicId);
  const { data: keywords } = useResearchKeywords(topicId);

  const [streamingText, setStreamingText] = useState("");
  const [streamingLabel, setStreamingLabel] = useState("");

  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [keywordFilter, setKeywordFilter] = useState<string | null>(null);

  const synthList = (allSyntheses ?? []) as ResearchSynthesis[];
  const kwList = keywords ?? [];

  const getKeywordLabel = (kwId: string | null) => {
    if (!kwId) return "Unknown Keyword";
    const kw = kwList.find((k) => k.id === kwId);
    return kw ? kw.keyword : "Keyword";
  };

  const filtered = useMemo(() => {
    let items = synthList;
    if (scopeFilter) items = items.filter((s) => s.scope === scopeFilter);
    if (statusFilter) items = items.filter((s) => s.status === statusFilter);
    if (keywordFilter)
      items = items.filter((s) => s.keyword_id === keywordFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (s) =>
          (s.result ?? "").toLowerCase().includes(q) ||
          (s.error ?? "").toLowerCase().includes(q) ||
          getKeywordLabel(s.keyword_id).toLowerCase().includes(q) ||
          (s.model_id ?? "").toLowerCase().includes(q) ||
          s.scope.toLowerCase().includes(q) ||
          idMatchesQuery(s, q),
      );
    }
    return items;
  }, [synthList, scopeFilter, statusFilter, keywordFilter, search, kwList]);

  const projectSyntheses = filtered.filter((s) => s.scope === "project");
  const keywordSyntheses = filtered.filter((s) => s.scope === "keyword");

  const scopeOptions: FilterOption[] = [
    { id: "project", label: "Project" },
    { id: "keyword", label: "Keyword" },
  ];
  const statusOptions: FilterOption[] = [
    { id: "success", label: "Success" },
    { id: "failed", label: "Failed" },
  ];
  const kwOptions: FilterOption[] = useMemo(
    () => kwList.map((kw) => ({ id: kw.id, label: kw.keyword })),
    [kwList],
  );

  const filterDefs: FilterDef[] = useMemo(() => {
    const defs: FilterDef[] = [
      {
        key: "scope",
        label: "Scope",
        allLabel: "All Scopes",
        options: scopeOptions,
        selectedId: scopeFilter,
        onSelect: setScopeFilter,
      },
      {
        key: "status",
        label: "Status",
        allLabel: "All",
        options: statusOptions,
        selectedId: statusFilter,
        onSelect: setStatusFilter,
      },
    ];
    if (kwList.length > 0) {
      defs.push({
        key: "keyword",
        label: "Keyword",
        allLabel: "All Keywords",
        options: kwOptions,
        selectedId: keywordFilter,
        onSelect: setKeywordFilter,
      });
    }
    return defs;
  }, [
    scopeOptions,
    statusOptions,
    kwOptions,
    scopeFilter,
    statusFilter,
    keywordFilter,
    kwList.length,
  ]);

  const handleRunProjectSynthesis = async () => {
    setStreamingText("");
    setStreamingLabel("");
    const res = await api.synthesize(topicId, {
      scope: "project",
      iteration_mode: "initial",
      use_user_agent_overrides: false,
    });
    stream.startStream(res, {
      onData: (payload: ResearchDataEvent) => {
        if (payload.type === "synthesis_start") {
          // New LLM call starting — reset streaming buffer and label
          setStreamingText("");
          setStreamingLabel(
            payload.scope === "keyword" && payload.keyword
              ? `Keyword: ${payload.keyword}`
              : "Project Report",
          );
        }
        if (payload.type === "synthesis_complete") {
          // Synthesis done — clear streaming state, refetch from DB for the full row
          setStreamingText("");
          setStreamingLabel("");
          refetchSyntheses();
        }
        if (payload.type === "synthesis_failed") {
          setStreamingText("");
          setStreamingLabel("");
        }
      },
      onChunk: (text) => setStreamingText((prev) => prev + text),
      onEnd: () => {
        setStreamingText("");
        setStreamingLabel("");
        // Final sync
        refetchSyntheses();
      },
    });
    debug.pushEvents(stream.rawEvents, "synthesize");
  };

  const runButton = (
    <button
      onClick={handleRunProjectSynthesis}
      disabled={stream.isStreaming}
      className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full matrx-glass-card text-[11px] font-medium text-primary disabled:opacity-50 transition-colors shrink-0"
    >
      {stream.isStreaming ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <RefreshCw className="h-3 w-3" />
      )}
      <span className="hidden sm:inline">Run</span>
    </button>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-3 sm:px-4 pt-3 pb-2">
        <ResearchFilterBar
          title="Synthesis"
          count={`${filtered.length}/${synthList.length}`}
          filters={filterDefs}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search content, keywords..."
          trailing={runButton}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        {/* Live streaming synthesis card — shown while LLM is writing */}
        {stream.isStreaming && (streamingText || streamingLabel) && (
          <div className="rounded-xl border border-primary/30 bg-card/60 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
              <span className="text-xs font-medium text-primary">
                {streamingLabel
                  ? `Synthesizing ${streamingLabel}…`
                  : "Synthesizing…"}
              </span>
            </div>
            {streamingText && (
              <div className="px-3 py-3 prose prose-sm dark:prose-invert max-w-none prose-p:text-xs">
                <MarkdownStream content={streamingText} isStreamActive />
                <span className="inline-block w-0.5 h-3.5 bg-primary animate-pulse ml-0.5 align-middle" />
              </div>
            )}
          </div>
        )}
        {synthLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : !synthLoading && filtered.length === 0 && !stream.isStreaming ? (
          <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 text-center px-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center">
              <Layers className="h-6 w-6 text-primary/40" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground/70">
                {synthList.length === 0 ? "No syntheses yet" : "No matches"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 max-w-[240px]">
                {synthList.length === 0
                  ? "Synthesize your scraped content and analyses into cohesive research summaries."
                  : "Try adjusting your search or filters to find what you're looking for."}
              </p>
            </div>
            {synthList.length === 0 && (
              <button
                onClick={handleRunProjectSynthesis}
                disabled={stream.isStreaming}
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all min-h-[44px]"
              >
                {stream.isStreaming ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Layers className="h-3 w-3" />
                )}
                Run Synthesis
              </button>
            )}
          </div>
        ) : (
          <>
            {projectSyntheses.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 px-0.5">
                  <Layers className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Project Report
                  </span>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                    {projectSyntheses.length}
                  </Badge>
                </div>
                {projectSyntheses.map((s) => (
                  <SynthesisCard
                    key={s.id}
                    synthesis={s}
                    label="Project Report"
                  />
                ))}
              </section>
            )}

            {keywordSyntheses.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 px-0.5">
                  <Layers className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Keyword Syntheses
                  </span>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                    {keywordSyntheses.length}
                  </Badge>
                </div>
                {keywordSyntheses.map((s) => (
                  <SynthesisCard
                    key={s.id}
                    synthesis={s}
                    label={getKeywordLabel(s.keyword_id)}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
