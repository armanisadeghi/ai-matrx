// features/podcasts/studio/runs/runsApi.ts
//
// COMPUTE-only client for the podcast-runs backend. Per the platform rule the
// React client reads the database DIRECTLY via Supabase (see runsRepository.ts);
// the Python backend is only called to DO things that require server compute —
// here, regenerating or adding a single asset by invoking an AI image/video
// agent. Reads never go through here.
//
// 2026-07 stream-everything conversion: both per-asset endpoints now respond
// with the canonical matrx-connect NDJSON stream instead of blocking JSON.
// Request bodies are UNCHANGED. The stream is
//   phase(connected) → data:podcast_asset_gen_started → record_update(active)
//   → optional provider progress → heartbeats → record_update(terminal)
//   → resource_changed(pc_studio_run_assets) → data:podcast_asset_result → end
// and the terminal `podcast_asset_result` is a superset of the old RunAsset
// response — so these functions keep their Promise<RunAsset> signature by
// consuming the stream and resolving from the terminal event. A GENERATION
// failure is NOT a stream error: it arrives as `podcast_asset_result` with
// status "failed" + error, exactly like the old graceful-failure JSON. Real
// infra failures arrive as in-stream `error` events (thrown here); pre-stream
// HTTP failures (400/404/422) throw from postNdjson itself.

import { postNdjson } from "@/lib/python-client";
import type { components } from "@/types/python-generated/api-types";
import type {
  PodcastAssetResultEvent,
  TypedStreamEvent,
} from "@/types/python-generated/stream-events";
import type { RunAsset } from "./run-types";

/** Optional live-progress tap — every stream event is forwarded as-is. */
export type AssetStreamListener = (evt: TypedStreamEvent) => void;

/**
 * Request bodies DERIVED from the generated OpenAPI contract — a backend rename
 * lights up every callsite. The stream MECHANISM stays `postNdjson` (these
 * endpoints respond with NDJSON, which the JSON typed-client can't wrap), but
 * the bodies are still contract-bound.
 */
export type RegenerateAssetRequest =
  components["schemas"]["RegenerateAssetRequest"];
export type AddAssetRequest = components["schemas"]["AddAssetRequest"];

/** Normalize the terminal wire event (optional fields) into the durable
 *  RunAsset DTO shape the rest of the runs code consumes. */
function toRunAsset(p: PodcastAssetResultEvent): RunAsset {
  return {
    asset_kind: p.asset_kind,
    slot: p.slot,
    status: p.status,
    url: p.url ?? null,
    file_id: p.file_id ?? null,
    prompt: p.prompt ?? null,
    model_alias: p.model_alias ?? null,
    is_manual: p.is_manual ?? false,
  };
}

/** Consume one per-asset NDJSON stream to its terminal `podcast_asset_result`. */
async function runAssetStream<B>(
  path: string,
  body: B,
  onEvent?: AssetStreamListener,
): Promise<RunAsset> {
  for await (const evt of postNdjson(path, body)) {
    onEvent?.(evt);
    if (evt.event === "error") {
      throw new Error(
        evt.data.user_message ?? evt.data.message ?? "Asset generation failed",
      );
    }
    if (evt.event !== "data") continue;
    const d = evt.data;
    if (!d || typeof d !== "object" || !("type" in d)) continue;
    // The generated data union includes UntypedDataPayload (indexed), so
    // literal narrowing alone can't pin the member — assert to the generated
    // per-event interface after checking the discriminant.
    if (d.type === "podcast_asset_result") {
      return toRunAsset(d as PodcastAssetResultEvent);
    }
  }
  throw new Error("Asset stream ended without a result");
}

/** Regenerate a single image/video (optionally with a chosen model / prompt).
 *  Runs an AI agent server-side and resolves with the new durable asset. */
export async function regenerateAsset(
  runId: string,
  body: RegenerateAssetRequest,
  onEvent?: AssetStreamListener,
): Promise<RunAsset> {
  return runAssetStream(
    `/podcast/runs/${runId}/assets/regenerate`,
    body,
    onEvent,
  );
}

/** Add a brand-new asset (manual description / beyond the default slots).
 *  Runs an AI agent server-side and resolves with the new durable asset. */
export async function addAsset(
  runId: string,
  body: AddAssetRequest,
  onEvent?: AssetStreamListener,
): Promise<RunAsset> {
  return runAssetStream(`/podcast/runs/${runId}/assets/add`, body, onEvent);
}
