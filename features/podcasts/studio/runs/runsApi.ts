// features/podcasts/studio/runs/runsApi.ts
//
// Thin client over the aidream podcast-runs endpoints. Pure functions that take
// the `useBackendApi()` client as the first arg (so they're trivially testable
// and don't bind a hook) — the hooks in this folder supply the client.

import type { useBackendApi } from "@/hooks/useBackendApi";
import type { RunDetail, RunStatusDto, RunSummary } from "./run-types";

type Api = ReturnType<typeof useBackendApi>;

export interface ListRunsParams {
  status?: string;
  includeDrafts?: boolean;
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchRuns(
  api: Api,
  { status, includeDrafts = true, limit = 100, signal }: ListRunsParams = {},
): Promise<RunSummary[]> {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  qs.set("include_drafts", String(includeDrafts));
  qs.set("limit", String(limit));
  const res = await api.get(`/podcast/runs?${qs.toString()}`, signal);
  const data = (await res.json()) as { runs: RunSummary[] };
  return data.runs ?? [];
}

export async function fetchRun(
  api: Api,
  runId: string,
  signal?: AbortSignal,
): Promise<RunDetail> {
  const res = await api.get(`/podcast/runs/${runId}`, signal);
  return (await res.json()) as RunDetail;
}

export async function fetchRunStatus(
  api: Api,
  runId: string,
  signal?: AbortSignal,
): Promise<RunStatusDto> {
  const res = await api.get(`/podcast/runs/${runId}/status`, signal);
  return (await res.json()) as RunStatusDto;
}
