// features/podcasts/studio/runs/pendingStart.ts
//
// Hands the just-submitted PodcastGenerateRequest from the create form to the
// run page (/podcast/studio/run/[id]) WITHOUT re-streaming on refresh.
//
// The form stashes the request keyed by the new run id, then routes. The run
// page consumes it once on mount and starts the live stream. A full page reload
// clears this module state — so refreshing or returning later shows the durably
// persisted run instead of kicking off a brand-new (duplicate) generation. That
// is exactly the behavior we want: stream once, persist always, replay from DB.

import type { PodcastGenerateRequest } from "@/features/podcasts/generator/types";

const pending = new Map<string, PodcastGenerateRequest>();

export function stashPendingStart(
  runId: string,
  request: PodcastGenerateRequest,
): void {
  pending.set(runId, request);
}

/** Consume (and remove) the pending request for a run, or null if none. */
export function takePendingStart(runId: string): PodcastGenerateRequest | null {
  const req = pending.get(runId) ?? null;
  pending.delete(runId);
  return req;
}
