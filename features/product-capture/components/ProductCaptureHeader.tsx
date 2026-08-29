"use client";

/**
 * ProductCaptureHeader — the ONE shell header for the product-capture manage
 * pages. Left: an optional back chevron + a small identity title; right: the
 * page's contextual tap-buttons.
 *
 * `/all` passes NO backHref — it is the feature's hub / fallback page (the
 * capture screen's close lands here), so a back chevron would only bounce
 * between it and capture. `/item/[id]` passes `/tools/product-capture/all`,
 * its structural parent. The capture surface itself renders no shell header
 * (it is a full-screen overlay with its own chrome).
 */

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";

export function ProductCaptureHeader({
  backHref,
  title,
  right,
}: {
  /** Omit on hub pages — the chevron only renders when a structural parent exists. */
  backHref?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center">
          {backHref && <ChevronLeftTapButton href={backHref} ariaLabel="Back" />}
          <span className="truncate px-1 text-sm font-medium text-foreground">
            {title}
          </span>
        </div>
      }
      right={right}
    />
  );
}
