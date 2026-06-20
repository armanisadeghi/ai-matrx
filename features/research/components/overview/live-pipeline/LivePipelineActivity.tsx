"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  AlertCircle,
  X,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ResearchTopic } from "../../../types";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import type {
  UsePipelineProgressResult,
  StageKind,
} from "../../../hooks/usePipelineProgress";
import { useCostSummary } from "../../../hooks/useCostSummary";
import { MetricsStrip } from "./MetricsStrip";
import { QuotaStrip } from "./QuotaStrip";
import { StageStatSquare } from "./StageStatSquare";
import { ActivityFeed } from "./ActivityFeed";
import { SearchStageView } from "./stages/SearchStageView";
import { ScrapeStageView } from "./stages/ScrapeStageView";
import { AnalyzeStageView } from "./stages/AnalyzeStageView";
import { SynthesizeStageView } from "./stages/SynthesizeStageView";
import { ReportStageView } from "./stages/ReportStageView";

interface Props {
  pipeline: UsePipelineProgressResult;
  topic: ResearchTopic | null | undefined;
  topicId: string;
  /** Whether the underlying stream is currently open. */
  isStreaming: boolean;
  /** Live LLM chunk text (for synthesis preview). */
  streamingText: string;
  /** Stream-level error string. */
  error: string | null;
  /** Raw events for the activity feed. */
  rawEvents: TypedStreamEvent[];
  onCancel: () => void;
  onClose: () => void;
  /** Optional callback when a verdict is applied (for refreshing topic state). */
  onSourceUpdated?: () => void;
}

const STAGE_ORDER: StageKind[] = [
  "search",
  "scrape",
  "analyze",
  "synthesize",
  "report",
];

/**
 * Live activity dashboard. Rendered BELOW the PipelineOrchestra (which owns
 * the header + per-stage rail above). This component focuses on the
 * "what's happening right now" detail: metric strips, the active stage card,
 * collapsed pills for completed stages, warnings, and the raw activity feed.
 *
 * Auto-collapse: completed stages fold into stat squares; click to expand
 * inline detail again. When the run finishes, the whole panel (including
 * logs) folds into a compact summary bar.
 */
