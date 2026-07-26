"use client";

/**
 * KeywordResearchLauncher — THE canonical "run keyword research and watch it
 * live" surface. Input + Research button + pipeline stage line + the live
 * kind-component feed (LiveResearchFeed) + the durable done-summary strip.
 *
 * One implementation, consumed by:
 *  - the /marketing/keyword-research workbench (page)
 *  - KeywordResearchWindow (floating panel, openable from anywhere via
 *    `useOpenKeywordResearchWindow`)
 *
 * State lives in the caller's `useKeywordResearch()` instance — this
 * component is presentational + input handling only, so a host can compose
 * it with its own explorer (table, cluster list) off the same hook.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, SearchCheck } from "lucide-react";

import type { ResearchRunState } from "../useKeywordResearch";
import LiveResearchFeed from "./LiveResearchFeed";

export interface KeywordResearchLauncherProps {
  run: ResearchRunState;
  runResearch: (primaryKeyword: string) => Promise<void>;
  /** Pre-fill the input (e.g. a content-plan node's target keyword). */
  initialKeyword?: string;
  /** Fire the research immediately on mount when `initialKeyword` is set. */
  autoRun?: boolean;
  /** Max height class for the live feed scroll area. */
  feedMaxHeightClassName?: string;
  /** Notified on every input change — hosts persist it (window panels). */
  onKeywordChange?: (keyword: string) => void;
}

export default function KeywordResearchLauncher({
  run,
  runResearch,
  initialKeyword,
  autoRun = false,
  feedMaxHeightClassName = "max-h-[26rem]",
  onKeywordChange,
}: KeywordResearchLauncherProps) {
  const [primaryInput, setPrimaryInput] = useState(initialKeyword ?? "");
  const autoRanRef = useRef(false);

  const handleRun = useCallback(() => {
    if (!primaryInput.trim() || run.status === "running") return;
    void runResearch(primaryInput);
  }, [primaryInput, run.status, runResearch]);

  // autoRun: one shot, deferred so the launch's setState never fires inside
  // the effect body of a mounting tree.
  useEffect(() => {
    if (!autoRun || autoRanRef.current) return;
    autoRanRef.current = true;
    const keyword = (initialKeyword ?? "").trim();
    if (!keyword) return;
    void Promise.resolve().then(() => runResearch(keyword));
  }, [autoRun, initialKeyword, runResearch]);

  return (
    <div>
      <div className="flex max-w-2xl items-center gap-2">
        <div className="relative flex-1">
          <SearchCheck className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={primaryInput}
            onChange={(event) => {
              setPrimaryInput(event.target.value);
              onKeywordChange?.(event.target.value);
            }}
            onKeyDown={(event) => event.key === "Enter" && handleRun()}
            placeholder="Research a primary keyword (e.g. botox cost)"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            style={{ fontSize: "16px" }}
            disabled={run.status === "running"}
          />
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={run.status === "running" || !primaryInput.trim()}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {run.status === "running" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SearchCheck className="h-4 w-4" />
          )}
          Research
        </button>
      </div>
      {run.status === "running" && (
        <p className="mt-2 text-xs text-muted-foreground">
          {run.stage ?? `Running research for “${run.primaryKeyword}”`}
        </p>
      )}
      {/* Live feed: the agent's structured output rendered as real
          components key-by-key while streaming — never raw JSON. Stays
          visible after completion so the run's map remains inspectable. */}
      {(run.status === "running" || run.status === "done") && run.streamKey && (
        <div
          className={`mt-2 overflow-y-auto rounded-md border border-border bg-muted/20 px-3 py-1 ${feedMaxHeightClassName}`}
        >
          <LiveResearchFeed
            streamKey={run.streamKey}
            researchText={run.researchOutput ?? ""}
            researchDone={run.researchDone ?? run.status === "done"}
            classificationText={run.classificationOutput ?? ""}
            classificationDone={run.classificationDone ?? run.status === "done"}
          />
        </div>
      )}
      {run.status === "error" && (
        <p className="mt-2 text-xs text-destructive">{run.error}</p>
      )}
      {run.status === "done" && run.result && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            “{run.result.primary_keyword}”
          </span>
          <span>{run.result.ingest.keywords_created ?? 0} new keywords</span>
          <span>{run.result.ingest.keywords_already_existed ?? 0} known</span>
          <span>{run.result.ingest.edges_written ?? 0} relationships</span>
          {(run.result.ingest.edges_skipped_rejected ?? 0) > 0 && (
            <span>
              {run.result.ingest.edges_skipped_rejected} rejected honored
            </span>
          )}
          {run.result.volume && (
            <span>
              volume fetched for {run.result.volume.fetched_phrases ?? 0} (
              {run.result.volume.skipped_fresh ?? 0} already fresh)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
