// features/podcasts/studio/runs/runsApi.ts
//
// COMPUTE-only client for the podcast-runs backend. Per the platform rule the
// React client reads the database DIRECTLY via Supabase (see runsRepository.ts);
// the Python backend is only called to DO things that require server compute —
// here, regenerating or adding a single asset by invoking an AI image/video
// agent. Reads never go through here.

import type { useBackendApi } from "@/hooks/useBackendApi";
import type { RunAsset, RunAssetKind } from "./run-types";

type Api = ReturnType<typeof useBackendApi>;

/** Regenerate a single image/video (optionally with a chosen model / prompt).
 *  Runs an AI agent server-side and returns the new durable asset. */
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

/** Add a brand-new asset (manual description / beyond the default slots).
 *  Runs an AI agent server-side and returns the new durable asset. */
export async function addAsset(
  api: Api,
  runId: string,
  body: { asset_kind: RunAssetKind; description: string; model_alias?: string },
): Promise<RunAsset> {
  const res = await api.post(`/podcast/runs/${runId}/assets/add`, body);
  return (await res.json()) as RunAsset;
}
