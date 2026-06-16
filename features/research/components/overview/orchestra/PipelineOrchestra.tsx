"use client";

import { useCallback, useState } from "react";
import {
  Search,
  Globe,
  FileText,
  Brain,
  Layers,
  FileSpreadsheet,
  ScrollText,
  Tags,
  Settings,
  Play,
  Square,
  Loader2,
  Plus,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";

import {
  useTopicContext,
  useStreamDebug,
} from "../../../context/ResearchContext";
import { useResearchApi } from "../../../hooks/useResearchApi";
import { useResearchStream } from "../../../hooks/useResearchStream";
import { useCostSummary } from "../../../hooks/useCostSummary";
import {
  usePipelineProgress,
  type StageKind,
  type PipelineState,
} from "../../../hooks/usePipelineProgress";
import { LivePipelineActivity } from "../live-pipeline/LivePipelineActivity";
import { TopicSettingsPanel } from "../TopicSettingsPanel";

import { OrchestraNode, type OrchestraStatus } from "./OrchestraNode";
import {
  OrchestraEdge,
  OrchestraCurvedEdge,
  type EdgeState,
} from "./OrchestraEdge";
import { AutonomyControl } from "./AutonomyControl";
import { ProviderControl } from "./ProviderControl";
import { LastRunSummary } from "./LastRunSummary";

import "./orchestra.css";
import type { ResearchProgress, ResearchTopic } from "../../../types";

// ─── Status derivation ────────────────────────────────────────────────────────

/**
 * Map `(persistent topic.progress, live pipeline state, autonomy)` → a single
 * orchestra status per node. The live state takes precedence; persistent
 * data fills in the "what's already true" picture for cold loads.
 */
function statusFor(args: {
  /** Persistent count for this node's primary metric. */
  have: number;
  /** Persistent target/quota for this node, if any. */
  target?: number;
  /** True if this node has hard failures recorded. */
  hasFailures?: boolean;
  /** Live stage tied to this node, if any. */
  liveStage?: PipelineState["stages"][StageKind];
  /** True if this node depends on prior nodes that have not produced data. */
  upstreamReady: boolean;
  /** Topic autonomy — gates "queued" vs "gated" semantics. */
  autonomy: ResearchTopic["autonomy_level"];
  /**
   * True ONLY while a run is genuinely live (stream open or a stage active).
   * Gates the animated "queued"/waiting state so nothing pulses at rest.
   */
  isLive: boolean;
}): OrchestraStatus {
  const {
    have,
    target,
    hasFailures,
    liveStage,
    upstreamReady,
    autonomy,
    isLive,
  } = args;

  // Live state wins — but only when a run is actually live. A stale stage left
  // in "active" must never animate at rest (that's the never-ending-spinner bug).
  if (liveStage && isLive) {
    if (liveStage.status === "active") return "active";
    if (liveStage.status === "failed") return "failed";
    if (liveStage.status === "partial") return "partial";
    if (liveStage.status === "complete") {
      // Just completed, surface as complete; persistent layer will catch up.
      return "complete";
    }
  }

  if (have > 0) {
    if (hasFailures) return "partial";
    if (target != null && have >= target) return "complete";
    return "complete";
  }

  if (!upstreamReady) return "empty";

  // Upstream is ready, this node has nothing yet.
  // Animate "queued" ONLY during a live run; at rest the node stays static
  // ("gated" for manual autonomy, otherwise plain "empty") so it never pulses
  // forever after a finished run.
  if (isLive) return "queued";
  if (autonomy === "manual") return "gated";
  return "empty";
}

function edgeStateFor(
  fromStatus: OrchestraStatus,
  toStatus: OrchestraStatus,
): EdgeState {
  if (fromStatus === "active" || toStatus === "active") return "active";
  if (fromStatus === "complete" && toStatus !== "empty") return "complete";
  return "idle";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PipelineOrchestra() {
  const { topicId, topic, progress, refresh, isLoading } = useTopicContext();
  const api = useResearchApi();
  const isMobile = useIsMobile();
  const debug = useStreamDebug();

  const stream = useResearchStream();
  const pipeline = usePipelineProgress({ topic });
  const { data: costSummary } = useCostSummary(topicId);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keywordModalOpen, setKeywordModalOpen] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [addingKeyword, setAddingKeyword] = useState(false);

  // ── Stream wiring (mirrors prior ResearchOverview behavior) ──────────────

  const handleStreamData = useCallback(
    (payload: import("../../../types").ResearchDataEvent) => {
      pipeline.dispatch(payload);
      if (
        payload.type === "search_sources_stored" ||
        payload.type === "search_complete" ||
        payload.type === "pipeline_complete"
      ) {
        refresh();
      }
    },
    [pipeline, refresh],
  );

  const handleStreamInfo = useCallback(
    (info: import("../../../types").ResearchInfoEvent) => {
      pipeline.dispatchInfo(info);
      if (info.code === "quota_exceeded") {
        toast.warning(info.message);
      }
    },
    [pipeline],
  );

  const handleStreamPhase = useCallback(
    (step: import("../../../types").ResearchStreamStep) => {
      pipeline.dispatchPhase(step);
    },
    [pipeline],
  );

  type StartOpts = { iterationMode: "initial" | "rebuild" | "update" };
  const startStream = useCallback(
    async (
      response: Response,
      label: string,
      opts: StartOpts = { iterationMode: "initial" },
    ) => {
      pipeline.reset({ iterationMode: opts.iterationMode });
      await stream.startStream(response, {
        onData: handleStreamData,
        onInfo: handleStreamInfo,
        onStatusUpdate: handleStreamPhase,
        onEnd: () => {
          // Safety net: if the stream ended without `pipeline_complete`
          // (single-stage ops, or a dropped terminal event), force every
          // still-active stage/item terminal so no spinner is left running.
          pipeline.finalize();
          refresh();
        },
      });
      debug.pushEvents(stream.rawEvents, label);
    },
    [
      pipeline,
      stream,
      handleStreamData,
      handleStreamInfo,
      handleStreamPhase,
      refresh,
      debug,
    ],
  );

  const handleRunAll = useCallback(async () => {
    const response = await api.runPipeline(topicId);
    await startStream(response, "pipeline");
  }, [api, topicId, startStream]);

  const handleSearch = useCallback(async () => {
    const response = await api.triggerSearch(topicId);
    await startStream(response, "search");
  }, [api, topicId, startStream]);

  const handleScrape = useCallback(async () => {
    const response = await api.triggerScrape(topicId);
    await startStream(response, "scrape");
  }, [api, topicId, startStream]);

  const handleAnalyze = useCallback(async () => {
    const response = await api.analyzeAll(topicId);
    await startStream(response, "analyze-all");
  }, [api, topicId, startStream]);

  const handleSynthesize = useCallback(async () => {
    const response = await api.synthesize(topicId, {
      scope: "project",
      iteration_mode: "initial",
      use_user_agent_overrides: false,
    });
    await startStream(response, "synthesize", { iterationMode: "initial" });
  }, [api, topicId, startStream]);

  const handleRebuildReport = useCallback(async () => {
    const response = await api.synthesize(topicId, {
      scope: "project",
      iteration_mode: "rebuild",
      use_user_agent_overrides: false,
    });
    await startStream(response, "synthesize-rebuild", {
      iterationMode: "rebuild",
    });
  }, [api, topicId, startStream]);

  const handleUpdateReport = useCallback(async () => {
    const response = await api.synthesize(topicId, {
      scope: "project",
      iteration_mode: "update",
      use_user_agent_overrides: false,
    });
    await startStream(response, "synthesize-update", {
      iterationMode: "update",
    });
  }, [api, topicId, startStream]);

  const handleAddKeyword = useCallback(async () => {
    if (!newKeyword.trim()) return;
    setAddingKeyword(true);
    try {
      await api.addKeywords(topicId, { keywords: [newKeyword.trim()] });
      setNewKeyword("");
      setKeywordModalOpen(false);
      refresh();
      toast.success("Keyword added");
    } catch (err) {
      toast.error((err as Error).message ?? "Could not add keyword");
    } finally {
      setAddingKeyword(false);
    }
  }, [api, topicId, newKeyword, refresh]);

  // ── Loading + empty topic ───────────────────────────────────────────────

  if (!topic) {
    if (isLoading) {
      return (
        <div className="p-3">
          <div className="rounded-2xl border border-border/40 bg-card/40 p-6 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        </div>
      );
    }
    return null;
  }

  // ── Derive node statuses ────────────────────────────────────────────────

  const p: ResearchProgress = progress ?? {
    total_keywords: 0,
    stale_keywords: 0,
    total_sources: 0,
    included_sources: 0,
    sources_by_status: {} as ResearchProgress["sources_by_status"],
    total_content: 0,
    total_analyses: 0,
    total_eligible_for_analysis: 0,
    failed_analyses: 0,
    keyword_syntheses: 0,
    failed_keyword_syntheses: 0,
    project_syntheses: 0,
    failed_project_syntheses: 0,
    total_tags: 0,
    total_documents: 0,
  };

  const anyStageActive = pipeline.state.activeStage != null;
  // "Live" = a run is genuinely in flight. Gates every animated node/edge state
  // so the graph is completely static once a run is over (no perpetual pulsing
  // or false "flow" between nodes on a finished/reloaded topic).
  const isLive = stream.isStreaming || anyStageActive;
  const autonomy = topic.autonomy_level;

  const keywordsStatus = statusFor({
    have: p.total_keywords,
    target: topic.max_keywords,
    upstreamReady: true,
    autonomy,
    isLive,
  });

  const sourcesStatus = statusFor({
    have: p.total_sources,
    liveStage: pipeline.state.stages.search,
    upstreamReady: p.total_keywords > 0,
    autonomy,
    isLive,
  });

  const contentStatus = statusFor({
    have: p.total_content,
    liveStage: pipeline.state.stages.scrape,
    upstreamReady: p.total_sources > 0,
    autonomy,
    isLive,
  });

  const analysisStatus = statusFor({
    have: p.total_analyses,
    target: p.total_eligible_for_analysis || undefined,
    hasFailures: p.failed_analyses > 0,
    liveStage: pipeline.state.stages.analyze,
    upstreamReady: p.total_content > 0,
    autonomy,
    isLive,
  });

  const synthesisStatus = statusFor({
    have: p.keyword_syntheses,
    target: p.total_keywords || undefined,
    hasFailures: p.failed_keyword_syntheses > 0,
    liveStage: pipeline.state.stages.synthesize,
    upstreamReady: p.total_analyses > 0,
    autonomy,
    isLive,
  });

  const reportStatus = statusFor({
    have: p.project_syntheses,
    hasFailures: p.failed_project_syntheses > 0,
    liveStage: pipeline.state.stages.report,
    upstreamReady: p.keyword_syntheses > 0,
    autonomy,
    isLive,
  });

  const documentStatus = statusFor({
    have: p.total_documents,
    upstreamReady: p.project_syntheses > 0,
    autonomy,
    isLive,
  });

  // Tags are a MANUAL organization branch — they are NOT generated during an
  // automatic pipeline run (the backend `/run` emits no tag events). Force
  // `isLive: false` so the node never shows a "queued"/"active" animation that
  // would imply tags are being produced by the run when nothing happens.
  const tagsStatus = statusFor({
    have: p.total_tags,
    upstreamReady: p.total_sources > 0,
    autonomy,
    isLive: false,
  });

  const base = `/research/topics/${topicId}`;

  // Per-node action availability — only show the play button when running
  // that step independently makes sense AND it's not currently running.
  const canRunSearch = p.total_keywords > 0 && !stream.isStreaming;
  const canRunScrape = p.total_sources > 0 && !stream.isStreaming;
  const canRunAnalyze = p.total_content > 0 && !stream.isStreaming;
  const canRunSynthesize = p.total_analyses > 0 && !stream.isStreaming;
  const canRunReport = p.keyword_syntheses > 0 && !stream.isStreaming;
  const canRunAll = p.total_keywords > 0 && !stream.isStreaming;

  return (
    <div className="p-2 space-y-3 min-w-0">
      {/* ── Control strip ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 p-1.5 pl-3 rounded-full matrx-glass-thin-border">
        {/* status dot */}
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full shrink-0",
            stream.isStreaming
              ? "bg-primary animate-pulse"
              : reportStatus === "complete"
                ? "bg-emerald-500"
                : "bg-muted-foreground/40",
          )}
        />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 truncate">
          {stream.isStreaming
            ? `${pipeline.state.activeStage ?? "Working"}…`
            : reportStatus === "complete"
              ? "Report ready"
              : "Pipeline idle"}
        </span>

        <div className="flex-1" />

        <AutonomyControl topicId={topicId} value={autonomy} onSaved={refresh} />
        <ProviderControl
          topicId={topicId}
          value={
            (topic.default_search_provider ?? "brave") as "brave" | "google"
          }
          onSaved={refresh}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-full matrx-glass-card text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Topic settings"
            >
              <Settings className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Quotas, status, project, agents</TooltipContent>
        </Tooltip>

        {/* Primary CTA: Run all OR Cancel */}
        {stream.isStreaming ? (
          <button
            onClick={stream.cancel}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
          >
            <Square className="h-3 w-3 fill-current" />
            <span>Stop</span>
          </button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={!canRunAll}
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-semibold transition-all",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "disabled:opacity-40 disabled:pointer-events-none",
                )}
              >
                <Play className="h-3 w-3 fill-current" />
                <span>Run pipeline</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-72 rounded-xl border-border/60 bg-popover/95 backdrop-blur"
            >
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Run the pipeline
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={handleRunAll}
                disabled={!canRunAll}
                className="flex-col items-start gap-0.5 py-2"
              >
                <span className="flex items-center text-xs font-medium">
                  <Play className="h-3 w-3 mr-2 shrink-0" />
                  Run everything pending
                </span>
                <span className="pl-5 text-[10px] leading-snug text-muted-foreground">
                  Search, scrape, analyze, then write the report — skips steps
                  already done.
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Iterate the report — no re-scraping
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={handleUpdateReport}
                disabled={!canRunReport}
                className="flex-col items-start gap-0.5 py-2"
              >
                <span className="flex items-center text-xs font-medium">
                  <Pencil className="h-3 w-3 mr-2 shrink-0" />
                  Update report
                </span>
                <span className="pl-5 text-[10px] leading-snug text-muted-foreground">
                  Keep the current report and fold in new or changed sources.
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleRebuildReport}
                disabled={!canRunReport}
                className="flex-col items-start gap-0.5 py-2"
              >
                <span className="flex items-center text-xs font-medium">
                  <RefreshCw className="h-3 w-3 mr-2 shrink-0" />
                  Rebuild report
                </span>
                <span className="pl-5 text-[10px] leading-snug text-muted-foreground">
                  Rewrite from scratch using all included sources (reuses
                  existing analyses).
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setKeywordModalOpen(true)}>
                <Plus className="h-3 w-3 mr-2" />
                Add keywords
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── The orchestra ─────────────────────────────────────────────── */}
      {/*
        On large screens: a single horizontal flow with the Tags branch below
        the spine, between Analysis and Synthesis. On small screens: stack
        vertically with a single column of nodes.
      */}
      <div className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm p-3 lg:p-4 overflow-hidden">
        {/* MOBILE / VERTICAL */}
        <div className="lg:hidden space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <OrchestraNode
              icon={Search}
              label="Keywords"
              count={p.total_keywords}
              hint={`of ${topic.max_keywords ?? 5} max`}
              status={keywordsStatus}
              href={`${base}/keywords`}
              onAction={handleSearch}
              actionDisabled={!canRunSearch}
              actionLabel="Search keywords"
            />
            <OrchestraNode
              icon={Globe}
              label="Sources"
              count={p.total_sources}
              hint={`${p.included_sources} included`}
              status={sourcesStatus}
              href={`${base}/sources`}
              onAction={handleScrape}
              actionDisabled={!canRunScrape}
              actionLabel="Scrape pending sources"
            />
            <OrchestraNode
              icon={FileText}
              label="Content"
              count={p.total_content}
              hint={`top ${topic.scrapes_per_keyword ?? 5}/kw`}
              status={contentStatus}
              href={`${base}/content`}
              onAction={handleAnalyze}
              actionDisabled={!canRunAnalyze}
              actionLabel="Analyze pages"
            />
            <OrchestraNode
              icon={Brain}
              label="Analysis"
              count={`${p.total_analyses}${p.total_eligible_for_analysis ? ` / ${p.total_eligible_for_analysis}` : ""}`}
              hint={
                p.failed_analyses > 0
                  ? `${p.failed_analyses} failed`
                  : "page summaries"
              }
              status={analysisStatus}
              href={`${base}/analysis`}
              onAction={handleSynthesize}
              actionDisabled={!canRunSynthesize}
              actionLabel="Synthesize keywords"
            />
            <OrchestraNode
              icon={Tags}
              label="Tags"
              count={p.total_tags}
              hint="manual · group & consolidate"
              status={tagsStatus}
              href={`${base}/tags`}
              ribbon={
                <span className="text-[9px] font-medium text-muted-foreground/70">
                  manual
                </span>
              }
            />
            <OrchestraNode
              icon={Layers}
              label="Synthesis"
              count={`${p.keyword_syntheses}${p.total_keywords ? ` / ${p.total_keywords}` : ""}`}
              hint="per keyword"
              status={synthesisStatus}
              href={`${base}/synthesis`}
              onAction={handleSynthesize}
              actionDisabled={!canRunSynthesize}
              actionLabel="Synthesize keywords"
            />
            <OrchestraNode
              icon={ScrollText}
              label="Report"
              count={p.project_syntheses > 0 ? "Ready" : "—"}
              hint={
                p.project_syntheses > 0
                  ? "project-wide"
                  : `needs ${p.total_keywords - p.keyword_syntheses} kw syntheses`
              }
              status={reportStatus}
              href={`${base}/synthesis`}
              onAction={handleSynthesize}
              actionDisabled={!canRunReport}
              actionLabel="Generate report"
            />
            <OrchestraNode
              icon={FileSpreadsheet}
              label="Document"
              count={p.total_documents > 0 ? p.total_documents : "—"}
              hint={
                p.total_documents > 0
                  ? `version${p.total_documents === 1 ? "" : "s"}`
                  : "from report"
              }
              status={documentStatus}
              href={`${base}/document`}
            />
          </div>
        </div>

        {/* DESKTOP / HORIZONTAL ORCHESTRA */}
        <div className="hidden lg:block">
          {/* Spine row — 7 nodes with edges between them.
              The grid uses fr-units for nodes and fixed-min for edges so
              edges stretch to fill while nodes hold their natural width. */}
          <div
            className="grid items-stretch gap-1"
            style={{
              gridTemplateColumns:
                "minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr)",
            }}
          >
            <OrchestraNode
              icon={Search}
              label="Keywords"
              count={p.total_keywords}
              hint={`of ${topic.max_keywords ?? 5} max`}
              status={keywordsStatus}
              href={`${base}/keywords`}
              onAction={handleSearch}
              actionDisabled={!canRunSearch}
              actionLabel="Search keywords"
            />
            <div className="flex items-center px-1">
              <OrchestraEdge
                state={edgeStateFor(keywordsStatus, sourcesStatus)}
              />
            </div>

            <OrchestraNode
              icon={Globe}
              label="Sources"
              count={p.total_sources}
              hint={`${p.included_sources} included · ${topic.scrapes_per_keyword ?? 5}/kw scraped`}
              status={sourcesStatus}
              href={`${base}/sources`}
              onAction={handleScrape}
              actionDisabled={!canRunScrape}
              actionLabel="Scrape pending sources"
            />
            <div className="flex items-center px-1">
              <OrchestraEdge
                state={edgeStateFor(sourcesStatus, contentStatus)}
              />
            </div>

            <OrchestraNode
              icon={FileText}
              label="Content"
              count={p.total_content}
              hint={`${p.total_sources > 0 ? Math.round((p.total_content / p.total_sources) * 100) : 0}% scraped`}
              status={contentStatus}
              href={`${base}/content`}
              onAction={handleAnalyze}
              actionDisabled={!canRunAnalyze}
              actionLabel="Analyze pages"
            />
            <div className="flex items-center px-1">
              <OrchestraEdge
                state={edgeStateFor(contentStatus, analysisStatus)}
              />
            </div>

            <OrchestraNode
              icon={Brain}
              label="Analysis"
              count={`${p.total_analyses}${p.total_eligible_for_analysis ? ` / ${p.total_eligible_for_analysis}` : ""}`}
              hint={
                p.failed_analyses > 0
                  ? `${p.failed_analyses} failed · ${topic.analyses_per_keyword ?? 5}/kw`
                  : `${topic.analyses_per_keyword ?? 5}/kw page summaries`
              }
              status={analysisStatus}
              href={`${base}/analysis`}
              onAction={handleSynthesize}
              actionDisabled={!canRunSynthesize}
              actionLabel="Synthesize keywords"
            />
            <div className="flex items-center px-1">
              <OrchestraEdge
                state={edgeStateFor(analysisStatus, synthesisStatus)}
              />
            </div>

            <OrchestraNode
              icon={Layers}
              label="Synthesis"
              count={`${p.keyword_syntheses}${p.total_keywords ? ` / ${p.total_keywords}` : ""}`}
              hint={
                p.failed_keyword_syntheses > 0
                  ? `${p.failed_keyword_syntheses} failed`
                  : "per keyword"
              }
              status={synthesisStatus}
              href={`${base}/synthesis`}
              onAction={handleSynthesize}
              actionDisabled={!canRunSynthesize}
              actionLabel="Synthesize keywords"
            />
            <div className="flex items-center px-1">
              <OrchestraEdge
                state={edgeStateFor(synthesisStatus, reportStatus)}
              />
            </div>

            <OrchestraNode
              icon={ScrollText}
              label="Report"
              count={p.project_syntheses > 0 ? "Ready" : "—"}
              hint={
                p.project_syntheses > 0 ? "project-wide" : "awaiting syntheses"
              }
              status={reportStatus}
              href={`${base}/synthesis`}
              onAction={handleSynthesize}
              actionDisabled={!canRunReport}
              actionLabel="Generate report"
            />
            <div className="flex items-center px-1">
              <OrchestraEdge
                state={edgeStateFor(reportStatus, documentStatus)}
              />
            </div>

            <OrchestraNode
              icon={FileSpreadsheet}
              label="Document"
              count={p.total_documents > 0 ? p.total_documents : "—"}
              hint={
                p.total_documents > 0
                  ? `version${p.total_documents === 1 ? "" : "s"}`
                  : "from report"
              }
              status={documentStatus}
              href={`${base}/document`}
            />
          </div>

          {/* Tags branch — fork from Sources + Analysis, rejoin at Synthesis.
              Rendered as an absolutely positioned row UNDER the spine using a
              second grid that mirrors the spine column widths. */}
          <div className="relative mt-1.5">
            {/* Curved fork lines — pure decoration, drawn behind. */}
            <div
              className="grid items-stretch gap-1 pointer-events-none"
              style={{
                gridTemplateColumns:
                  "minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr)",
              }}
            >
              {/* col 1 = Keywords (no fork) */}
              <div />
              <div />
              {/* col 3 = Sources → curve down to Tags (col 5 area).
                  Always dashed: tags are a manual branch, never fed by a live
                  run, so this stays a structural hint and never animates flow. */}
              <div className="flex justify-end pr-2">
                <OrchestraCurvedEdge
                  state="dashed"
                  width={80}
                  height={40}
                  direction="down-right"
                />
              </div>
              <div />
              <div /> {/* placeholder under Content */}
              <div />
              {/* col 7 = Analysis → curve down to Tags. Always dashed (see above). */}
              <div className="flex justify-start pl-2">
                <OrchestraCurvedEdge
                  state="dashed"
                  width={80}
                  height={40}
                  direction="down-right"
                />
              </div>
              <div />
              <div /> {/* placeholder under Synthesis */}
              <div />
              <div /> {/* placeholder under Report */}
              <div />
              <div /> {/* placeholder under Document */}
            </div>

            {/* Tags node positioned in the column under Content/Analysis */}
            <div
              className="grid items-stretch gap-1 mt-2"
              style={{
                gridTemplateColumns:
                  "minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr) 0.4fr minmax(0,1fr)",
              }}
            >
              <div /> {/* Keywords */}
              <div />
              <div /> {/* Sources */}
              <div />
              <div className="col-span-3">
                {/* Tags spans visually under Content–Analysis */}
                <OrchestraNode
                  icon={Tags}
                  label="Tags"
                  count={p.total_tags}
                  status={tagsStatus}
                  href={`${base}/tags`}
                  hint="manual · group & consolidate"
                  ribbon={
                    <span className="inline-flex items-center gap-1 text-[9px] font-medium text-muted-foreground/70">
                      <span className="px-1 py-px rounded bg-muted/50">
                        MANUAL
                      </span>
                    </span>
                  }
                  tooltip={
                    <div className="space-y-1 max-w-xs">
                      <div className="font-medium text-xs">Tags (manual)</div>
                      <div className="text-[11px] text-muted-foreground leading-snug">
                        A manual organization tool — not part of an automatic
                        run. On the Tags page, create a tag, assign sources to
                        it, then consolidate to synthesize across that
                        dimension.
                      </div>
                    </div>
                  }
                />
              </div>
              <div />
              <div /> {/* Synthesis */}
              <div />
              <div /> {/* Report */}
              <div />
              <div /> {/* Document */}
            </div>
          </div>
        </div>
      </div>

      {/* ── Active drawer / Last-Run summary ──────────────────────────── */}
      {stream.isStreaming ||
      pipeline.state.activeStage ||
      pipeline.state.completedAt ? (
        <LivePipelineActivity
          pipeline={pipeline}
          topic={topic}
          topicId={topicId}
          isStreaming={stream.isStreaming}
          streamingText={stream.streamingText}
          error={stream.error}
          rawEvents={stream.rawEvents}
          onCancel={stream.cancel}
          onClose={() => {
            stream.clearMessages();
            pipeline.reset();
          }}
          onSourceUpdated={refresh}
        />
      ) : (
        <LastRunSummary
          topicId={topicId}
          progress={progress}
          costSummary={costSummary}
          finishedAt={topic.updated_at ?? topic.created_at}
          variant="cold"
        />
      )}

      {/* Empty-state hint when nothing has been done yet */}
      {p.total_keywords === 0 && !stream.isStreaming && (
        <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Search className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold mb-0.5">
                Add your first keywords
              </h3>
              <p className="text-[11px] text-muted-foreground leading-snug mb-2">
                Keywords drive everything downstream. Add a few search terms and
                the orchestra will light up — or hit Run pipeline to let the
                agent suggest them.
              </p>
              <Link
                href={`${base}/keywords`}
                className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Manage keywords
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings drawer ──────────────────────────────────────────── */}
      <TopicSettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        topic={topic}
        onSaved={refresh}
      />

      {/* ── Add Keyword modal (kept here so the Run-options menu can open it) */}
      {isMobile ? (
        <Drawer open={keywordModalOpen} onOpenChange={setKeywordModalOpen}>
          <DrawerContent className="max-h-[50dvh]">
            <DrawerTitle className="px-4 pt-3 text-sm font-semibold">
              Add keyword
            </DrawerTitle>
            <KeywordForm
              value={newKeyword}
              onChange={setNewKeyword}
              onCancel={() => setKeywordModalOpen(false)}
              onSubmit={handleAddKeyword}
              busy={addingKeyword}
            />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={keywordModalOpen} onOpenChange={setKeywordModalOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Add keyword</DialogTitle>
            </DialogHeader>
            <KeywordForm
              value={newKeyword}
              onChange={setNewKeyword}
              onCancel={() => setKeywordModalOpen(false)}
              onSubmit={handleAddKeyword}
              busy={addingKeyword}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface KeywordFormProps {
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  busy: boolean;
}

function KeywordForm({
  value,
  onChange,
  onCancel,
  onSubmit,
  busy,
}: KeywordFormProps) {
  return (
    <div className="space-y-3 p-4">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter a keyword…"
        className="h-9 text-xs rounded-lg"
        style={{ fontSize: "16px" }}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="inline-flex items-center h-8 px-4 rounded-full matrx-glass-card text-xs font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={!value.trim() || busy}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium transition-all min-h-[44px]",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Add keyword
        </button>
      </div>
    </div>
  );
}
