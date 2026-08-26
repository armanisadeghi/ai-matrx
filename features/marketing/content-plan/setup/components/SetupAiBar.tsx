"use client";

/**
 * The AI grounding strip at the top of Site Setup: pick which RESEARCH TOPIC
 * (the research system's deep company report) grounds the AI steps. When none
 * exists, this opens the canonical reviewed Research intake; it never starts
 * a pipeline or attaches an unreviewed report itself.
 *
 * The per-family "AI names" buttons live on the count rows in
 * SetupWorkOrderColumn; this bar owns the shared grounding + the shape step.
 */
import {
  BookMarked,
  ClipboardList,
  Compass,
  ExternalLink,
  ListChecks,
  Loader2,
  X,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ResearchTopicSelect } from "@/features/marketing/content-plan/components/ResearchTopicSelect";
import type { ResearchDocument } from "@/features/research/types";

export interface SetupAiRunSummary {
  kind: "shape" | "names" | "review" | "keywords" | "entities";
  headline: string;
  detail?: string;
}

export function SetupAiBar({
  selectedTopicId,
  onSelectTopic,
  researchPlanHref,
  document,
  documentLoading,
  onRecommendShape,
  shapeBusy,
  onBuildWithAi,
  draftBusy,
  anyAgentBusy,
  lastRun,
  error,
  onDismissError,
}: {
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
  /** Canonical Research intake: propose → review keywords/settings → approve. */
  researchPlanHref: string;
  /** The newest rs_document for the selected topic (null = none yet). */
  document: ResearchDocument | null;
  documentLoading: boolean;
  onRecommendShape: () => void;
  shapeBusy: boolean;
  /**
   * Open the Build-with-AI intake (hints → shape + counts + names + topics,
   * all staged for review). Requires a completed research report.
   */
  onBuildWithAi: () => void;
  draftBusy: boolean;
  anyAgentBusy: boolean;
  lastRun: SetupAiRunSummary | null;
  error: string | null;
  onDismissError: () => void;
}) {
  const reportReady = Boolean(
    document && document.status === "success" && document.content?.trim(),
  );
  const anyBusy = anyAgentBusy;
  const reportStatus = (() => {
    if (!selectedTopicId)
      return "Choose existing research, or review a new plan before anything runs.";
    if (documentLoading) return "Loading the research report…";
    if (!document) return "This topic has no successful final report yet — run Document assembly in Research first.";
    if (!document.content?.trim()) return "The report is empty — regenerate it in Research.";
    const size = Math.round((document.content?.length ?? 0) / 1000);
    return `Report v${document.version ?? 1} loaded (~${size}k chars).`;
  })();

  return (
    <div className="border-b border-border bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <BookMarked className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="text-xs font-medium text-foreground">AI grounding</span>
        <ResearchTopicSelect
          value={selectedTopicId}
          onChange={onSelectTopic}
          refreshKey={selectedTopicId}
          ariaLabel="Research topic grounding the AI steps"
        />
        <Button
          asChild
          size="sm"
          variant={reportReady ? "ghost" : "outline"}
          className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
          title="Open Research to generate a proposed topic and keywords, review keyword limits and settings, then explicitly approve the run."
        >
          <Link href={researchPlanHref}>
            <ListChecks className="h-3.5 w-3.5" />
            Plan company research
          </Link>
        </Button>
        {selectedTopicId ? (
          <a
            href={`/research/topics/${selectedTopicId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            title="Open this research topic in the Research workspace (new tab)"
          >
            <ExternalLink className="h-3 w-3" />
            Open in Research
          </a>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {reportStatus}
        </span>
        <Button
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
          disabled={!reportReady || anyBusy}
          title={
            reportReady
              ? "Answer a few optional questions and draft the work order from the approved research report. Everything stages for review."
              : "Choose a completed research report first. New research must be planned, reviewed, and explicitly started in Research."
          }
          onClick={onBuildWithAi}
        >
          {draftBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ClipboardList className="h-3.5 w-3.5" />
          )}
          Build with AI
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
          disabled={!reportReady || anyBusy}
          title={
            reportReady
              ? "Just the first step: recommend the site shape and set every family count."
              : "Ground the AI first: pick a research topic with a finished report, or plan company research from here."
          }
          onClick={onRecommendShape}
        >
          {shapeBusy && !draftBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Compass className="h-3.5 w-3.5" />
          )}
          Shape only
        </Button>
      </div>
      {error ? (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-destructive">
          <span className="min-w-0 flex-1 truncate" title={error}>
            {error}
          </span>
          <button type="button" aria-label="Dismiss AI error" onClick={onDismissError}>
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : lastRun ? (
        <p
          className="mt-1.5 truncate text-[11px] text-muted-foreground"
          title={lastRun.detail ?? lastRun.headline}
        >
          {lastRun.headline}
          {lastRun.detail ? ` — ${lastRun.detail}` : ""}
        </p>
      ) : null}
    </div>
  );
}
