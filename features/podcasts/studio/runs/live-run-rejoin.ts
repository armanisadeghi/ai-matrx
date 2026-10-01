import type { ApiCallError } from "@/lib/api/call-api";

/**
 * The request id of a podcast run that is STILL GENERATING, read from the
 * server's refusal to resume it.
 *
 * `/podcast/resume` used to re-run every unsaved stage beside a live run, so a
 * reload mid-audio paid for the audio twice (2026-09-28). It now answers
 * `409 run_in_progress` with the live run's `live_request_id`; the page follows that
 * run at `/runtime/operations/{request_id}/rejoin` instead. Returns null for
 * every other error, so a genuine failure is never mistaken for a live run.
 */
export function liveRunRequestId(
  error: ApiCallError | null | undefined,
): string | null {
  if (!error || error.status !== 409) return null;
  const body = error.serverDetail;
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  // FastAPI puts the HTTPException detail under `detail`; the platform's error
  // envelope uses `details`. Accept the shape at the top level too.
  for (const candidate of [record.detail, record.details, record]) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const c = candidate as Record<string, unknown>;
    // `live_request_id`, never `request_id`: the error envelope reserves
    // `request_id` for the API call's own id, so reading it rejoined a request
    // that does not exist (404, 2026-10-01).
    if (
      c.code === "run_in_progress" &&
      typeof c.live_request_id === "string" &&
      c.live_request_id
    ) {
      return c.live_request_id;
    }
  }
  return null;
}
