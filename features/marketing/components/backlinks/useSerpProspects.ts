"use client";

/**
 * The ONE controller for the site's SERP prospect list — the second
 * prospecting method ("who already ranks for the searches my topics live
 * in?"), the sibling of `useLinkGapProspects` and deliberately shaped like
 * it so the workspace can put the same values into surface scope without a
 * second fetch.
 *
 * It owns six things so the tab component can stay a renderer:
 *
 *   1. the SETUP the user is authoring — seed keywords and query variants
 *      (changing either invalidates the preview: a preview is a promise
 *      about ONE exact request);
 *   2. the NO-SPEND preview (`/serp-prospecting/preview`) — every query the
 *      run would send, per variant, with the estimated cost;
 *   3. the paid streamed run, with real stages and a client abort (the
 *      server run is durable; only our read of it stops);
 *   4. the paged read of `seo.serp_opportunity` straight from Supabase;
 *   5. the human's ruling (approve / reject / snooze, one row or many) and
 *      the CRM fold of approved rows;
 *   6. the OPTIONAL search-volume check — the canonical volume-refresh
 *      command plus a direct read of `seo.keyword` market rows, so keyword
 *      chips can carry real monthly volume before anything is spent.
 *
 * Input errors (HTTP 400) are kept as INLINE state, never toast-only: the
 * user is mid-form, and the message belongs beside the field that caused it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  listSerpOpportunities,
  listSerpPartyLinks,
  setSerpReviewStatus,
  type SerpOpportunityRow,
} from "@/features/marketing/data/serp-prospects";
import {
  collectSerpProspects,
  foldSerpProspectsToCrm,
  previewSerpProspecting,
  SeoApiError,
} from "@/features/marketing/seo/dataforseo/client";
import type {
  LinkGapFoldReport,
  SeoStreamEvent,
  SerpProspectingPreview,
  SerpProspectingReceipt,
} from "@/features/marketing/seo/dataforseo/types";
import {
  SERP_PROSPECTING_MAX_KEYWORDS,
  SERP_PROSPECTING_STAGES,
  type SerpQueryVariant,
} from "@/features/marketing/components/backlinks/lib/serp-prospecting";
import { backlinkAnalysisErrorMessage } from "@/features/marketing/components/backlinks/useBacklinkAnalysis";
import { useKeywordVolumeRefresh } from "@/features/marketing/seo/keyword/hooks";
import {
  normalizeKeywordPhrase,
  pickKeywordMarket,
} from "@/features/marketing/seo/keyword/data";
import { listKeywordsWithMarketByPhrases } from "@/features/marketing/seo/keyword-research/data/queries";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectApiServiceTargets } from "@/lib/redux/slices/apiConfigSlice";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";

export interface SerpProspectingRunState {
  status: "idle" | "running" | "done" | "error";
  stage?: string;
  runId?: string;
  receipt?: SerpProspectingReceipt;
  error?: string;
  /** HTTP 400 — the server's sentence about the INPUT, rendered at the form. */
  inputError?: string;
}

export interface SerpKeywordVolume {
  /** Monthly US search volume, or null when the library has no market row. */
  volume: number | null;
  /** True once the phrase has been looked up (a null then means "unknown"). */
  checked: boolean;
}

export interface SerpProspects {
  siteId: string;
  /** Table state (URL-owned) for the triage table. */
  table: ReturnType<typeof useMarketingTableState>;
  rows: SerpOpportunityRow[];
  total: number;
  statusCounts: Record<string, number>;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  /** `{serp_opportunity_id: party_id}` for rows already folded into the CRM. */
  partyByOpportunityId: Record<string, string>;
  /** The seed keywords the user has authored (deduped, capped server-side). */
  keywords: string[];
  setKeywords: (keywords: string[]) => void;
  variants: SerpQueryVariant[];
  toggleVariant: (variant: SerpQueryVariant) => void;
  /** The no-spend preview of exactly what the run would search and cost. */
  preview: SerpProspectingPreview | null;
  previewLoading: boolean;
  /** Inline message (input problems included) — rendered at the form. */
  previewError: string | null;
  loadPreview: () => Promise<void>;
  run: SerpProspectingRunState;
  runDisabled: boolean;
  startRun: () => Promise<void>;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  review: (ids: string[], status: string) => Promise<void>;
  reviewing: boolean;
  /** Fold approved rows into `crm.party` — same contract as the link gap. */
  foldApproved: () => Promise<void>;
  folding: boolean;
  foldReport: LinkGapFoldReport | null;
  /** normalized phrase → its checked monthly volume annotation. */
  volumes: Record<string, SerpKeywordVolume>;
  volumesLoading: boolean;
  volumesError: string | null;
  checkVolumes: () => Promise<void>;
}

