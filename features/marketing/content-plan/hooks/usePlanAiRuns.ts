"use client";

/**
 * A site's AI run history — every paid model run this feature has ever made
 * against it, and the full result of any one of them.
 *
 * Every content-plan AI action (page brief, page deepen, plan generation,
 * keyword strategy, entity attachment, plan review) records a `chat.agent_run`
 * row carrying its COMPLETE request and result, linked to the record it ran
 * for through `platform.associations`. Page-level runs are linked to their
 * page AND to its site, so this one list is the whole feature's spend.
 *
 * Served by `GET /content-plan/sites/{id}/ai-runs` (+ `/{run_id}` to open
 * one). Real server work — the rows are reached through associations and
 * org-verified per row — so it is NOT a direct-to-Supabase read.
 */
import { useQuery } from "@tanstack/react-query";

import { callApi } from "@/lib/api/call-api";
import { describeBackendFailure, parseCallApiError } from "@/lib/api/errors";
import { useAppDispatch } from "@/lib/redux/hooks";

export const planAiRunKeys = {
  list: (siteId: string | null) => ["content-plan", "ai-runs", siteId] as const,
  detail: (siteId: string | null, runId: string) =>
    ["content-plan", "ai-runs", siteId, runId] as const,
};

export interface PlanAiRunSummary {
  runId: string;
  kind: string;
  kindLabel: string;
  status: string;
  createdAt: string;
  nodeId: string | null;
  nodeRoute: string;
  modelId: string | null;
  headline: string;
  totalCost: number;
  error: string;
}

export interface PlanAiRunDetail {
  runId: string;
  kind: string;
  kindLabel: string;
  status: string;
  createdAt: string;
  nodeId: string | null;
  totalCost: number;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  error: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const nullableText = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;
const record = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

function parseSummaries(data: unknown): PlanAiRunSummary[] {
  if (!isRecord(data) || !Array.isArray(data.runs)) return [];
  const out: PlanAiRunSummary[] = [];
  for (const row of data.runs) {
    if (!isRecord(row) || typeof row.run_id !== "string" || !row.run_id) continue;
    out.push({
      runId: row.run_id,
      kind: text(row.kind),
      kindLabel: text(row.kind_label) || text(row.kind),
      status: text(row.status),
      createdAt: text(row.created_at),
      nodeId: nullableText(row.node_id),
      nodeRoute: text(row.node_route),
      modelId: nullableText(row.model_id),
      headline: text(row.headline),
      totalCost: typeof row.total_cost === "number" ? row.total_cost : 0,
      error: text(row.error),
    });
  }
  return out;
}

function parseDetail(data: unknown): PlanAiRunDetail | null {
  if (!isRecord(data) || typeof data.run_id !== "string") return null;
  return {
    runId: data.run_id,
    kind: text(data.kind),
    kindLabel: text(data.kind_label) || text(data.kind),
    status: text(data.status),
    createdAt: text(data.created_at),
    nodeId: nullableText(data.node_id),
    totalCost: typeof data.total_cost === "number" ? data.total_cost : 0,
    request: record(data.request),
    result: record(data.result),
    error: record(data.error),
  };
}

/** Every recorded AI run for one site, newest first. */
export function usePlanAiRuns(siteId: string | null) {
  const dispatch = useAppDispatch();
  return useQuery({
    queryKey: planAiRunKeys.list(siteId),
    enabled: Boolean(siteId),
    staleTime: 30_000,
    queryFn: async (): Promise<PlanAiRunSummary[]> => {
      const result = await dispatch(
        callApi({
          path: "/content-plan/sites/{site_id}/ai-runs",
          method: "GET",
          pathParams: { site_id: siteId as string },
        }),
      );
      if (result.error) {
        throw new Error(
          describeBackendFailure(parseCallApiError(result.error)).headline,
        );
      }
      return parseSummaries(result.data);
    },
  });
}

/** ONE past run, opened in full. Fetched only when a run is selected. */
export function usePlanAiRun(siteId: string | null, runId: string | null) {
  const dispatch = useAppDispatch();
  return useQuery({
    queryKey: planAiRunKeys.detail(siteId, runId ?? ""),
    enabled: Boolean(siteId && runId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PlanAiRunDetail | null> => {
      const result = await dispatch(
        callApi({
          path: "/content-plan/sites/{site_id}/ai-runs/{run_id}",
          method: "GET",
          pathParams: { site_id: siteId as string, run_id: runId as string },
        }),
      );
      if (result.error) {
        throw new Error(
          describeBackendFailure(parseCallApiError(result.error)).headline,
        );
      }
      return parseDetail(result.data);
    },
  });
}
