"use client";

/**
 * Rank tracking data layer (WS-10 / M-34..M-37) — thin wrappers over
 * `aidream`'s `/seo/sites/{site_id}/rank-targets` family. Portfolio add
 * requires server-side identity resolution (never a raw Supabase insert —
 * see `aidream/services/seo/rank_tracking.py`), so this feature goes through
 * aidream end to end rather than splitting reads to direct Supabase, mirroring
 * the SiteStrategyCard / ScheduleStatusPanel precedent for 2026-07-23+ SEO
 * command surfaces.
 */

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { components } from "@/types/python-generated/api-types";
import { isJsonObject } from "@/types/json";
import { extractErrorMessage } from "@/utils/errors";
import type {
  AddRankTargetInput,
  RankPortfolioItem,
  UpdateRankTargetInput,
} from "./types";

const RANK_TARGETS_PATH = "/seo/sites/{site_id}/rank-targets";
const RANK_TARGET_PATH = "/seo/rank-targets/{target_id}";
const RANK_TARGET_HISTORY_PATH = "/seo/rank-targets/{target_id}/history";
const RANK_TARGET_LANDSCAPE_PATH = "/seo/rank-targets/{target_id}/landscape";
const RANK_TARGET_CHECK_PATH = "/seo/rank-targets/{target_id}/check";

type ApiRankPortfolioItem = components["schemas"]["RankPortfolioItem"];
type ApiRankTargetHistoryPoint =
  components["schemas"]["RankTargetHistoryPoint"];
type ApiSerpLandscape = components["schemas"]["SerpLandscape"];
type ApiSerpLandscapeResult = components["schemas"]["SerpLandscapeResult"];

export const rankTrackingKeys = {
  all: ["marketing", "rank-tracking"] as const,
  portfolio: (siteId: string, organizationId: string) =>
    [...rankTrackingKeys.all, "portfolio", siteId, organizationId] as const,
  target: (targetId: string | null) =>
    [...rankTrackingKeys.all, "target", targetId] as const,
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isRankPortfolioItem(value: unknown): value is ApiRankPortfolioItem {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.target_id === "string" &&
    typeof value.site_id === "string" &&
    typeof value.keyword_id === "string" &&
    typeof value.keyword === "string" &&
    typeof value.provider === "string" &&
    typeof value.engine === "string" &&
    typeof value.language === "string" &&
    typeof value.device === "string" &&
    typeof value.search_type === "string" &&
    isNullableString(value.location_name) &&
    isNullableString(value.target_domain) &&
    isNullableString(value.target_page_id) &&
    isNullableString(value.group) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    isNullableString(value.notes) &&
    typeof value.cadence_days === "number" &&
    typeof value.is_active === "boolean" &&
    typeof value.created_at === "string" &&
    isNullableNumber(value.latest_position) &&
    isNullableNumber(value.latest_absolute_position) &&
    isNullableNumber(value.previous_position) &&
    isNullableNumber(value.movement) &&
    isNullableNumber(value.best_position) &&
    isNullableString(value.last_checked_at)
  );
}

function readRankPortfolio(value: unknown): ApiRankPortfolioItem[] {
  if (!Array.isArray(value) || !value.every(isRankPortfolioItem)) {
    throw new Error("The rank portfolio response had an invalid shape.");
  }
  return value;
}

function readRankPortfolioItem(value: unknown): ApiRankPortfolioItem {
  if (!isRankPortfolioItem(value)) {
    throw new Error("The rank target response had an invalid shape.");
  }
  return value;
}

function isRankTargetHistoryPoint(
  value: unknown,
): value is ApiRankTargetHistoryPoint {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.observed_at === "string" &&
    isNullableNumber(value.organic_rank) &&
    isNullableNumber(value.absolute_rank) &&
    isNullableString(value.matched_url) &&
    isNullableString(value.matched_domain) &&
    typeof value.result_type === "string"
  );
}

function readRankTargetHistory(value: unknown): ApiRankTargetHistoryPoint[] {
  if (!Array.isArray(value) || !value.every(isRankTargetHistoryPoint)) {
    throw new Error("The rank history response had an invalid shape.");
  }
  return value;
}

function isSerpLandscapeResult(
  value: unknown,
): value is ApiSerpLandscapeResult {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.absolute_rank === "number" &&
    isNullableNumber(value.organic_rank) &&
    typeof value.result_type === "string" &&
    isNullableString(value.url) &&
    isNullableString(value.domain) &&
    isNullableString(value.title) &&
    isNullableString(value.snippet)
  );
}

function readSerpLandscape(value: unknown): ApiSerpLandscape {
  if (
    !isJsonObject(value) ||
    !isNullableString(value.snapshot_id) ||
    !isNullableString(value.observed_at) ||
    !Array.isArray(value.results) ||
    !value.results.every(isSerpLandscapeResult)
  ) {
    throw new Error("The stored result-page response had an invalid shape.");
  }
  return {
    snapshot_id: value.snapshot_id,
    observed_at: value.observed_at,
    results: value.results,
  };
}

