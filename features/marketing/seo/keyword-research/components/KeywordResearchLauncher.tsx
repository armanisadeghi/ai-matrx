"use client";

/**
 * KeywordResearchLauncher — THE canonical "run keyword research and watch it
 * live" surface. Input + Research button + pipeline stage line + the live
 * canonical live render (<MarkdownStream> over the adopted pipeline stream)
 * + the durable done-summary strip.
 *
 * One implementation, consumed by:
 *  - the /marketing/keyword-research workbench (page)
 *  - KeywordResearchWindow (floating panel, openable from anywhere via
 *    `useOpenKeywordResearchWindow`)
 *
 * State lives in the caller's `useKeywordResearch()` instance so a host can
 * compose it with its own explorer (table, cluster list) off the same hook.
 * The launcher additionally owns DURABLE MEMORY: it reads the latest saved
 * artifact for the phrase in play (useSavedKeywordResearch) and renders it
 * whenever the ephemeral live stream can't — idle remounts, reopened windows,
 * and rejoined runs (the server replays stages, never AI chunks). Results a
 * user paid for must never vanish from the surface that produced them.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, SearchCheck } from "lucide-react";

import type { ResearchRunState } from "../useKeywordResearch";
import {
  savedKeywordResearchQueryKey,
  useSavedKeywordResearch,
} from "../useSavedKeywordResearch";
import MarkdownStream from "@/components/MarkdownStream";
import { useFloatingLiveRun } from "@/features/overlays/openers/liveRunWindow";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import SavedResearchFeed from "./SavedResearchFeed";
import {
  assertNoRunInFlight,
  parseStagedKeywordWrite,
} from "../keyword-research-write";

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
  /** Org owning the durable saved-research read. Defaults to the effective
   * organization (the same org callApi stamps on the run itself). */
  organizationId?: string | null;
  /**
   * Surface whose `research_input_keyword` write target this launcher should
   * service. ONLY the host that actually mounts that surface passes it — the
   * workbench does; `KeywordResearchWindow` (a floating overlay above whatever
   * page the user is on) deliberately does not, so an agent run on the page
   * underneath can never type into a window that page does not own.
   */
  writeTargetSurfaceName?: string | null;
  /**
   * Where the live run renders. THE FLOATING LAW
   * (features/window-panels/FEATURE.md): a host whose own content sits BELOW
   * the launcher must pass `"floating"` — an inline feed expands the moment a
   * run starts and shoves that content down the page. `"inline"` is correct
   * only where nothing of the user's sits underneath (the window panel, the
   * bottom-of-page tab).
   */
  liveFeed?: "inline" | "floating";
}

