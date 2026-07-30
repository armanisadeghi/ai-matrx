"use client";

/**
 * The AI grounding strip at the top of Site Setup: pick which RESEARCH TOPIC
 * (the research system's deep company report) grounds the AI steps, see
 * whether its final Document is actually there, and run the Shape Planner —
 * "read the report, pick the shape, set the counts" in one click.
 *
 * The per-family "AI names" buttons live on the count rows in
 * SetupWorkOrderColumn; this bar owns the shared grounding + the shape step.
 */
import { BookMarked, Compass, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ResearchDocument, ResearchTopic } from "@/features/research/types";

const NO_TOPIC = "__none__";

export interface SetupAiRunSummary {
  kind: "shape" | "names";
  headline: string;
  detail?: string;
}

export function SetupAiBar({
  topics,
  topicsLoading,
  selectedTopicId,
  onSelectTopic,
  document,
  documentLoading,
  onRecommendShape,
  shapeBusy,
  anyAgentBusy,
  lastRun,
  error,
  onDismissError,
}: {
  topics: ResearchTopic[];
  topicsLoading: boolean;
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
  /** The newest rs_document for the selected topic (null = none yet). */
  document: ResearchDocument | null;
  documentLoading: boolean;
  onRecommendShape: () => void;
  shapeBusy: boolean;
  anyAgentBusy: boolean;
  lastRun: SetupAiRunSummary | null;
  error: string | null;
  onDismissError: () => void;
}) {
  const reportReady = Boolean(
    document && document.status === "success" && document.content?.trim(),
  );
  const reportStatus = (() => {
    if (!selectedTopicId) return "Pick a research topic to ground the AI steps.";
    if (documentLoading) return "Loading the research report…";
    if (!document) return "This topic has no final report yet — run Document assembly in Research first.";
    if (document.status !== "success") return "The newest report version failed — regenerate it in Research.";
    if (!document.content?.trim()) return "The report is empty — regenerate it in Research.";
    const size = Math.round((document.content?.length ?? 0) / 1000);
    return `Report v${document.version ?? 1} loaded (~${size}k chars).`;
  })();

  return (
    <div className="border-b border-border bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <BookMarked className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="text-xs font-medium text-foreground">AI grounding</span>
        <Select
          value={selectedTopicId ?? NO_TOPIC}
          onValueChange={(value) =>
            onSelectTopic(value === NO_TOPIC ? null : value)
          }
        >
          <SelectTrigger
            className="h-7 w-56 text-xs"
            aria-label="Research topic grounding the AI steps"
          >
            <SelectValue
              placeholder={topicsLoading ? "Loading topics…" : "Pick a research topic"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TOPIC} className="text-xs">
              No research selected
            </SelectItem>
            {topics.map((topic) => (
              <SelectItem key={topic.id} value={topic.id} className="text-xs">
                {topic.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {reportStatus}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
          disabled={!reportReady || anyAgentBusy}
          title={
            reportReady
              ? "Read the report, recommend the site shape, and set every family count."
              : "Pick a research topic with a finished report first."
          }
          onClick={onRecommendShape}
        >
          {shapeBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Compass className="h-3.5 w-3.5" />
          )}
          Recommend shape &amp; counts
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
