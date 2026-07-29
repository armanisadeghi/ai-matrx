"use client";

/**
 * Keyword Intelligence — Research tab.
 *
 * Runs the full canonical keyword-research pipeline for the panel's phrase
 * (LSI agent → relationship ingestion → provider volume → classification) by
 * REUSING `useKeywordResearch` from the keyword-research feature — the same
 * durable-run, auto-rejoin behavior the workbench uses.
 *
 * Live output renders through the ONE canonical pipeline (`MarkdownStream`
 * over the adopted requestId), exactly as chat does. Keyword SELECTION is not
 * threaded into the blocks as props — it travels the two surface seams:
 * this tab PUBLISHES `keyword_selection` UI state and REGISTERS the
 * `keyword_selection` write handler its manifest declares, and the blocks
 * read/write those by name. See KeywordResearchBlock's header for the
 * contract, and `features/surfaces/runtime/surface-writeback.ts`.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, Plus, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { seoKeywordKeys } from "./hooks";
import { useKeywordResearch } from "@/features/marketing/seo/keyword-research/useKeywordResearch";
import {
  savedKeywordResearchQueryKey,
  useSavedKeywordResearch,
} from "@/features/marketing/seo/keyword-research/useSavedKeywordResearch";
import SavedResearchFeed from "@/features/marketing/seo/keyword-research/components/SavedResearchFeed";
import MarkdownStream from "@/components/MarkdownStream";
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
}: {
  phrase: string;
  organizationId?: string | null;
  pageId?: string | null;
}) {
  const research = useKeywordResearch(organizationId);
  const { run } = research;
  const running = run.status === "running";
  const queryClient = useQueryClient();
  const [selectedByKey, setSelectedByKey] = useState<Record<string, string>>({});
  const selectedPhrases = new Set(Object.keys(selectedByKey));
  const disabledPhrases = new Set([normalizeKeywordPhrase(phrase)]);
  const saved = useSavedKeywordResearch(phrase, organizationId);
  const visibleArtifact = run.result?.artifact ?? saved.data?.artifact ?? null;
  const hasLiveOutput = Boolean(run.requestId && run.hasStreamedContent);

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

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FlaskConical className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
              Full keyword research
            </p>
            <p className="text-[11px] text-muted-foreground">
              Discovers related keywords and relationships, fetches provider
              volume, and classifies intent — persisted to the keyword library.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="h-8 shrink-0"
          disabled={running || saved.isLoading || !phrase.trim()}
          title={
            saved.data
              ? "Saved results are shown below. Run again only when you need refreshed research."
              : undefined
          }
          onClick={() => void research.runResearch(phrase)}
        >
          {running || saved.isLoading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          {running
            ? "Running"
            : saved.isLoading
              ? "Loading saved"
              : saved.data
                ? "Run again"
                : "Run research"}
        </Button>
      </div>

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

      {hasLiveOutput ? (
        <MarkdownStream
          requestId={run.requestId}
          isStreamActive={running}
          hideCopyButton
        />
      ) : visibleArtifact ? (
        <SavedResearchFeed artifact={visibleArtifact} />
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
