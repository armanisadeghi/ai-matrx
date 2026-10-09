/**
 * Start a guided capture: `POST /social/gated-captures` with `path: "guided"`
 * (GATED-CAPTURE.md §2). The server queues the page, moves it to the person
 * (rung 4) and answers with the job, one line of what will happen and the
 * numbered steps — the dialog shows exactly those, and the extension draws the
 * same steps on the page from the job row.
 */

import { postJson } from "@/lib/python-client";
import { parseCaptureHandoff } from "@/features/capture-ladder/captureHandoffTable";
import type { CaptureHandoff } from "@/features/capture-ladder/types";

export interface GuidedCaptureTarget {
  platform?: string;
  /** What the person pasted, or the bare handle. */
  handleOrUrl: string;
  target?: "profile" | "activity" | "post";
  profileId?: string | null;
  trackedAccountId?: string | null;
  propertyId?: string | null;
  brandId?: string | null;
  postId?: string | null;
}

export interface GuidedCaptureStart {
  job: CaptureHandoff;
  intro: string;
  steps: string[];
  openUrl: string;
  platform: string;
}

interface Answer {
  job?: unknown;
  intro?: unknown;
  steps?: unknown;
  open_url?: unknown;
  platform?: unknown;
}

/** Read the door's answer defensively; a shape we do not know is a sentence, not a crash. */
export function parseGuidedStart(data: Answer): GuidedCaptureStart {
  const job = parseCaptureHandoff(data.job);
  if (!job) {
    throw new Error("The capture was started, but the answer was not in a shape this page understands.");
  }
  const steps = Array.isArray(data.steps)
    ? data.steps.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : [];
  return {
    job,
    intro: typeof data.intro === "string" ? data.intro : "",
    steps,
    openUrl: typeof data.open_url === "string" ? data.open_url : job.url,
    platform: typeof data.platform === "string" ? data.platform : "",
  };
}

export async function startGuidedCapture(
  target: GuidedCaptureTarget,
  organizationId: string,
  signal?: AbortSignal,
): Promise<GuidedCaptureStart> {
  const { data } = await postJson<Answer>(
    "/social/gated-captures",
    {
      ...(target.platform ? { platform: target.platform } : {}),
      handle_or_url: target.handleOrUrl,
      target: target.target ?? "profile",
      path: "guided",
      profile_id: target.profileId ?? null,
      tracked_account_id: target.trackedAccountId ?? null,
      property_id: target.propertyId ?? null,
      brand_id: target.brandId ?? null,
      post_id: target.postId ?? null,
    },
    { organizationId, signal },
  );
  return parseGuidedStart(data);
}
