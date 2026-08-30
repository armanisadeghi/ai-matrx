/**
 * features/files/media-client/share-slot-impl.tsx
 *
 * The configured `@ai-matrx/media/share` popover body behind the host
 * `SharePopover` slot — loaded lazily by `share-slot.tsx` so the share UI
 * graph (package body + AccessSummaryPanel) never rides the app-boot
 * ports graph. See `ports.tsx`.
 *
 * `manageLinks` is deliberately unbound here: the port slot serves package
 * shells (MediaActionToolbar / MediaLightbox) that have no dialog owner to
 * keep a ShareLinkDialog alive past the popover; the "Manage all links" row
 * hides when unbound (package contract). The block renderers' share surfaces
 * bind it via `features/files/blocks/BlockSharePopover.tsx`.
 */

"use client";

import type { ComponentType } from "react";
import type { MediaSharePopoverProps } from "@ai-matrx/media";
import { createMediaSharePopover } from "@ai-matrx/media/share";
import {
  MediaShareAccessSummary,
  mediaShareNotifier,
} from "@/features/files/blocks/BlockSharePopover";

// The slot type returns `unknown` (framework-agnostic package contract);
// narrow it to a React component for the lazy() boundary — the package's own
// shells perform the same narrowing.
const ConfiguredSharePopover = createMediaSharePopover({
  AccessSummary: MediaShareAccessSummary,
  notify: mediaShareNotifier,
  entityToken: "file",
}) as ComponentType<MediaSharePopoverProps>;

export default ConfiguredSharePopover;
