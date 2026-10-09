"use client";

/**
 * The seam between a Board social tile that could not read a page and the gated-capture ways (the person's own
 * browser; GATED-CAPTURE.md §6). A tile renders `<GatedCaptureAction>` and nothing else of the capture flow: the
 * hub's one `GatedCaptureOffer` (Capture with my browser / Take me there, with live job status) is the whole
 * offer, so a change there reaches every tile with no edit here.
 */

import { GatedCaptureOffer } from "@/features/marketing/social/gated/GatedCaptureOffer";
import type { GuidedCaptureTarget } from "@/features/marketing/social/gated/guidedApi";
import { GUIDED_CAPTURE_PLATFORMS } from "@/features/marketing/social/gated/guidedJob";
import { detectPlatform } from "@/features/marketing/social/link";
import { SOCIAL_PLATFORM_LABELS, isSocialPlatform } from "@/features/marketing/social/types";

/** The platform a capture target is on: named, else read from the pasted link. */
function platformOf(target: GuidedCaptureTarget): string | null {
  return target.platform ?? detectPlatform(target.handleOrUrl) ?? null;
}

/** Can the person's own browser capture this target at all (a platform the capture ways cover)? */
export function canCaptureTarget(target: GuidedCaptureTarget): boolean {
  const platform = platformOf(target);
  return platform !== null && GUIDED_CAPTURE_PLATFORMS.has(platform);
}

export function GatedCaptureAction({
  organizationId,
  target,
  onCaptured,
}: {
  organizationId: string;
  target: GuidedCaptureTarget;
  /** Called once when a capture is saved, so the tile reads again. */
  onCaptured?: () => void;
}) {
  const platform = platformOf(target);
  if (!canCaptureTarget(target)) return null;
  return (
    <GatedCaptureOffer
      compact
      organizationId={organizationId}
      target={{ ...target, platform: platform ?? undefined }}
      {...(platform && isSocialPlatform(platform) ? { platformLabel: SOCIAL_PLATFORM_LABELS[platform] } : {})}
      {...(onCaptured ? { onCaptured } : {})}
    />
  );
}
