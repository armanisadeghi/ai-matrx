"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BacklinkObservationRow } from "@/features/marketing/data/backlinks-types";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  enrichSiteBacklinks,
  SeoApiError,
} from "@/features/marketing/seo/dataforseo/client";
import type { SeoStreamEvent } from "@/features/marketing/seo/dataforseo/types";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectApiServiceTargets } from "@/lib/redux/slices/apiConfigSlice";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import {
  applyBacklinkEnrichmentEvent,
  failBacklinkEnrichmentRun,
  startBacklinkEnrichmentRun,
  type BacklinkEnrichmentRunState,
} from "./lib/enrichment-run";

/**
 * The owner is told plainly that reviewing is unavailable — but a missing SEO
 * target is a MISCONFIGURATION, not a passing hiccup, and the friendly
 * sentence would otherwise bury it forever. It screams into the Error
 * Inspector so the defect is findable while the user is spared the plumbing.
 */
function reportMissingSeoTarget(callSite: string): void {
  toast.error(
    "Reviewing pages is unavailable right now. Please try again shortly.",
  );
  captureError({
    source: "runtime-exception",
    message:
      "Backlink page review blocked: no AI Dream server target is configured for the selected environment (selectApiServiceTargets returned no seo target).",
    userMessage: "Reviewing pages is unavailable right now.",
    callSite,
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof SeoApiError) {
    return typeof error.detail === "string"
      ? error.detail
      : JSON.stringify(error.detail);
  }
  return error instanceof Error ? error.message : String(error);
}

interface ApplyEventOptions {
  /** One exact row owns every event in a single-record request. */
  targetedBacklinkId?: string | null;
  /** The stream announces this once; later per-link events inherit it. */
  commandRunId?: string | null;
}

/**
 * The one client controller for costly backlink analysis.
 *
 * Every backlink surface uses this controller so auth, force semantics,
 * duplicate-click protection, per-record streaming, persisted-row refresh,
 * and terminal messaging cannot drift between the main table and page cards.
 */
export function useBacklinkAnalysis({
  siteId,
  organizationId,
  onRefresh,
}: {
  siteId: string;
  organizationId: string;
  /** Optional surface-specific read outside the canonical backlink key tree. */
  onRefresh?: () => void | Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const serviceTargets = useAppSelector(selectApiServiceTargets);
  const seoTarget = serviceTargets.find(
    (target) => target.service === "aidream",
  );
  const seoTargetUrl = seoTarget?.url;
  const [analysisRuns, setAnalysisRuns] = useState<
    Record<string, BacklinkEnrichmentRunState>
  >({});
  /**
   * Aggregate state for a "Analyze next N" batch. Per-row runs live in
   * `analysisRuns`; without this the whole batch was invisible outside an
   * open record — a long run showed only a spinning button. The reducer is
   * aggregate-capable (candidate count, settled ids, terminal result), so one
   * run object fed every batch event IS the batch's true progress.
   */
  const [batchRun, setBatchRun] = useState<BacklinkEnrichmentRunState | null>(
    null,
  );
  const runningIds = useRef(new Set<string>());
  const batchRunningRef = useRef(false);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const refreshBacklinkReads = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: [...marketingKeys.site(siteId), "backlinks"],
    });
    await onRefreshRef.current?.();
  }, [queryClient, siteId]);

  const beginAnalysisRuns = useCallback(
    (
      backlinkIds: string[],
      labelFor: (backlinkId: string, index: number) => string,
    ) => {
      setAnalysisRuns((current) => {
        const next = { ...current };
        backlinkIds.forEach((backlinkId, index) => {
          next[backlinkId] = startBacklinkEnrichmentRun(
            labelFor(backlinkId, index),
          );
        });
        return next;
      });
    },
    [],
  );

  const applyAnalysisEvent = useCallback(
    (event: SeoStreamEvent, options: ApplyEventOptions = {}) => {
      const backlinkIds = options.targetedBacklinkId
        ? [options.targetedBacklinkId]
        : event.backlink_id
          ? [event.backlink_id]
          : (event.backlink_ids ?? []);
      if (backlinkIds.length > 0) {
        setAnalysisRuns((current) => {
          const next = { ...current };
          backlinkIds.forEach((backlinkId, index) => {
            const sourceUrl =
              event.source_url ?? event.source_urls?.[index] ?? null;
            const initialRun =
              next[backlinkId] ??
              startBacklinkEnrichmentRun(
                sourceUrl ? `Reading ${sourceUrl}` : "Reading the linking page",
              );
            const initial =
              options.commandRunId && !initialRun.runId
                ? { ...initialRun, runId: options.commandRunId }
                : initialRun;
            next[backlinkId] = applyBacklinkEnrichmentEvent(initial, event);
          });
          return next;
        });
      }
      if (
        event.kind === "seo.backlink_enriched" ||
        event.kind === "seo.backlink_enrichment_failed" ||
        event.kind === "seo.backlink_enrichment_completed"
      ) {
        void refreshBacklinkReads();
      }
    },
    [refreshBacklinkReads],
  );

  const failAnalysisRun = useCallback((backlinkId: string, message: string) => {
    setAnalysisRuns((current) => {
      const run = current[backlinkId];
      return run
        ? {
            ...current,
            [backlinkId]: failBacklinkEnrichmentRun(run, message),
          }
        : current;
    });
  }, []);

  const dismissAnalysisRun = useCallback((backlinkId: string) => {
    setAnalysisRuns((current) => {
      const remaining = { ...current };
      delete remaining[backlinkId];
      return remaining;
    });
  }, []);

  const analyzeBacklink = useCallback(
    async (row: BacklinkObservationRow) => {
      if (runningIds.current.has(row.id)) return;
      if (!seoTargetUrl) {
        reportMissingSeoTarget("useBacklinkAnalysis.analyzeRow");
        return;
      }
      runningIds.current.add(row.id);
      beginAnalysisRuns(
        [row.id],
        () => `Reading ${row.source_domain ?? row.source_url}`,
      );

      let commandRunId: string | null = null;
      const onEvent = (event: SeoStreamEvent) => {
        if (event.kind === "seo.command_run" && event.run_id) {
          commandRunId = event.run_id;
        }
        applyAnalysisEvent(event, {
          targetedBacklinkId: row.id,
          commandRunId,
        });
      };

      try {
        const session = await supabase.auth.getSession();
        if (session.error) throw session.error;
        const token = session.data.session?.access_token;
        if (!token) {
          throw new Error("Please sign in again before reviewing pages.");
        }
        const result = await enrichSiteBacklinks(
          seoTargetUrl,
          token,
          siteId,
          {
            organization_id: organizationId,
            limit: 1,
            force: true,
            backlink_ids: [row.id],
          },
          onEvent,
        );
        await refreshBacklinkReads();
        if (result.failed > 0) {
          toast.warning("We could not finish reviewing that page.");
        } else {
          toast.success("Done — that page has been reviewed.");
        }
      } catch (error) {
        const message = errorMessage(error);
        failAnalysisRun(row.id, message);
        toast.error(message);
      } finally {
        runningIds.current.delete(row.id);
      }
    },
    [
      applyAnalysisEvent,
      beginAnalysisRuns,
      failAnalysisRun,
      organizationId,
      refreshBacklinkReads,
      seoTargetUrl,
      siteId,
    ],
  );

  const analyzeNext = useCallback(
    async (limit: number) => {
      if (batchRunningRef.current) return;
      if (!seoTargetUrl) {
        reportMissingSeoTarget("useBacklinkAnalysis.analyzeBatch");
        return;
      }
      batchRunningRef.current = true;
      setBatchAnalyzing(true);
      setBatchRun(
        startBacklinkEnrichmentRun(
          `Reading the next ${limit} linking page${limit === 1 ? "" : "s"}`,
          "batch",
        ),
      );
      let commandRunId: string | null = null;
      const onEvent = (event: SeoStreamEvent) => {
        if (event.kind === "seo.command_run" && event.run_id) {
          commandRunId = event.run_id;
        }
        applyAnalysisEvent(event, { commandRunId });
        setBatchRun((current) =>
          current ? applyBacklinkEnrichmentEvent(current, event) : current,
        );
      };

      try {
        const session = await supabase.auth.getSession();
        if (session.error) throw session.error;
        const token = session.data.session?.access_token;
        if (!token) throw new Error("Sign in before analyzing backlink data.");
        const result = await enrichSiteBacklinks(
          seoTargetUrl,
          token,
          siteId,
          {
            organization_id: organizationId,
            limit,
            // Batches are due-only. Exact record actions above deliberately
            // use force=true so Re-analyze means what it says.
            force: false,
          },
          onEvent,
        );
        await refreshBacklinkReads();
        if (result.failed > 0) {
          toast.warning(
            `Reviewed ${result.completed} page${result.completed === 1 ? "" : "s"}; ${result.failed} could not be finished.`,
          );
        } else {
          toast.success(
            result.completed > 0
              ? `Reviewed ${result.completed} page${result.completed === 1 ? "" : "s"}.`
              : "Nothing new to review right now.",
          );
        }
      } catch (error) {
        const message = errorMessage(error);
        setBatchRun((current) =>
          current ? failBacklinkEnrichmentRun(current, message) : current,
        );
        toast.error(message);
      } finally {
        batchRunningRef.current = false;
        setBatchAnalyzing(false);
      }
    },
    [
      applyAnalysisEvent,
      organizationId,
      refreshBacklinkReads,
      seoTargetUrl,
      siteId,
    ],
  );

  return {
    seoTarget,
    analysisDisabled: !seoTargetUrl,
    analysisRuns,
    batchAnalyzing,
    batchRun,
    dismissBatchRun: () => setBatchRun(null),
    analyzeBacklink,
    analyzeNext,
    beginAnalysisRuns,
    applyAnalysisEvent,
    failAnalysisRun,
    dismissAnalysisRun,
    refreshBacklinkReads,
  };
}

export { errorMessage as backlinkAnalysisErrorMessage };
