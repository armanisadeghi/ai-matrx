/**
 * "Capture in the cloud" — the cloud-browser path (GATED-CAPTURE.md §2 `cloud_browser`).
 *
 * Only when the normal read failed. The persistent cloud browser signs in AS the person with a
 * login they saved in the Vault (our tool types it; nobody sees it), opens the page, captures it
 * and lands it through the same capture door as every other path. A code or check the platform
 * asks for comes back to the person ("Waiting for you") — it is never bypassed.
 *
 * Doors (aidream): `GET /social/cloud-capture/readiness`, `POST /social/gated-captures` with
 * `path: "cloud_browser"` (the hub's start door), then `POST /social/gated-captures/{id}/cloud`.
 * Live stage rides the job row at `metadata.social.cloud` (same realtime read as the hub).
 */

import { getJson, postJson } from "@/lib/python-client";
import { BackendApiError } from "@/lib/api/errors";
import type { CaptureHandoff } from "@/features/capture-ladder/types";

import { parseGuidedStart, type GuidedCaptureTarget } from "./guidedApi";
import { parseReadiness, type CloudReadiness } from "./cloudJob";

export async function getCloudReadiness(
  platform: string,
  organizationId: string,
  signal?: AbortSignal,
): Promise<CloudReadiness> {
  const { data } = await getJson<Record<string, unknown>>(
    `/social/cloud-capture/readiness?platform=${encodeURIComponent(platform)}`,
    { organizationId, signal },
  );
  return parseReadiness(data);
}

/** Queue the page as a cloud job (the hub's door), then start the cloud browser on it. */
export async function startCloudCapture(
  target: GuidedCaptureTarget,
  organizationId: string,
  credentialItemId: string | null,
): Promise<CaptureHandoff> {
  const { data } = await postJson<Record<string, unknown>>(
    "/social/gated-captures",
    {
      ...(target.platform ? { platform: target.platform } : {}),
      handle_or_url: target.handleOrUrl,
      target: target.target ?? "profile",
      path: "cloud_browser",
      profile_id: target.profileId ?? null,
      tracked_account_id: target.trackedAccountId ?? null,
      property_id: target.propertyId ?? null,
      brand_id: target.brandId ?? null,
      post_id: target.postId ?? null,
    },
    { organizationId },
  );
  const { job } = parseGuidedStart(data);
  await postJson(
    `/social/gated-captures/${encodeURIComponent(job.id)}/cloud`,
    { credential_item_id: credentialItemId },
    { organizationId },
  );
  return job;
}

/** The server's refusal sentence (`detail.message`), else the error's own words. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export function cloudRefusal(error: unknown): string {
  if (error instanceof BackendApiError) {
    const details = error.details as { message?: unknown } | undefined;
    const fromDetails = details && typeof details === "object" ? str(details.message) : null;
    return fromDetails ?? str(error.detail) ?? error.message;
  }
  return error instanceof Error ? error.message : "Couldn't start the cloud capture";
}