export function usePortfolio(siteId: string, organizationId: string) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const queryKey = rankTrackingKeys.portfolio(siteId, organizationId);
  const portfolio = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await dispatch(
        callApi({
          path: RANK_TARGETS_PATH,
          method: "GET",
          pathParams: { site_id: siteId },
        }),
      );
      if (response.error) throw new Error(response.error.message);
      return readRankPortfolio(response.data);
    },
    enabled: Boolean(siteId && organizationId),
    staleTime: 5 * 60_000,
  });

  const addTarget = async (input: AddRankTargetInput) => {
    const response = await dispatch(
      callApi({
        path: RANK_TARGETS_PATH,
        method: "POST",
        pathParams: { site_id: siteId },
        body: input,
        scopeOverrides: { organization_id: organizationId },
      }),
    );
    if (response.error) throw new Error(response.error.message);
    const item = readRankPortfolioItem(response.data);
    queryClient.setQueryData<ApiRankPortfolioItem[]>(
      queryKey,
      (current = []) => [
        ...current.filter(
          (candidate) => candidate.target_id !== item.target_id,
        ),
        item,
      ],
    );
    return item;
  };

  const updateTarget = async (
    targetId: string,
    patch: UpdateRankTargetInput,
  ) => {
    const response = await dispatch(
      callApi({
        path: RANK_TARGET_PATH,
        method: "PATCH",
        pathParams: { target_id: targetId },
        body: patch,
        scopeOverrides: { organization_id: organizationId },
      }),
    );
    if (response.error) throw new Error(response.error.message);
    const item = readRankPortfolioItem(response.data);
    queryClient.setQueryData<ApiRankPortfolioItem[]>(queryKey, (current = []) =>
      current.map((candidate) =>
        candidate.target_id === item.target_id ? item : candidate,
      ),
    );
    return item;
  };

  const removeTarget = async (targetId: string) => {
    const response = await dispatch(
      callApi({
        path: RANK_TARGET_PATH,
        method: "DELETE",
        pathParams: { target_id: targetId },
      }),
    );
    if (response.error) throw new Error(response.error.message);
    queryClient.setQueryData<ApiRankPortfolioItem[]>(queryKey, (current = []) =>
      current.filter((candidate) => candidate.target_id !== targetId),
    );
  };

  return {
    items: portfolio.data ?? [],
    loading: portfolio.isPending || portfolio.isFetching,
    error: portfolio.error ? extractErrorMessage(portfolio.error) : null,
    reload: portfolio.refetch,
    addTarget,
    updateTarget,
    removeTarget,
  };
}

export function useRankTargetHistory(targetId: string | null) {
  const dispatch = useAppDispatch();
  const history = useQuery({
    queryKey: rankTrackingKeys.target(targetId),
    queryFn: async () => {
      if (!targetId) {
        return { points: [], landscape: null };
      }
      const [historyResponse, landscapeResponse] = await Promise.all([
        dispatch(
          callApi({
            path: RANK_TARGET_HISTORY_PATH,
            method: "GET",
            pathParams: { target_id: targetId },
          }),
        ),
        dispatch(
          callApi({
            path: RANK_TARGET_LANDSCAPE_PATH,
            method: "GET",
            pathParams: { target_id: targetId },
          }),
        ),
      ]);
      if (historyResponse.error) {
        throw new Error(historyResponse.error.message);
      }
      if (landscapeResponse.error) {
        throw new Error(landscapeResponse.error.message);
      }
      return {
        points: readRankTargetHistory(historyResponse.data),
        landscape: readSerpLandscape(landscapeResponse.data),
      };
    },
    enabled: Boolean(targetId),
    staleTime: 5 * 60_000,
  });

  return {
    points: history.data?.points ?? [],
    landscape: history.data?.landscape ?? null,
    loading: Boolean(targetId) && history.isPending,
    error: history.error ? extractErrorMessage(history.error) : null,
  };
}

export interface RankCheckState {
  status: "idle" | "running" | "done" | "error";
  stage?: string;
  error?: string;
}

function streamData(event: TypedStreamEvent): Record<string, unknown> | null {
  if (event.event !== "data" || !isJsonObject(event.data)) return null;
  return event.data;
}

/** M-36: fires `POST /seo/rank-targets/{id}/check` (a real, live provider
 * collection) and streams progress. Calls `onComplete` with the fresh
 * portfolio row when the run lands. */
export function useRunRankCheck(onComplete: (item: RankPortfolioItem) => void) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState<Record<string, RankCheckState>>({});

  const run = useCallback(
    async (targetId: string) => {
      setChecking((current) => ({
        ...current,
        [targetId]: { status: "running", stage: "Connecting" },
      }));
      let doneItem: RankPortfolioItem | null = null;
      let streamError: string | null = null;
      const result = await dispatch(
        callApi({
          path: RANK_TARGET_CHECK_PATH,
          method: "POST",
          pathParams: { target_id: targetId },
          stream: true,
          onStreamEvent: (event) => {
            // Backend failures arrive as in-band `error` events on an
            // otherwise-successful stream — result.error stays null, so
            // ignoring these left the row spinning forever.
            if (event.event === "error") {
              streamError = extractErrorMessage(event.data);
              return;
            }
            const data = streamData(event);
            if (!data) return;
            const kind = typeof data.kind === "string" ? data.kind : null;
            if (!kind) return;
            if (kind === "seo.rank_check_completed") {
              if (isRankPortfolioItem(data.portfolio_item)) {
                doneItem = data.portfolio_item;
              }
              return;
            }
            setChecking((current) => ({
              ...current,
              [targetId]: { status: "running", stage: kind },
            }));
          },
        }),
      );
      // The stream is over — the row MUST land on a terminal state here, no
      // matter what shape the failure took (transport error, in-band error
      // event, or a stream that simply ended without the completion event).
      if (doneItem && !result.error && !streamError) {
        setChecking((current) => ({
          ...current,
          [targetId]: { status: "done", stage: "Check complete" },
        }));
        void queryClient.invalidateQueries({
          queryKey: rankTrackingKeys.target(targetId),
        });
        onComplete(doneItem);
        return;
      }
      const message =
        result.error?.message ??
        streamError ??
        "The check ended without a result — try again.";
      setChecking((current) => ({
        ...current,
        [targetId]: { status: "error", error: message },
      }));
      toast.error("Rank check failed", { description: message });
    },
    [dispatch, onComplete, queryClient],
  );

  return { checking, run };
}
