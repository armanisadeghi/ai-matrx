"use client";

/**
 * The ONE controller for the site's prospect list — the site-wide competitor
 * link gap ("who links to my competitors and not to me?").
 *
 * It owns four things so the tab component can stay a renderer, and so the
 * workspace can put the same values into surface scope without a second fetch:
 *
 *   1. the NO-SPEND seed preview (`/link-gap/seed`) — who WOULD be compared,
 *      and the confirmed competitors deliberately left out, with the reason;
 *   2. the paid streamed run, with real stages and a client abort (the server
 *      run is durable; only our read of it stops);
 *   3. the paged read of `seo.link_gap_domain` straight from Supabase;
 *   4. the human's ruling (approve / reject / snooze, one row or many).
 *
 * Modelled on `useReputationAnalysis` for the abort/teardown shape and on
 * `useBacklinkAnalysis` for the seo-target + auth resolution, so a long run
 * behaves the same way everywhere in this workspace.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  listLinkGapDomains,
  listLinkGapPartyLinks,
  setLinkGapReviewStatus,
  type LinkGapDomainRow,
} from "@/features/marketing/data/page-links";
import {
  collectSiteLinkGap,
  foldLinkGapDomainsToCrm,
  previewSiteLinkGapSeed,
  SeoApiError,
} from "@/features/marketing/seo/dataforseo/client";
import type {
  DomainLinkGapReceipt,
  LinkGapFoldReport,
  SeoStreamEvent,
  SiteLinkGapSeedResponse,
} from "@/features/marketing/seo/dataforseo/types";
import { SITE_LINK_GAP_STAGES } from "@/features/marketing/components/backlinks/lib/link-gap";
import { backlinkAnalysisErrorMessage } from "@/features/marketing/components/backlinks/useBacklinkAnalysis";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectApiServiceTargets } from "@/lib/redux/slices/apiConfigSlice";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";

export interface LinkGapRunState {
  status: "idle" | "running" | "done" | "error";
  stage?: string;
  runId?: string;
  receipt?: DomainLinkGapReceipt;
  error?: string;
  /**
   * The server's own sentence when it refuses (HTTP 409): the site has no
   * confirmed, link-gap-eligible competitor. It is guidance written for the
   * user, so it is kept apart from `error` and rendered as a next step.
   */
  blockedReason?: string;
}

export interface LinkGapProspects {
  siteId: string;
  /** Table state (URL-owned) for the prospect table. */
  table: ReturnType<typeof useMarketingTableState>;
  rows: LinkGapDomainRow[];
  total: number;
  statusCounts: Record<string, number>;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  /** `{link_gap_domain_id: party_id}` for rows already folded into the CRM. */
  partyByDomainId: Record<string, string>;
  seed: SiteLinkGapSeedResponse | null;
  seedLoading: boolean;
  seedError: string | null;
  reloadSeed: () => void;
  run: LinkGapRunState;
  runDisabled: boolean;
  startRun: () => Promise<void>;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  review: (ids: string[], status: string) => Promise<void>;
  reviewing: boolean;
  /** Fold approved rows into `crm.party` (the outreach door, contract IC-1). */
  foldApproved: () => Promise<void>;
  folding: boolean;
  /** What the last fold in this visit did — created, matched, and skipped. */
  foldReport: LinkGapFoldReport | null;
}