export function LivePipelineActivity({
  pipeline,
  topic,
  topicId,
  isStreaming,
  streamingText,
  error,
  rawEvents,
  onCancel,
  onClose,
  onSourceUpdated,
}: Props) {
  const { state, derived } = pipeline;

  const visibleStages = useMemo(
    () =>
      STAGE_ORDER.filter((kind) => {
        const s = state.stages[kind];
        return (
          s.status !== "pending" ||
          s.itemOrder.length > 0 ||
          s.infoMessage != null ||
          s.totals.started > 0 ||
          s.totals.succeeded > 0
        );
      }),
    [state],
  );

  // MUST be memoized: these feed the auto-fold useEffect's dep array (below).
  // Computing them fresh every render produces new array refs each pass →
  // the effect re-runs → setExpandedStages → re-render → infinite loop
  // (React #185, "Maximum update depth exceeded").
  const completedStages = useMemo(
    () =>
      visibleStages.filter((k) =>
        ["complete", "partial", "failed"].includes(state.stages[k].status),
      ),
    [visibleStages, state],
  );
  const activeStages = useMemo(
    () => visibleStages.filter((k) => state.stages[k].status === "active"),
    [visibleStages, state],
  );
  const base = `/research/topics/${topicId}`;

  const { data: costSummary, refetch: refetchCosts } = useCostSummary(topicId);

  useEffect(() => {
    if (state.completedAt != null) {
      void refetchCosts();
    }
  }, [state.completedAt, refetchCosts]);

  const authoritativeCost =
    state.completedAt != null && costSummary
      ? costSummary.total_estimated_cost_usd
      : null;

  const isPipelineDone = state.completedAt != null && !isStreaming;

  const [expandedStages, setExpandedStages] = useState<Set<StageKind>>(
    () => new Set(),
  );
  const [panelExpanded, setPanelExpanded] = useState(true);
  const prevCompletedRef = useRef<Set<StageKind>>(new Set());

  // Auto-fold stages as they finish; keep active stages expanded.
  useEffect(() => {
    const currentCompleted = new Set(completedStages);
    setExpandedStages((prev) => {
      const next = new Set(prev);
      for (const kind of activeStages) {
        next.add(kind);
      }
      for (const kind of currentCompleted) {
        if (!prevCompletedRef.current.has(kind)) {
          next.delete(kind);
        }
      }
      return next;
    });
    prevCompletedRef.current = currentCompleted;
  }, [completedStages, activeStages]);

  // Fold the whole panel (main + logs) when the run finishes.
  useEffect(() => {
    if (isPipelineDone) {
      setPanelExpanded(false);
    } else if (isStreaming) {
      setPanelExpanded(true);
    }
  }, [isPipelineDone, isStreaming]);

  const toggleStage = (kind: StageKind) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  const renderStageView = (kind: StageKind) => {
    if (kind === "search") {
      return (
        <SearchStageView
          key="search"
          state={state}
          topicId={topicId}
          ratePerSec={derived.rate}
          etaSeconds={derived.etaSeconds}
          iterationMode={state.iterationMode}
        />
      );
    }
    if (kind === "scrape") {
      return (
        <ScrapeStageView
          key="scrape"
          state={state}
          topicId={topicId}
          ratePerSec={derived.rate}
          etaSeconds={derived.etaSeconds}
          onSourceUpdated={onSourceUpdated}
        />
      );
    }
    if (kind === "analyze") {
      return (
        <AnalyzeStageView
          key="analyze"
          state={state}
          derived={derived}
          ratePerSec={derived.rate}
          etaSeconds={derived.etaSeconds}
        />
      );
    }
    if (kind === "synthesize") {
      return (
        <SynthesizeStageView
          key="synthesize"
          state={state}
          ratePerSec={derived.rate}
          etaSeconds={derived.etaSeconds}
          streamingText={streamingText}
          isStreaming={isStreaming}
        />
      );
    }
    if (kind === "report") {
      return (
        <ReportStageView
          key="report"
          state={state}
          topicId={topicId}
          ratePerSec={derived.rate}
          etaSeconds={derived.etaSeconds}
        />
      );
    }
    return null;
  };

  const expandedCompletedStages = completedStages.filter((kind) =>
    expandedStages.has(kind),
  );

  const statusBar = (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/20">
      {isStreaming ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="text-[11px] font-medium text-foreground">
            {state.activeStage
              ? `${state.activeStage[0].toUpperCase()}${state.activeStage.slice(1)}…`
              : "Working…"}
          </span>
          {derived.etaSeconds != null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              ~{derived.etaSeconds}s remaining
            </span>
          )}
          <button
            onClick={onCancel}
            className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-[11px] font-medium text-foreground">
            Last run
          </span>
          {state.startedAt && state.completedAt && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {Math.max(
                1,
                Math.round((state.completedAt - state.startedAt) / 1000),
              )}
              s total
            </span>
          )}
          {isPipelineDone && !panelExpanded && completedStages.length > 0 && (
            <div className="hidden sm:flex flex-wrap gap-1.5 ml-1">
              {completedStages.map((kind) => (
                <StageStatSquare
                  key={kind}
                  stage={state.stages[kind]}
                  base={base}
                  expanded={expandedStages.has(kind)}
                  onToggle={() => toggleStage(kind)}
                />
              ))}
            </div>
          )}
          {isPipelineDone && (
            <CollapsibleTrigger
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
                panelExpanded ? "ml-auto" : "ml-1",
              )}
            >
              {panelExpanded ? "Collapse" : "Show details"}
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  panelExpanded && "rotate-180",
                )}
              />
            </CollapsibleTrigger>
          )}
          <button
            onClick={onClose}
            className={cn(
              "inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
              !isPipelineDone && "ml-auto",
              isPipelineDone && panelExpanded && "ml-0",
              isPipelineDone && !panelExpanded && "ml-auto",
            )}
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );

  const body = (
    <>
      <MetricsStrip
        state={state}
        derived={derived}
        authoritativeCostUsd={authoritativeCost}
      />
      <QuotaStrip topic={topic} state={state} derived={derived} />

      <div className="p-3 space-y-3">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <span className="text-xs text-destructive">{error}</span>
          </div>
        )}

        {state.infos.some((i) => i.level === "warning") && (
          <div className="space-y-1">
            {state.infos
              .filter((i) => i.level === "warning")
              .slice(-3)
              .map((info) => (
                <div
                  key={info.id}
                  className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-700 dark:text-amber-400 min-w-0">
                    <span className="font-semibold">{info.code}:</span>{" "}
                    {info.message}
                  </div>
                </div>
              ))}
          </div>
        )}

        {completedStages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {completedStages.map((kind) => (
              <StageStatSquare
                key={kind}
                stage={state.stages[kind]}
                base={base}
                expanded={expandedStages.has(kind)}
                onToggle={() => toggleStage(kind)}
              />
            ))}
          </div>
        )}

        <div className={cn("grid gap-3", "lg:grid-cols-[minmax(0,1fr)_320px]")}>
          <div className="space-y-2 min-w-0">
            {activeStages.length === 0 &&
              completedStages.length === 0 &&
              isStreaming && (
                <div className="rounded-lg border border-dashed border-border/60 bg-card/30 px-4 py-6 text-center text-xs text-muted-foreground">
                  Connecting to backend… first events arriving shortly.
                </div>
              )}

            {/* Issue #2 — staged focus: render the ACTIVE stage(s) FIRST so the
                newest live work is always at the top in focus. Finished stages
                have already collapsed to the compact pill row above; any the
                user manually re-expands drop BELOW the live work rather than
                pushing it out of view. */}
            {activeStages.map((kind) => renderStageView(kind))}

            {expandedCompletedStages.map((kind) => renderStageView(kind))}

            {isPipelineDone && activeStages.length === 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/[0.06] p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Run complete</div>
                  <div className="text-[11px] text-muted-foreground">
                    Tap a stage square above to revisit any step, or open the
                    document.
                  </div>
                </div>
                <Link
                  href={`${base}/document`}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Document
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>

          <ActivityFeed
            rawEvents={rawEvents}
            state={state}
            className="lg:sticky lg:top-2"
          />
        </div>
      </div>
    </>
  );

  return (
    <Collapsible
      open={panelExpanded}
      onOpenChange={(open) => {
        if (!isPipelineDone && !open) return;
        setPanelExpanded(open);
      }}
      className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden"
    >
      {statusBar}
      <CollapsibleContent>{body}</CollapsibleContent>
    </Collapsible>
  );
}
