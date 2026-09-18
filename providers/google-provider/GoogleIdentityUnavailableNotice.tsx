"use client";

/**
 * The honest end of the bounded readiness wait (V-24 NEW-4, lane F-111).
 *
 * The sentence lives once in `googleIdentityReadiness.ts`; this is the ONE
 * component that renders it, so every Google surface says the same thing and
 * offers the same two remedies.
 */

import { CircleAlert, ExternalLink, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE,
  GOOGLE_STATUS_DASHBOARD_URL,
} from "./googleIdentityReadiness";

export interface GoogleIdentityUnavailableNoticeProps {
  /** Re-inserts the script and restarts the bound. */
  onRetry: () => void;
  /**
   * `banner` sits above a surface that still works without Google (the
   * connected-account lists read from our own server). `block` stands alone
   * where nothing else can render yet.
   */
  variant?: "banner" | "block";
  className?: string;
}

export function GoogleIdentityUnavailableNotice({
  onRetry,
  variant = "banner",
  className,
}: GoogleIdentityUnavailableNoticeProps) {
  return (
    <div
      role="alert"
      className={[
        "flex flex-col gap-2 border border-border bg-card p-3 text-sm text-foreground",
        variant === "block"
          ? "m-3 min-h-[160px] justify-center rounded-lg"
          : "rounded-none border-x-0 border-t-0",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="flex items-start gap-2">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <p className="leading-snug">{GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-6">
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <a
            href={GOOGLE_STATUS_DASHBOARD_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Open Google&apos;s status
          </a>
        </Button>
      </div>
    </div>
  );
}

export default GoogleIdentityUnavailableNotice;
