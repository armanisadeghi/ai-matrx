/**
 * features/files/media-client/share-slot-impl.tsx
 *
 * The configured `@ai-matrx/media/share` popover body behind the host
 * `SharePopover` slot — loaded lazily by `share-slot.tsx` so the share UI
 * graph (package body + AccessSummaryPanel) never rides the app-boot
 * ports graph. See `ports.tsx`.
 *
 * `manageLinks` dispatches to the app-level ShareLinkDialog overlay. That
 * durable owner survives this transient package popover closing, so toolbar
 * and lightbox shells expose the same complete link-management path as the
 * block renderers.
 */

"use client";

import { useCallback } from "react";
import type {
  MediaActionContext,
  MediaSharePopoverProps,
} from "@ai-matrx/media";
import { MediaSharePopover } from "@ai-matrx/media/share";
import {
  MediaShareAccessSummary,
  mediaShareNotifier,
} from "@/features/files/blocks/BlockSharePopover";
import { useOpenShareLinkDialog } from "@/features/overlays/openers/shareLinkDialog";

function fileIdOf(context: MediaActionContext): string | null {
  return typeof context.ref === "string"
    ? null
    : (context.ref.file_id ?? null);
}

function ConfiguredSharePopover(props: MediaSharePopoverProps) {
  const openShareLinkDialog = useOpenShareLinkDialog();
  const manageLinks = useCallback(
    (context: MediaActionContext) => {
      const resourceId = fileIdOf(context);
      if (resourceId) openShareLinkDialog({ resourceId });
    },
    [openShareLinkDialog],
  );

  return (
    <MediaSharePopover
      context={props.context}
      onClose={props.onClose}
      manageLinks={manageLinks}
      AccessSummary={MediaShareAccessSummary}
      notify={mediaShareNotifier}
      entityToken="file"
    />
  );
}

export default ConfiguredSharePopover;