export function useLinkGapProspects(input: {
  siteId: string;
  siteDomain: string;
  enabled: boolean;
}): LinkGapProspects {
  const { siteId, siteDomain, enabled } = input;
  const queryClient = useQueryClient();
  const serviceTargets = useAppSelector(selectApiServiceTargets);
  const serverUrl = serviceTargets.find(
    (target) => target.service === "aidream",
  )?.url;

  const table = useMarketingTableState({
    // THE UNMEASURED RULE: highest Matrx Authority Score first, with unmeasured
    // rows LAST — the query never lets a null sort as a zero.
    defaultSort: { id: "priority_score", direction: "desc" },
    defaultPageSize: 50,
  });

  const domains = useQuery({
    queryKey: [
      ...marketingKeys.site(siteId),
      "backlinks",
      "link-gap-domains",
      table.queryState,
    ] as const,
    queryFn: ({ signal }) =>
      listLinkGapDomains(siteId, table.queryState, signal),
    enabled: Boolean(siteId) && enabled,
    placeholderData: keepPreviousData,
  });

  const rows = domains.data?.rows ?? [];
  const rowIdsKey = rows.map((row) => row.id).join(",");
  const parties = useQuery({
    queryKey: [
      ...marketingKeys.site(siteId),
      "backlinks",
      "link-gap-parties",
      rowIdsKey,
    ] as const,
    queryFn: ({ signal }) =>
      listLinkGapPartyLinks(
        rowIdsKey ? rowIdsKey.split(",") : [],
        signal,
      ),
    enabled: Boolean(rowIdsKey) && enabled,
    placeholderData: keepPreviousData,
  });

  const [seed, setSeed] = useState<SiteLinkGapSeedResponse | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [run, setRun] = useState<LinkGapRunState>({ status: "idle" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [folding, setFolding] = useState(false);
  const [foldReport, setFoldReport] = useState<LinkGapFoldReport | null>(null);
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

  const loadSeed = useCallback(async () => {
    if (!serverUrl) {
      setSeedError(
        "The AI Dream server is not configured for this environment, so we cannot check which competitors would be compared.",
      );
      return;
    }
    setSeedLoading(true);
    setSeedError(null);
    try {
      const token = await accessToken();
      setSeed(await previewSiteLinkGapSeed(serverUrl, token, siteId, {}));
    } catch (error) {
      setSeedError(backlinkAnalysisErrorMessage(error));
    } finally {
      setSeedLoading(false);
    }
  }, [accessToken, serverUrl, siteId]);

  useEffect(() => {
    if (!enabled || !siteId) return;
    void loadSeed();
  }, [enabled, loadSeed, siteId]);

  const startRun = useCallback(async () => {
    if (runningRef.current) return;
    if (!serverUrl) {
      toast.error(
        "Finding prospects is unavailable right now. Please try again shortly.",
      );
      return;
    }
    runningRef.current = true;
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setRun({ status: "running", stage: "Starting the comparison" });
    try {
      const token = await accessToken();
      const receipt = await collectSiteLinkGap(
        serverUrl,
        token,
        siteId,
        { request_id: crypto.randomUUID() },
        (event: SeoStreamEvent) => {
          setRun((current) => ({
            ...current,
            runId:
              event.kind === "seo.command_run" && event.run_id
                ? event.run_id
                : current.runId,
            // An unknown event never blanks the stage — it just isn't news.
            stage: SITE_LINK_GAP_STAGES[event.kind] ?? current.stage,
          }));
        },
        controller.signal,
      );
      setRun({ status: "done", stage: "Prospect list ready", receipt });
      await queryClient.invalidateQueries({
        queryKey: [...marketingKeys.site(siteId), "backlinks"],
      });
      toast.success(
        `Found the sites that link to your competitors but not to ${siteDomain}.`,
      );
      void loadSeed();
    } catch (error) {
      if (controller.signal.aborted) return;
      // 409 is the server refusing BEFORE spending, in a sentence written for
      // the user ("confirm a competitor first") — guidance, not a failure.
      if (error instanceof SeoApiError && error.status === 409) {
        const reason =
          typeof error.detail === "string"
            ? error.detail
            : "This site has no confirmed competitor to compare against yet.";
        setRun({ status: "idle", blockedReason: reason });
        void loadSeed();
        return;
      }
      const message = backlinkAnalysisErrorMessage(error);
      setRun({ status: "error", error: message });
      toast.error(message);
    } finally {
      runningRef.current = false;
    }
  }, [accessToken, loadSeed, queryClient, serverUrl, siteDomain, siteId]);

  const review = useCallback(
    async (ids: string[], status: string) => {
      if (!ids.length) return;
      setReviewing(true);
      try {
        const updated = await setLinkGapReviewStatus(ids, status);
        await queryClient.invalidateQueries({
          queryKey: [...marketingKeys.site(siteId), "backlinks"],
        });
        setSelectedIds((current) =>
          current.filter((id) => !ids.includes(id)),
        );
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
   * THE OUTREACH DOOR (contract IC-1). Approved prospects become `crm.party`
   * organizations through the server's canonical fold — the same route the
   * automatic fold uses, so a manual click and the schedule can never write
   * two different kinds of record. Enrollment into an outreach list then reuses
   * the CRM's own dialog; there is no second enrollment path here.
   */
  const foldApproved = useCallback(async () => {
    if (!serverUrl) {
      toast.error("Creating CRM records is unavailable right now.");
      return;
    }
    setFolding(true);
    try {
      const token = await accessToken();
      const report = await foldLinkGapDomainsToCrm(serverUrl, token, siteId, {
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

  return {
    siteId,
    table,
    rows,
    total: domains.data?.total ?? 0,
    statusCounts: domains.data?.statusCounts ?? {},
    isLoading: domains.isLoading,
    isFetching: domains.isFetching,
    isError: domains.isError,
    error: domains.error,
    refetch: () => void domains.refetch(),
    partyByDomainId: parties.data ?? {},
    seed,
    seedLoading,
    seedError,
    reloadSeed: () => void loadSeed(),
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
  };
}
