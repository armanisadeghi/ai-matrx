"use client";

/**
 * Where a refused read leads (GATED-CAPTURE.md §6): never a dead error. Whenever the data provider
 * could not read a page (private, restricted, blocked, down), the surface renders this with the
 * failure it caught; it says what happened in one line and offers the one hub offer
 * (Capture with my browser / Take me there).
 *
 *   <RefusedReadOffer error={err} …/>      inline, under the failing control
 *   <CaptureOfferDialog open …/>           when a row menu / toast-style surface has no room inline
 *   useRefusedRead(orgId)                  a surface that only has a catch block: `show(err, target)`
 */

import { asClause } from "@ai-matrx/kit/text";
import { useCallback, useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { describeSocialFailure } from "../failure";
import { detectPlatform } from "../link";
import { SOCIAL_PLATFORM_LABELS, isSocialPlatform } from "../types";
import { GatedCaptureOffer } from "./GatedCaptureOffer";
import type { GuidedCaptureTarget } from "./guidedApi";
import { GUIDED_CAPTURE_PLATFORMS } from "./guidedJob";

/** The platform a capture target is for: explicit, else read from the pasted link. */
function platformOf(target: GuidedCaptureTarget): string | null {
  return target.platform ?? detectPlatform(target.handleOrUrl) ?? null;
}

/** Can the person's own browser help with this failure and this target? */
export function canOfferCapture(error: unknown, target: GuidedCaptureTarget): boolean {
  const platform = platformOf(target);
  return describeSocialFailure(error).canCapture && platform !== null && GUIDED_CAPTURE_PLATFORMS.has(platform);
}

function labelOf(platform: string | null): string | undefined {
  return platform && isSocialPlatform(platform) ? SOCIAL_PLATFORM_LABELS[platform] : undefined;
}

export function RefusedReadOffer({
  organizationId,
  error,
  target,
  onCaptured,
  compact,
}: {
  organizationId: string;
  error: unknown;
  target: GuidedCaptureTarget;
  onCaptured?: () => void;
  compact?: boolean;
}) {
  if (!canOfferCapture(error, target)) return null;
  const platform = platformOf(target);
  const failure = describeSocialFailure(error);
  const label = labelOf(platform);
  return (
    <div className="flex min-w-0 flex-col gap-1" role="group" aria-label={failure.title}>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{asClause(failure.title)}.</span> {failure.reason}
      </p>
      <GatedCaptureOffer
        organizationId={organizationId}
        target={{ ...target, platform: platform ?? undefined }}
        {...(label ? { platformLabel: label } : {})}
        {...(onCaptured ? { onCaptured } : {})}
        {...(compact ? { compact: true } : {})}
      />
    </div>
  );
}

export function CaptureOfferDialog({
  open,
  onOpenChange,
  organizationId,
  target,
  error,
  onCaptured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  target: GuidedCaptureTarget;
  /** The refusal that led here, when there was one; absent when the person chose it from a menu. */
  error?: unknown;
  onCaptured?: () => void;
}) {
  const platform = platformOf(target);
  const label = labelOf(platform);
  const failure = error ? describeSocialFailure(error) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="matrx-touch-targets max-w-md">
        <DialogHeader>
          <DialogTitle>{failure ? failure.title : `Capture ${label ?? "this page"} with your browser`}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {failure ? <p className="text-sm text-muted-foreground">{failure.reason}</p> : null}
          <GatedCaptureOffer
            organizationId={organizationId}
            target={{ ...target, platform: platform ?? undefined }}
            {...(label ? { platformLabel: label } : {})}
            {...(onCaptured ? { onCaptured } : {})}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** For a surface that only has a catch block: `show(err, target)` opens the offer and returns true when it applies. */
export function useRefusedRead(organizationId: string, onCaptured?: () => void): {
  show: (error: unknown, target: GuidedCaptureTarget) => boolean;
  open: (target: GuidedCaptureTarget) => void;
  node: ReactNode;
} {
  const [state, setState] = useState<{ target: GuidedCaptureTarget; error?: unknown } | null>(null);
  const show = useCallback((error: unknown, target: GuidedCaptureTarget) => {
    if (!canOfferCapture(error, target)) return false;
    setState({ target, error });
    return true;
  }, []);
  const open = useCallback((target: GuidedCaptureTarget) => setState({ target }), []);
  const node = state ? (
    <CaptureOfferDialog
      open
      onOpenChange={(next) => (next ? undefined : setState(null))}
      organizationId={organizationId}
      target={state.target}
      {...(state.error ? { error: state.error } : {})}
      {...(onCaptured ? { onCaptured } : {})}
    />
  ) : null;
  return { show, open, node };
}
