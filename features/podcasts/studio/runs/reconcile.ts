// features/podcasts/studio/runs/reconcile.ts
//
// ASK THE SERVER WHAT IS ACTUALLY GOING ON.
//
// The client reads the durable record for truth (runsRepository). But a record
// can be behind the reality of the work — a stage running silently, a terminal
// state the worker hasn't stamped, essential work that genuinely stalled. When
// the record says "not finished", passively re-reading it forever is not an
// answer; the client asks the server, and the server INSPECTS the run and lands
// it somewhere real:
//
//   running    → genuinely alive; keep observing at the server's cadence
//   completed  → essential work was done; the server has now stamped the run,
//                promoted audio/script/episode and settled cost
//   resumed    → essential work was pending; the server restarted it from its
//                checkpoint (completed stages replay free, paid TTS is never
//                re-bought)
//   failed     → terminal and unrecoverable, with a reason a human can read
//
// THE LAW THIS ENCODES: essential work (script → audio → episode) gates the
// episode. Ancillary work (individual covers, clips, the composed promo video)
// NEVER does. `ancillary_pending` arriving alongside outcome "completed" is the
// normal, healthy case — "your episode is ready, this one cover needs a redo" —
// and a run is publishable the moment its audio exists, even while a 19-minute
// ffmpeg compose is still churning.
//
// Server contract owner: aidream podcast_runs router (POST
// /podcast/runs/{run_id}/reconcile). Idempotent and concurrency-safe: repeated
// or simultaneous calls converge, and a caller arriving during a resume sees
// "running" rather than triggering a second one.

import { postJson } from "@/lib/python-client";

export type ReconcileOutcome = "running" | "completed" | "resumed" | "failed";
export type EssentialStatus = "completed" | "pending" | "failed";

export interface ReconcileAncillary {
  stage_key: string;
  kind: string;
  slot: number;
  status: string;
  /** What the user can do about it — today always "regenerate". */
  action: string;
}

export interface ReconcileResult {
  run_id: string;
  outcome: ReconcileOutcome;
  status: "processing" | "completed" | "failed";
  /** One plain sentence, safe to show a non-technical user as-is. */
  reason: string;
  essential: {
    script: EssentialStatus;
    audio: EssentialStatus;
    episode: EssentialStatus;
  };
  audio_url: string | null;
  script: string | null;
  episode_id: string | null;
  episode_slug: string | null;
  total_cost_usd: number;
  progress: { done: number; failed: number; total: number };
  stages: Array<{
    stage_key: string;
    status: "completed" | "failed" | "processing";
    cost_usd: number | null;
  }>;
  ancillary_pending: ReconcileAncillary[];
  /** Server-owned cadence; null when the outcome is terminal. */
  poll_after_seconds: number | null;
}

/**
 * The episode is deliverable — show it, whatever the run's overall outcome is.
 * Audio IS the podcast; the composed promo video and the covers are extras.
 */
export function hasDeliverableEpisode(r: ReconcileResult): boolean {
  return (
    r.essential.audio === "completed" ||
    Boolean(r.audio_url) ||
    Boolean(r.episode_id)
  );
}

/**
 * Ask the server to reconcile a run. Never throws — a reconcile is a RECOVERY
 * path, and a recovery path that explodes leaves the user exactly where the
 * dead end was. Returns null when the answer is unusable (endpoint not
 * deployed yet, network failure, not our run); callers keep their existing
 * durable-record behaviour in that case.
 */
export async function reconcileRun(
  runId: string,
): Promise<ReconcileResult | null> {
  try {
    // Empty object, deliberately: the endpoint model inherits ScopedRequest, so
    // callApi's injected org/project/task scope is accepted rather than 422'd,
    // and the server derives everything else from the run itself.
    const { data } = await postJson<ReconcileResult>(
      `/podcast/runs/${runId}/reconcile`,
      {},
    );
    return data && typeof data.outcome === "string" ? data : null;
  } catch {
    return null;
  }
}
