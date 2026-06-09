// features/podcasts/studio/runs/runsApi.ts
//
// Thin client over the aidream podcast-runs endpoints. Pure functions that take
// the `useBackendApi()` client as the first arg (so they're trivially testable
// and don't bind a hook) — the hooks in this folder supply the client.

import type { useBackendApi } from "@/hooks/useBackendApi";
import type { RunAsset, RunAssetKind, RunDetail, RunStatusDto, RunSummary } from "./run-types";

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

export async function regenerateAsset(
  api: Api,
  runId: string,
  body: {
    asset_kind: RunAssetKind;
    slot: number;
    model_alias?: string;
    custom_prompt?: string;
  },
): Promise<RunAsset> {
  const res = await api.post(`/podcast/runs/${runId}/assets/regenerate`, body);
  return (await res.json()) as RunAsset;
}

export async function addAsset(
  api: Api,
  runId: string,
  body: { asset_kind: RunAssetKind; description: string; model_alias?: string },
): Promise<RunAsset> {
  const res = await api.post(`/podcast/runs/${runId}/assets/add`, body);
  return (await res.json()) as RunAsset;
}
