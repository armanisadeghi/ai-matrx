"use client";

/**
 * Keyword Intelligence — Research tab.
 *
 * Runs the full canonical keyword-research pipeline for the panel's phrase
 * (LSI agent → relationship ingestion → provider volume → classification) by
 * REUSING `useKeywordResearch` from the keyword-research feature — the same
 * durable-run, auto-rejoin behavior the workbench uses.
 *
 * Live output renders through the remount-proof `RunSetDisplay` (which
 * composes the ONE canonical pipeline, `MarkdownStream`
 * over the adopted requestId), exactly as chat does. Keyword SELECTION is not
 * threaded into the blocks as props — it travels the two surface seams:
 * this tab PUBLISHES `keyword_selection` UI state and REGISTERS the
 * `keyword_selection` write handler its manifest declares, and the blocks
 * read/write those by name. See KeywordResearchBlock's header for the
 * contract, and `features/surfaces/runtime/surface-writeback.ts`.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  FlaskConical,
  Loader2,
  Plus,
  Play,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { seoKeywordKeys } from "./hooks";
import { useKeywordResearch } from "@/features/marketing/seo/keyword-research/useKeywordResearch";
import {
  savedKeywordResearchQueryKey,
  useSavedKeywordResearch,
} from "@/features/marketing/seo/keyword-research/useSavedKeywordResearch";
import SavedResearchFeed from "@/features/marketing/seo/keyword-research/components/SavedResearchFeed";
import {
  RunSetDisplay,
  useRunSet,
} from "@/features/agents/components/live-run/RunSetDisplay";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { publishSurfaceUiState } from "@/features/surfaces/runtime/surface-ui-state";
import type {
  KeywordSelectionUiState,
  KeywordSelectionWrite,
} from "@/components/mardown-display/blocks/keyword-research/KeywordResearchBlock";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";
import {
  addPageSupportingKeywords,
  pageKeywordsQueryKey,
} from "@/features/marketing/data/page-keywords";
import { toast } from "@/lib/toast";

/**
 * The surface this tab lives inside — the Keyword Intelligence window owns the
 * `SurfaceRuntimeProvider`; this tab only registers the write target it can
 * service and publishes the UI state its blocks read.
 */
const KEYWORD_SURFACE = "matrx-user/keyword-intelligence";

