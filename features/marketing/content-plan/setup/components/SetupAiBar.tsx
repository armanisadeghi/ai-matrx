"use client";

/**
 * The AI grounding strip at the top of Site Setup: pick which RESEARCH TOPIC
 * (the research system's deep company report) grounds the AI steps — or, when
 * none exists, CREATE one from here (the full pipeline runs and the report
 * lands back in this bar) — then draft the whole work order in one click.
 *
 * The per-family "AI names" buttons live on the count rows in
 * SetupWorkOrderColumn; this bar owns the shared grounding + the shape step.
 */
import {
  BookMarked,
  ClipboardList,
  Compass,
  ExternalLink,
  FlaskConical,
  Loader2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ResearchTopicSelect } from "@/features/marketing/content-plan/components/ResearchTopicSelect";
import type { QuickResearchStage } from "@/features/research/hooks/useCompanyQuickResearch";
import type { ResearchDocument } from "@/features/research/types";

export interface SetupAiRunSummary {
  kind: "shape" | "names" | "review" | "keywords" | "entities";
  headline: string;
  detail?: string;
}

const RESEARCH_STAGE_LABEL: Partial<Record<QuickResearchStage, string>> = {
  creating: "Creating the research topic…",
  running: "Researching — search, scrape, analyze, synthesize (several minutes)…",
  assembling: "Assembling the final report…",
};

export function SetupAiBar({
  selectedTopicId,
  onSelectTopic,
  onCreateResearch,
  researchStage,
  document,
  documentLoading,
  onRecommendShape,
  shapeBusy,
  onDraftWorkOrder,
  draftBusy,
  anyAgentBusy,
  lastRun,
  error,
  onDismissError,
}: {
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
  /** Run the full company-research pipeline from here (confirmed upstream). */
  onCreateResearch: () => void;
  researchStage: QuickResearchStage;
  /** The newest rs_document for the selected topic (null = none yet). */
  document: ResearchDocument | null;
  documentLoading: boolean;
  onRecommendShape: () => void;
  shapeBusy: boolean;
  /** ONE CLICK: shape + counts + names + topics, all staged for review. */
  onDraftWorkOrder: () => void;
  draftBusy: boolean;
  anyAgentBusy: boolean;
  lastRun: SetupAiRunSummary | null;
  error: string | null;
  onDismissError: () => void;
}) {
  const reportReady = Boolean(
    document && document.status === "success" && document.content?.trim(),
  );
  const researchBusy =
    researchStage === "creating" ||
    researchStage === "running" ||
    researchStage === "assembling";
  // ONE thing at a time across the whole bar: a research run mid-draft would
  // relink the site while the draft still reasons over the old report, and a
  // draft mid-research would ground on a report about to be replaced.
  const anyBusy = researchBusy || anyAgentBusy;
  const reportStatus = (() => {
    if (researchBusy) {
      return `${RESEARCH_STAGE_LABEL[researchStage]} Keep this tab open — the report lands here.`;
    }
    if (!selectedTopicId)
      return "Pick a research topic — or research the company from here.";
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
          refreshKey={researchStage === "done" ? selectedTopicId : null}
          ariaLabel="Research topic grounding the AI steps"
        />
        <Button
          size="sm"
          // The MAIN affordance until a report exists — grounding is the
          // prerequisite for every other button on this screen.
          variant={reportReady ? "ghost" : "outline"}
          className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
          disabled={anyBusy}
          title="Create a research topic for this site's company and run the full pipeline — the finished report grounds every AI step here."
          onClick={onCreateResearch}
        >
          {researchBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5" />
          )}
          Research this company
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
              ? "One click: pick the shape, set every count, name every services/locations page, and plan the article topics — all staged for your review, nothing written until you commit."
              : "Ground the AI first: pick a research topic with a finished report, or research the company from here."
          }
          onClick={onDraftWorkOrder}
        >
          {draftBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ClipboardList className="h-3.5 w-3.5" />
          )}
          Draft the work order
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
          disabled={!reportReady || anyBusy}
          title={
            reportReady
              ? "Just the first step: recommend the site shape and set every family count."
              : "Ground the AI first: pick a research topic with a finished report, or research the company from here."
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
