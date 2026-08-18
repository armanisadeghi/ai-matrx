"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import type { ScreenshotSlotSpec } from "../types";

/**
 * A named slot where a real screenshot will land. The image is expected at
 * `/images/source-onboarding/{providerKey}/{slot}.png` (captured by a human
 * or a signed-in agent following the gallery's SCREENSHOT_WORK_ORDERS.md —
 * every capture requires a real provider account, so no anonymous agent can
 * fill these). Until it exists, an illustrated placeholder — a faux browser
 * frame naming the step — keeps the page honest and good-looking; the moment
 * the PNG lands at the expected path, the real capture renders with zero code
 * changes.
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
      <figure className="overflow-hidden rounded-md border border-border bg-card">
        {/* Faux browser chrome — an honest illustration, never a broken image. */}
        <div
          aria-hidden
          className="flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-2"
        >
          <span className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          </span>
          <span className="h-4 flex-1 rounded-full bg-muted-foreground/10" />
        </div>
        <div className="flex flex-col items-center gap-2 bg-muted/30 px-6 py-8 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card">
            <Camera className="h-4 w-4 text-muted-foreground" />
          </span>
          <p className="max-w-sm text-xs font-medium text-foreground">
            {spec.caption}
          </p>
          <p className="text-[11px] text-muted-foreground">
            A real screenshot of this step is on its way — the instructions
            above are complete without it.
          </p>
        </div>
      </figure>
    );
  }

  return (
    <figure className="overflow-hidden rounded-md border border-border bg-card">
      {/* Static marketing asset served from /public — not user media, so the
          canonical file handler does not apply here. */}
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
