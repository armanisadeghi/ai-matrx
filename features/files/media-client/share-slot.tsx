/**
 * features/files/media-client/share-slot.tsx
 *
 * Thin, boot-safe front for the host `SharePopover` slot (M-SHARE, C19).
 * `ports.tsx` sits in the app-boot graph (MediaHostProvider mounts in
 * app/Providers.tsx), so the share body loads behind an in-gate
 * `React.lazy` edge — it fetches only when someone actually opens a share
 * popover from a package shell. ONE edge, at the gate (Fragmentation Law).
 */

"use client";

import { lazy, Suspense } from "react";
import type { MediaSharePopoverProps } from "@ai-matrx/media";

const SharePopoverImpl = lazy(() => import("./share-slot-impl"));

export function MediaSharePopoverSlot(props: MediaSharePopoverProps) {
  return (
    <Suspense fallback={null}>
      <SharePopoverImpl {...props} />
    </Suspense>
  );
}
