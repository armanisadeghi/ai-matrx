"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import type { ScreenshotSlotSpec } from "../types";

/**
 * A named slot where a real screenshot will land. The image is expected at
 * `/images/source-onboarding/{providerKey}/{slot}.png` (captured by a Codex
 * agent following the gallery's SCREENSHOT_WORK_ORDERS.md). Until it exists,
 * a clean placeholder names the slot — never a broken-image icon.
 */
export function ScreenshotSlot({
  providerKey,
  spec,
}: {
  providerKey: string;
  spec: ScreenshotSlotSpec;
}) {
  const [missing, setMissing] = useState(false);
  const src = `/images/source-onboarding/${providerKey}/${spec.slot}.png`;

  if (missing) {
    return (
      <figure className="overflow-hidden rounded-md border border-dashed border-border bg-muted/40">
        <div className="flex items-center gap-3 p-4">
          <Camera className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Screenshot coming: {spec.caption}
            </p>
          </div>
        </div>
      </figure>
    );
  }

  return (
    <figure className="overflow-hidden rounded-md border border-border bg-card">
      {/* Static marketing asset served from /public — not user media, so the
          canonical file handler does not apply here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={spec.caption}
        className="w-full"
        loading="lazy"
        onError={() => setMissing(true)}
      />
      <figcaption className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
        {spec.caption}
      </figcaption>
    </figure>
  );
}