export default function KeywordResearchLauncher({
  run,
  runResearch,
  initialKeyword,
  autoRun = false,
  feedMaxHeightClassName = "max-h-[26rem]",
  onKeywordChange,
  organizationId,
  writeTargetSurfaceName = null,
  liveFeed = "inline",
}: KeywordResearchLauncherProps) {
  const [primaryInput, setPrimaryInput] = useState(initialKeyword ?? "");
  const autoRanRef = useRef(false);
  const queryClient = useQueryClient();

  // Live run status for the write handler below. The writeback seam resolves
  // handler closures before the user confirms, so the guard must not read the
  // status off the render that happened to build the closure.
  const runStatusRef = useRef(run.status);
  useEffect(() => {
    runStatusRef.current = run.status;
  }, [run.status]);

  // Durable memory: the latest persisted artifact for the phrase in play.
  // The live stream is ephemeral (the server's rejoin replays stages, never
  // AI chunks), so after a remount/reopen this is what keeps results visible.
  const savedPhrase = run.primaryKeyword ?? primaryInput;
  const saved = useSavedKeywordResearch(savedPhrase, organizationId, {
    debounceMs: 350,
  });

  const hasLiveOutput = Boolean(run.requestId && run.hasStreamedContent);
  // The freshest durable truth: this run's completed result, else the saved
  // artifact from a previous run of the same phrase.
  const durableArtifact = run.result?.artifact ?? saved.data?.artifact ?? null;

  // A finished run persisted a new artifact — refresh the shared saved-research
  // cache so every consumer (this launcher, the Keyword Intelligence tab)
  // remembers it after remount.
  useEffect(() => {
    if (run.status === "done") {
      void queryClient.invalidateQueries({
        queryKey: savedKeywordResearchQueryKey(
          saved.organizationId,
          savedPhrase,
        ),
      });
    }
  }, [run.status, queryClient, saved.organizationId, savedPhrase]);

  // Floating hosts stream into the canonical LiveRunWindow instead of growing
  // an inline feed that would push the host's own content down.
  useFloatingLiveRun({
    active: liveFeed === "floating" && run.status === "running",
    instanceId: "keyword-research-launcher",
    requestId: run.requestId,
    label: run.stage ?? `Researching “${run.primaryKeyword ?? primaryInput}”`,
  });

  const handleRun = useCallback(() => {
    if (!primaryInput.trim() || run.status === "running") return;
    void runResearch(primaryInput);
  }, [primaryInput, run.status, runResearch]);

  /**
   * `research_input_keyword` — the surface write target for this input. The
   * launcher registers it itself because it OWNS `primaryInput`; the workbench
   * only publishes the surface. Staging goes through exactly the path the
   * user's typing goes through (`setPrimaryInput` + `onKeywordChange`), so the
   * host's emitted value and the box can never disagree. Nothing here starts a
   * run — `handleRun` stays behind the button.
   */
  useSurfaceWriteHandlers(writeTargetSurfaceName, {
    research_input_keyword: (value: unknown) => {
      // Refuse before validating shape: while a run is in flight the answer is
      // the same whatever was sent, and it is the more actionable reason.
      // Read through the REF — the writeback seam resolves every handler
      // BEFORE the user confirms the first ask dialog, so `run.status` off this
      // render closure can be a stale "idle" for a run that has since started.
      assertNoRunInFlight(runStatusRef.current, "research_input_keyword");
      const phrase = parseStagedKeywordWrite(value);
      setPrimaryInput(phrase);
      onKeywordChange?.(phrase);
    },
  });

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
      {/* Live feed: the agent's structured output rendered as real
          components key-by-key while streaming — never raw JSON. Stays
          visible after completion or failure so the run never vanishes while
          the user is trying to understand what happened. */}
      {run.status !== "idle" && liveFeed === "inline" && (
        <div
          className={`mt-2 min-h-16 overflow-y-auto rounded-md border border-border bg-muted/20 ${feedMaxHeightClassName}`}
          aria-live="polite"
        >
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 text-xs backdrop-blur">
            {run.status === "running" && (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            )}
            <span
              className={
                run.status === "error"
                  ? "font-medium text-destructive"
                  : run.status === "done"
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
              }
            >
              {run.stage ?? `Running research for “${run.primaryKeyword}”`}
            </span>
          </div>
          <div className="px-3 py-2">
            {!hasLiveOutput ? (
              durableArtifact && run.status !== "error" ? (
                // Rejoined or recovered run: the token stream is gone (chunk
                // replay doesn't exist), but the persisted artifact is the
                // same content — render it instead of a blank "waiting".
                <SavedResearchFeed artifact={durableArtifact} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {run.status === "error"
                    ? "No agent output was produced. Research stopped before structured output began."
                    : "Waiting for structured research output…"}
                </p>
              )
            ) : (
              // The ONE canonical renderer, driven by the adopted requestId.
              // Every research + classification payload routes to its real
              // kind component through the same pipeline chat uses.
              <MarkdownStream
                requestId={run.requestId}
                isStreamActive={run.status === "running"}
                hideCopyButton
              />
            )}
          </div>
        </div>
      )}
      {/* Idle memory: the last persisted research for the phrase in the
          input — a reopened window / revisited page starts from what the
          user already paid for instead of a blank slate. */}
      {run.status === "idle" && saved.data && (
        <div className="mt-2">
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Showing saved research from{" "}
            {new Date(saved.data.createdAt).toLocaleString()}. Run again only
            for a refresh.
          </p>
          <div
            className={`overflow-y-auto rounded-md border border-border bg-muted/20 px-3 py-2 ${feedMaxHeightClassName}`}
          >
            <SavedResearchFeed artifact={saved.data.artifact} />
          </div>
        </div>
      )}
      {run.status === "error" && (
        <div
          role="alert"
          className="mt-2 max-w-2xl rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {run.error}
        </div>
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