export function KeywordResearchTab({
  phrase,
  organizationId,
  pageId,
  onResearchStart,
  onKeywordNavigate,
  onRunStateChange,
}: {
  phrase: string;
  organizationId?: string | null;
  pageId?: string | null;
  onResearchStart?: (phrase: string) => void;
  onKeywordNavigate?: (phrase: string) => void;
  onRunStateChange?: (state: KeywordResearchPanelState) => void;
}) {
  // The run set is the REMOUNT-PROOF home of this surface's live output:
  // registered runs live in Redux under this key, so a tab switch, a
  // query-driven re-render, or any parent remount re-attaches to the same
  // streamed content (features/agents/docs/LIVE_RUN_RETENTION.md § Multi-run
  // surfaces). Keyed per phrase + org so parallel windows never collide.
  const runSetKey = `keyword-research:${normalizeKeywordPhrase(phrase)}:${organizationId ?? "personal"}`;
  const research = useKeywordResearch(organizationId, {
    rejoinPhrase: phrase,
    runSetKey,
  });
  const { run } = research;
  const runSet = useRunSet(runSetKey);
  const running = run.status === "running";
  const queryClient = useQueryClient();
  const [selectedByKey, setSelectedByKey] = useState<Record<string, string>>(
    {},
  );
  const selectedPhrases = new Set(Object.keys(selectedByKey));
  const disabledPhrases = new Set([normalizeKeywordPhrase(phrase)]);
  const saved = useSavedKeywordResearch(phrase, organizationId);
  const visibleArtifact = run.result?.artifact ?? saved.data?.artifact ?? null;
  const hasLiveOutput = runSet.entries.length > 0;

  useEffect(() => {
    onRunStateChange?.({
      status: run.status,
      stage: run.stage ?? null,
      error: run.error ?? null,
      hasSavedResearch: Boolean(saved.data),
      savedAt: saved.data?.createdAt ?? null,
    });
  }, [run.status, run.stage, run.error, saved.data, onRunStateChange]);

  // ── The 360 loop, this surface's half ────────────────────────────────────
  // PUBLISH what the blocks need to read, REGISTER the handler for the target
  // the manifest declares. The blocks (streamed or saved) then work by name,
  // with no props and no knowledge of this component.
  const selectionKeys = Object.keys(selectedByKey).sort().join("|");
  const disabledKey = normalizeKeywordPhrase(phrase);
  useEffect(() => {
    if (!pageId) {
      // No page binding ⇒ nothing to attach keywords to ⇒ no selection is
      // offered. Clearing the key is what makes the blocks render read-only.
      publishSurfaceUiState(KEYWORD_SURFACE, "keyword_selection", undefined);
      return;
    }
    publishSurfaceUiState(KEYWORD_SURFACE, "keyword_selection", {
      selected: Object.keys(selectedByKey),
      disabled: [disabledKey],
    } satisfies KeywordSelectionUiState);
  }, [pageId, selectionKeys, disabledKey]);

  // Unpublish on unmount so a closed window never leaves stale selection
  // behind for the next surface that mounts.
  useEffect(
    () => () =>
      publishSurfaceUiState(KEYWORD_SURFACE, "keyword_selection", undefined),
    [],
  );

  const toggleKeyword = (candidate: string, selected: boolean) => {
    const key = normalizeKeywordPhrase(candidate);
    if (!key || disabledPhrases.has(key)) return;
    setSelectedByKey((current) => {
      if (selected) return { ...current, [key]: candidate.trim() };
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  useSurfaceWriteHandlers(KEYWORD_SURFACE, {
    keyword_selection: (value: unknown) => {
      const write = value as Partial<KeywordSelectionWrite> | null;
      if (!write || typeof write.phrase !== "string") {
        // Loud by contract: throwing here surfaces through the writeback
        // envelope (toast + captured error), never a silent no-op.
        throw new Error(
          "keyword_selection expects { phrase: string, selected: boolean }",
        );
      }
      // The manifest promises this target is "Rejected when the window has no
      // page binding", and the effect above deliberately unpublishes the
      // selection UI state in that case so the blocks render read-only. Without
      // this guard the handler still accepted the write and reported success
      // while nothing was selectable and nothing could ever be persisted —
      // the silent no-op the comment above rules out, and a promise the agent
      // was told it could rely on.
      if (!pageId) {
        throw new Error(
          'keyword_selection needs a page binding: this window was opened without one, so there is nothing to attach a supporting keyword to. Open Keyword Intelligence from a page (its "Add as supporting" control only exists there), or ask the user which page they mean.',
        );
      }
      toggleKeyword(write.phrase, write.selected === true);
    },
  });

  const addSelected = useMutation({
    mutationFn: () => {
      if (!pageId) throw new Error("A page binding is required.");
      return addPageSupportingKeywords(
        pageId,
        Object.values(selectedByKey),
        organizationId ?? undefined,
      );
    },
    onSuccess: (result) => {
      if (pageId) {
        void queryClient.invalidateQueries({
          queryKey: pageKeywordsQueryKey(pageId),
        });
      }
      if (result.attached.length > 0) {
        toast.success(
          `${result.attached.length} supporting keyword${result.attached.length === 1 ? "" : "s"} added`,
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          `${result.failed.length} keyword${result.failed.length === 1 ? "" : "s"} could not be added`,
          { description: result.failed.map((item) => item.phrase).join(", ") },
        );
      }
      const failedKeys = new Set(
        result.failed.map((item) => normalizeKeywordPhrase(item.phrase)),
      );
      setSelectedByKey((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => failedKeys.has(key)),
        ),
      );
    },
    onError: (error) => {
      toast.error("Could not add supporting keywords", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // A finished run wrote keyword/market/edge/classification rows — make every
  // keyword-primitive consumer (chips, Overview, Relationships) see them.
  useEffect(() => {
    if (run.status === "done") {
      void queryClient.invalidateQueries({ queryKey: seoKeywordKeys.all });
      void queryClient.invalidateQueries({
        queryKey: savedKeywordResearchQueryKey(saved.organizationId, phrase),
      });
    }
  }, [run.status, queryClient, saved.organizationId, phrase]);

  const startResearch = async () => {
    const replacingCurrent = Boolean(saved.data);
    if (replacingCurrent) {
      const approved = await confirm({
        title: `Run the full research pipeline again for “${phrase}”?`,
        description:
          "This deliberately starts a fresh research run, refreshes provider metrics, and makes the new results the current dossier. Existing saved reports remain available in report history.",
        confirmLabel: "Run full pipeline again",
        variant: "destructive",
      });
      if (!approved) return;
    }
    onResearchStart?.(phrase);
    await research.runResearch(phrase, {
      forceRefresh: replacingCurrent,
    });
  };

  return (
    <div className="grid gap-3">
      <div
        className={
          saved.data || running
            ? "flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            : "bg-glass flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border border-glass-edge p-6 text-center shadow-glass"
        }
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={
              saved.data || running
                ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                : "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            }
          >
            <FlaskConical
              className={saved.data || running ? "h-4 w-4" : "h-6 w-6"}
            />
          </span>
          <div className={saved.data || running ? "min-w-0" : "max-w-xl"}>
            <p
              className={
                saved.data || running
                  ? "text-xs font-medium text-foreground"
                  : "text-[clamp(1rem,0.94rem+0.3vw,1.2rem)] font-semibold text-foreground"
              }
            >
              {running
                ? "Research pipeline in progress"
                : saved.data
                  ? "Full keyword research"
                  : `Build the complete dossier for “${phrase}”`}
            </p>
            <p
              className={
                saved.data || running
                  ? "text-[11px] text-muted-foreground"
                  : "mt-1 text-sm leading-5 text-muted-foreground"
              }
            >
              Discover parent, child, semantic, and related keywords; collect
              their real market facts; then classify intent and funnel fit.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className={saved.data || running ? "h-8 shrink-0" : "h-10 px-5"}
          disabled={running || saved.isLoading || !phrase.trim()}
          title={
            saved.data
              ? "Saved results are shown below. Run again only when you need refreshed research."
              : undefined
          }
          onClick={() => void startResearch()}
        >
          {running || saved.isLoading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : saved.data ? (
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          {running
            ? "Running"
            : saved.isLoading
              ? "Loading saved"
              : saved.data
                ? "Run full pipeline again"
                : "Start full research"}
        </Button>
      </div>

      <PipelineSteps
        stage={run.stage ?? null}
        running={running}
        done={run.status === "done" || Boolean(saved.data)}
      />

      {saved.data && run.status === "idle" ? (
        <p className="text-[11px] text-muted-foreground">
          Showing saved research from{" "}
          {new Date(saved.data.createdAt).toLocaleString()}.
        </p>
      ) : null}

      {run.status !== "idle" ? (
        <div className="rounded-lg border border-border p-3">
          <p className="text-[11px] text-muted-foreground">
            {run.status === "error" ? (
              <span className="text-destructive">{run.error}</span>
            ) : (
              (run.stage ?? "Working…")
            )}
          </p>
        </div>
      ) : null}

      {pageId && selectedPhrases.size > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <span className="text-xs text-foreground">
            {selectedPhrases.size} selected
          </span>
          <Button
            size="sm"
            className="h-8"
            disabled={addSelected.isPending}
            onClick={() => addSelected.mutate()}
          >
            {addSelected.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Add as supporting
          </Button>
        </div>
      ) : null}

      {/* Live (and just-finished) runs — remount-proof, from the run set. */}
      {hasLiveOutput ? (
        <RunSetDisplay setKey={runSetKey} variant="bare" dismissible={false} />
      ) : null}

      {/* The durable artifact — always reachable once the run settles, so a
          thin stream (a classification-only pass) never hides the full
          research feed. */}
      {!running && visibleArtifact ? (
        <SavedResearchFeed
          artifact={visibleArtifact}
          sections={["clusters"]}
          onKeywordNavigate={onKeywordNavigate}
          // Only the SAVED artifact is an addressable, shareable record; a
          // just-completed run's in-memory result is not (until the saved
          // query refetches it).
          instanceId={
            visibleArtifact === saved.data?.artifact ? saved.data.id : null
          }
        />
      ) : null}

      {run.status === "done" ? (
        <p className="text-[11px] text-muted-foreground">
          Research is saved to the keyword library and remains available here.
          Select any additional phrases above to attach them to this page.
        </p>
      ) : null}
    </div>
  );
}

export interface KeywordResearchPanelState {
  status: "idle" | "running" | "done" | "error";
  stage: string | null;
  error: string | null;
  hasSavedResearch: boolean;
  savedAt: string | null;
}

const PIPELINE_STEPS = [
  "Discover relationships",
  "Save keyword set",
  "Collect market facts",
  "Classify intent",
] as const;

function pipelineStepIndex(stage: string | null): number {
  const normalized = stage ? stage.toLowerCase() : "";
  if (normalized.includes("classif")) return 3;
  if (
    normalized.includes("volume") ||
    normalized.includes("provider") ||
    normalized.includes("market")
  ) {
    return 2;
  }
  if (
    normalized.includes("persist") ||
    normalized.includes("relationship") ||
    normalized.includes("artifact")
  ) {
    return 1;
  }
  return 0;
}

function PipelineSteps({
  stage,
  running,
  done,
}: {
  stage: string | null;
  running: boolean;
  done: boolean;
}) {
  const activeIndex = done ? PIPELINE_STEPS.length : pipelineStepIndex(stage);
  return (
    <ol className="grid gap-1.5 sm:grid-cols-4" aria-label="Research pipeline">
      {PIPELINE_STEPS.map((label, index) => {
        const complete = done || index < activeIndex;
        const active = running && index === activeIndex;
        return (
          <li
            key={label}
            className="flex min-w-0 items-center gap-2 rounded-md border border-border px-2.5 py-2"
          >
            {complete ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : active ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
            )}
            <span className="truncate text-[10px] text-muted-foreground">
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