export function useSerpProspects(input: {
  siteId: string;
  siteDomain: string;
  organizationId: string;
  enabled: boolean;
}): SerpProspects {
  const { siteId, siteDomain, organizationId, enabled } = input;
  const queryClient = useQueryClient();
  const serviceTargets = useAppSelector(selectApiServiceTargets);
  const serverUrl = serviceTargets.find(
    (target) => target.service === "aidream",
  )?.url;

  const table = useMarketingTableState({
    // THE UNMEASURED RULE: highest Matrx Authority Score first, with
    // unmeasured rows LAST — the query never lets a null sort as a zero.
    defaultSort: { id: "priority_score", direction: "desc" },
    defaultPageSize: 50,
  });

  const opportunities = useQuery({
    queryKey: [
      ...marketingKeys.site(siteId),
      "backlinks",
      "serp-opportunities",
      table.queryState,
    ] as const,
    queryFn: ({ signal }) =>
      listSerpOpportunities(siteId, table.queryState, signal),
    enabled: Boolean(siteId) && enabled,
    placeholderData: keepPreviousData,
  });

  const rows = opportunities.data?.rows ?? [];
  const rowIdsKey = rows.map((row) => row.id).join(",");
  const parties = useQuery({
    queryKey: [
      ...marketingKeys.site(siteId),
      "backlinks",
      "serp-parties",
      rowIdsKey,
    ] as const,
    queryFn: ({ signal }) =>
      listSerpPartyLinks(rowIdsKey ? rowIdsKey.split(",") : [], signal),
    enabled: Boolean(rowIdsKey) && enabled,
    placeholderData: keepPreviousData,
  });

  const [keywords, setKeywordsState] = useState<string[]>([]);
  const [variants, setVariants] = useState<SerpQueryVariant[]>(["keyword"]);
  const [preview, setPreview] = useState<SerpProspectingPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [run, setRun] = useState<SerpProspectingRunState>({ status: "idle" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [folding, setFolding] = useState(false);
  const [foldReport, setFoldReport] = useState<LinkGapFoldReport | null>(null);
  const [volumes, setVolumes] = useState<Record<string, SerpKeywordVolume>>(
    {},
  );
  const [volumesLoading, setVolumesLoading] = useState(false);
  const [volumesError, setVolumesError] = useState<string | null>(null);
  const volumeRefresh = useKeywordVolumeRefresh(organizationId);
  const streamAbortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  useEffect(
    () => () => {
      // The server run is durable; stop only OUR read of it so an abandoned
      // stream never keeps draining after the tab is gone.
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
    },
    [],
  );

  const accessToken = useCallback(async () => {
    const session = await supabase.auth.getSession();
    if (session.error) throw session.error;
    const token = session.data.session?.access_token;
    if (!token) throw new Error("Sign in again before running this.");
    return token;
  }, []);

  /** A preview is a promise about ONE exact request — editing voids it. */
  const setKeywords = useCallback((next: string[]) => {
    setKeywordsState(next);
    setPreview(null);
    setPreviewError(null);
  }, []);

  const toggleVariant = useCallback((variant: SerpQueryVariant) => {
    setVariants((current) =>
      current.includes(variant)
        ? current.filter((value) => value !== variant)
        : [...current, variant],
    );
    setPreview(null);
    setPreviewError(null);
  }, []);

  const loadPreview = useCallback(async () => {
    if (!serverUrl) {
      setPreviewError(
        "The AI Dream server is not configured for this environment, so we cannot preview the searches.",
      );
      return;
    }
    if (!keywords.length) {
      setPreviewError("Enter at least one keyword to preview the searches.");
      return;
    }
    if (!variants.length) {
      setPreviewError("Pick at least one search type to preview.");
      return;
    }
    if (keywords.length > SERP_PROSPECTING_MAX_KEYWORDS) {
      setPreviewError(
        `Use at most ${SERP_PROSPECTING_MAX_KEYWORDS} keywords per run — trim the list, or split it into two runs.`,
      );
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const token = await accessToken();
      setPreview(
        await previewSerpProspecting(serverUrl, token, siteId, {
          keywords,
          variants,
        }),
      );
    } catch (error) {
      // 400 is the server's own sentence about the input — inline, verbatim.
      setPreviewError(
        error instanceof SeoApiError &&
          error.status === 400 &&
          typeof error.detail === "string"
          ? error.detail
          : backlinkAnalysisErrorMessage(error),
      );
    } finally {
      setPreviewLoading(false);
    }
  }, [accessToken, keywords, serverUrl, siteId, variants]);

  const startRun = useCallback(async () => {
    if (runningRef.current) return;
    if (!serverUrl) {
      toast.error(
        "Finding prospects is unavailable right now. Please try again shortly.",
      );
      return;
    }
    if (!keywords.length || !variants.length) {
      setRun({
        status: "idle",
        inputError: !keywords.length
          ? "Enter at least one keyword before running the search."
          : "Pick at least one search type before running the search.",
      });
      return;
    }
    runningRef.current = true;
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setRun({ status: "running", stage: "Starting the search" });
    try {
      const token = await accessToken();
      const receipt = await collectSerpProspects(
        serverUrl,
        token,
        siteId,
        {
          keywords,
          variants,
          request_id: crypto.randomUUID(),
        },
        (event: SeoStreamEvent) => {
          setRun((current) => ({
            ...current,
            runId:
              event.kind === "seo.command_run" && event.run_id
                ? event.run_id
                : current.runId,
            // An unknown event never blanks the stage — it just isn't news.
            stage: SERP_PROSPECTING_STAGES[event.kind] ?? current.stage,
          }));
        },
        controller.signal,
      );
      setRun({ status: "done", stage: "Prospect list ready", receipt });
      await queryClient.invalidateQueries({
        queryKey: [...marketingKeys.site(siteId), "backlinks"],
      });
      toast.success(
        `Found the sites already ranking for your searches around ${siteDomain}.`,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      // 400 is the server refusing the INPUT before spending — the message
      // belongs beside the form, never in a toast that vanishes.
      if (error instanceof SeoApiError && error.status === 400) {
        setRun({
          status: "idle",
          inputError:
            typeof error.detail === "string"
              ? error.detail
              : "The server could not use these keywords. Adjust them and preview again.",
        });
        return;
      }
      const message = backlinkAnalysisErrorMessage(error);
      setRun({ status: "error", error: message });
      toast.error(message);
    } finally {
      runningRef.current = false;
    }
  }, [accessToken, keywords, queryClient, serverUrl, siteDomain, siteId, variants]);

  const review = useCallback(
    async (ids: string[], status: string) => {
      if (!ids.length) return;
      setReviewing(true);
      try {
        const updated = await setSerpReviewStatus(ids, status);
        await queryClient.invalidateQueries({
          queryKey: [...marketingKeys.site(siteId), "backlinks"],
        });
        setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
        toast.success(
          status === "approved"
            ? `${updated} approved — they can become CRM records now.`
            : `${updated} moved to ${status}.`,
        );
      } catch (error) {
        toast.error(backlinkAnalysisErrorMessage(error));
      } finally {
        setReviewing(false);
      }
    },
    [queryClient, siteId],
  );

  /**
   * THE OUTREACH DOOR. Approved SERP prospects become `crm.party`
   * organizations through the server's canonical fold — the same contract as
   * the link gap, so the two methods can never write two different kinds of
   * record. Enrollment then reuses the CRM's own dialog.
   */
  const foldApproved = useCallback(async () => {
    if (!serverUrl) {
      toast.error("Creating CRM records is unavailable right now.");
      return;
    }
    setFolding(true);
    try {
      const token = await accessToken();
      const report = await foldSerpProspectsToCrm(serverUrl, token, siteId, {
        limit: 250,
      });
      await queryClient.invalidateQueries({
        queryKey: [...marketingKeys.site(siteId), "backlinks"],
      });
      setFoldReport(report);
      toast.success(
        `${report.created} new contact record${report.created === 1 ? "" : "s"}, ` +
          `${report.matched} matched to one you already had.`,
      );
    } catch (error) {
      toast.error(backlinkAnalysisErrorMessage(error));
    } finally {
      setFolding(false);
    }
  }, [accessToken, queryClient, serverUrl, siteId]);

  /**
   * Search-volume annotation, in two canonical steps: the volume-refresh
   * command (which also upserts unknown phrases into the universal keyword
   * library), then a direct read of the market rows. A phrase with no market
   * row after the refresh reads "unknown", never zero.
   */
  const checkVolumes = useCallback(async () => {
    if (!keywords.length) return;
    setVolumesLoading(true);
    setVolumesError(null);
    try {
      const refreshed = await volumeRefresh.run(keywords);
      if (refreshed === false) {
        setVolumesError(
          volumeRefresh.state.error ??
            "The search-volume check did not finish. Try again.",
        );
      }
      const library = await listKeywordsWithMarketByPhrases(keywords);
      const byPhrase: Record<string, SerpKeywordVolume> = {};
      for (const keyword of keywords) {
        const normalized = normalizeKeywordPhrase(keyword);
        const row = library.find(
          (entry) => entry.normalized_phrase === normalized,
        );
        byPhrase[normalized] = {
          volume: row
            ? (pickKeywordMarket(row.keyword_market)?.search_volume ?? null)
            : null,
          checked: true,
        };
      }
      setVolumes(byPhrase);
    } catch (error) {
      setVolumesError(backlinkAnalysisErrorMessage(error));
    } finally {
      setVolumesLoading(false);
    }
  }, [keywords, volumeRefresh]);

  return {
    siteId,
    table,
    rows,
    total: opportunities.data?.total ?? 0,
    statusCounts: opportunities.data?.statusCounts ?? {},
    isLoading: opportunities.isLoading,
    isFetching: opportunities.isFetching,
    isError: opportunities.isError,
    error: opportunities.error,
    refetch: () => void opportunities.refetch(),
    partyByOpportunityId: parties.data ?? {},
    keywords,
    setKeywords,
    variants,
    toggleVariant,
    preview,
    previewLoading,
    previewError,
    loadPreview,
    run,
    runDisabled: !serverUrl,
    startRun,
    selectedIds,
    setSelectedIds,
    review,
    reviewing,
    foldApproved,
    folding,
    foldReport,
    volumes,
    volumesLoading,
    volumesError,
    checkVolumes,
  };
}
