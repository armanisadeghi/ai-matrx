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

import { useCallback, useEffect, useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { paths } from "@/types/python-generated/api-types";
import { extractErrorMessage } from "@/utils/errors";
import type {
  AddRankTargetInput,
  RankPortfolioItem,
  RankTargetHistoryPoint,
  SerpLandscape,
  UpdateRankTargetInput,
} from "./types";

// TODO(deploy): WS-10 rank-tracking routes are new backend routes, not yet
// regenerated into api-types.ts. Drop these casts once the backend deploys
// and the OpenAPI type sync runs.
const RANK_TARGETS_PATH =
  "/seo/sites/{site_id}/rank-targets" as unknown as keyof paths;
const RANK_TARGET_PATH = "/seo/rank-targets/{target_id}" as unknown as keyof paths;
const RANK_TARGET_HISTORY_PATH =
  "/seo/rank-targets/{target_id}/history" as unknown as keyof paths;
const RANK_TARGET_LANDSCAPE_PATH =
  "/seo/rank-targets/{target_id}/landscape" as unknown as keyof paths;
const RANK_TARGET_CHECK_PATH =
  "/seo/rank-targets/{target_id}/check" as unknown as keyof paths;

export function usePortfolio(siteId: string) {
  const dispatch = useAppDispatch();
  const [items, setItems] = useState<RankPortfolioItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await dispatch(
        callApi({
          path: RANK_TARGETS_PATH,
          method: "GET",
          pathParams: { site_id: siteId },
        }),
      );
      if (response.error) throw new Error(response.error.message);
      setItems((response.data as unknown as RankPortfolioItem[]) ?? []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [dispatch, siteId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addTarget = useCallback(
    async (input: AddRankTargetInput) => {
      const response = await dispatch(
        callApi({
          path: RANK_TARGETS_PATH,
          method: "POST",
          pathParams: { site_id: siteId },
          body: input,
        }),
      );
      if (response.error) throw new Error(response.error.message);
      await reload();
      return response.data as unknown as RankPortfolioItem;
    },
    [dispatch, siteId, reload],
  );

  const updateTarget = useCallback(
    async (targetId: string, patch: UpdateRankTargetInput) => {
      const response = await dispatch(
        callApi({
          path: RANK_TARGET_PATH,
          method: "PATCH",
          pathParams: { target_id: targetId },
          body: patch,
        }),
      );
      if (response.error) throw new Error(response.error.message);
      await reload();
      return response.data as unknown as RankPortfolioItem;
    },
    [dispatch, reload],
  );

  const removeTarget = useCallback(
    async (targetId: string) => {
      const response = await dispatch(
        callApi({
          path: RANK_TARGET_PATH,
          method: "DELETE",
          pathParams: { target_id: targetId },
        }),
      );
      if (response.error) throw new Error(response.error.message);
      await reload();
    },
    [dispatch, reload],
  );

  return { items, loading, error, reload, addTarget, updateTarget, removeTarget };
}

export function useRankTargetHistory(targetId: string | null) {
  const dispatch = useAppDispatch();
  const [points, setPoints] = useState<RankTargetHistoryPoint[]>([]);
  const [landscape, setLandscape] = useState<SerpLandscape | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetId) {
      setPoints([]);
      setLandscape(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
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
        if (cancelled) return;
        if (historyResponse.error) throw new Error(historyResponse.error.message);
        if (landscapeResponse.error) throw new Error(landscapeResponse.error.message);
        setPoints((historyResponse.data as unknown as RankTargetHistoryPoint[]) ?? []);
        setLandscape((landscapeResponse.data as unknown as SerpLandscape) ?? null);
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, targetId]);

  return { points, landscape, loading, error };
}

export interface RankCheckState {
  status: "idle" | "running" | "done" | "error";
  stage?: string;
  error?: string;
}

function streamData(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data" ? (event.data as Record<string, unknown>) : null;
}

/** M-36: fires `POST /seo/rank-targets/{id}/check` (a real, live provider
 * collection) and streams progress. Calls `onComplete` with the fresh
 * portfolio row when the run lands. */
export function useRunRankCheck(onComplete: (item: RankPortfolioItem) => void) {
  const dispatch = useAppDispatch();
  const [checking, setChecking] = useState<Record<string, RankCheckState>>({});

  const run = useCallback(
    async (targetId: string) => {
      setChecking((current) => ({
        ...current,
        [targetId]: { status: "running", stage: "Connecting" },
      }));
      let doneItem: RankPortfolioItem | null = null;
      const result = await dispatch(
        callApi({
          path: RANK_TARGET_CHECK_PATH,
          method: "POST",
          pathParams: { target_id: targetId },
          stream: true,
          onStreamEvent: (event) => {
            const data = streamData(event);
            if (!data) return;
            const kind = typeof data.kind === "string" ? data.kind : null;
            if (!kind) return;
            if (kind === "seo.rank_check_completed") {
              const item = data.portfolio_item as RankPortfolioItem | null;
              if (item) doneItem = item;
              setChecking((current) => ({
                ...current,
                [targetId]: { status: "done", stage: "Check complete" },
              }));
              return;
            }
            setChecking((current) => ({
              ...current,
              [targetId]: { status: "running", stage: kind },
            }));
          },
        }),
      );
      if (result.error) {
        setChecking((current) => ({
          ...current,
          [targetId]: { status: "error", error: result.error?.message },
        }));
        return;
      }
      if (doneItem) onComplete(doneItem);
    },
    [dispatch, onComplete],
  );

  return { checking, run };
}
