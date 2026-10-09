/**
 * "Capture with my browser" — the background path (GATED-CAPTURE.md §2, rung 3).
 *
 * `POST /social/gated-captures` with `path: "extension_background"` queues the page as a
 * `media.capture_handoff` row carrying `metadata.social`; then the existing bridge hands the queue
 * to the person's own Chrome (`handToOwnBrowser`, organization travels with it). The extension's
 * unattended runner opens it in a background tab, signed in as them, and posts the result through
 * the one capture door; the server extracts, saves images and attaches it to the account.
 */

import { handToOwnBrowser, type HandToOwnBrowserOutcome } from "@/lib/extension-bridge/handToOwnBrowser";
import { postJson } from "@/lib/python-client";

import { parseGuidedStart, type GuidedCaptureStart, type GuidedCaptureTarget } from "./guidedApi";

export interface BackgroundCaptureStart extends GuidedCaptureStart {
  handOff: HandToOwnBrowserOutcome;
}

export async function startBackgroundCapture(
  target: GuidedCaptureTarget,
  organizationId: string,
  signal?: AbortSignal,
): Promise<BackgroundCaptureStart> {
  const { data } = await postJson<Record<string, unknown>>(
    "/social/gated-captures",
    {
      ...(target.platform ? { platform: target.platform } : {}),
      handle_or_url: target.handleOrUrl,
      target: target.target ?? "profile",
      path: "extension_background",
      profile_id: target.profileId ?? null,
      tracked_account_id: target.trackedAccountId ?? null,
      property_id: target.propertyId ?? null,
      brand_id: target.brandId ?? null,
      post_id: target.postId ?? null,
    },
    { organizationId, signal },
  );
  const started = parseGuidedStart(data);
  const handOff = await handToOwnBrowser({ organizationId, handoffId: started.job.id, url: started.job.url });
  return { ...started, handOff };
}
