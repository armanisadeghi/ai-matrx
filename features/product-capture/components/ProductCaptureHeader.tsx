"use client";

/**
 * ProductCaptureHeader — the ONE shell header for the product-capture manage
 * pages (`/tools/product-capture/all` and `.../item/[id]`). Left: back + a
 * small identity title; right: the page's contextual tap-buttons. The capture
 * surface itself renders no shell header (it is a full-screen overlay with
 * its own chrome).
 */

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

export function ProductCaptureHeader({
  backHref,
  title,
  right,
}: {
  backHref: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center">
          <ChevronLeftTapButton href={backHref} ariaLabel="Back" />
          <span className="truncate text-sm font-medium text-foreground">
            {title}
          </span>
        </div>
      }
      right={right}
    />
  );
}
