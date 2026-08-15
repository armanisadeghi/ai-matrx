"use client";

/**
 * SiteMediaWriteTargets — the live handler for `media_order`, the write half of
 * `matrx-user/marketing-site-media`'s Generate view.
 *
 * Mounted by `SiteMediaWorkspace` (inside its `SurfaceRuntimeProvider`, on
 * EVERY view) rather than by `GenerateMediaView`, because the workspace owns
 * the order draft: registering from the Generate view would make the target
 * disappear the moment the user looked at the crawled inventory, and applying
 * it would have to switch views mid-run — unmounting whatever else was
 * registered. The standards targets are the deliberate opposite: their draft
 * genuinely lives in `MediaStandardsView`, so they register there and are
 * offered only while that view is open.
 *
 * The handler ONLY stages the order. Generation is what costs money and mints
 * a `web.brand_asset` row, so it stays behind the user's "Order this image"
 * click — the same call `matrx-user/image-generate` makes.
 *
 * Renders nothing. Throws on bad input; the writeback runtime turns that into
 * the loud toast + the error envelope the agent reads.
 */

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { MARKETING_SITE_MEDIA_SURFACE_NAME } from "@/features/marketing/lib/scopes/site-media-scope";
import {
  validateMediaOrderWrite,
  type MediaOrderDraft,
} from "@/features/marketing/lib/site-media-write-targets";

export function SiteMediaWriteTargets({
  onOrderChange,
}: {
  /** The SAME setter the Generate view's inputs drive — never a parallel path. */
  onOrderChange: (
    updater: (current: MediaOrderDraft) => MediaOrderDraft,
  ) => void;
}) {
  useSurfaceWriteHandlers(MARKETING_SITE_MEDIA_SURFACE_NAME, {
    media_order: (value: unknown) => {
      // Validate FIRST — synchronously, so a bad shape throws where the
      // writeback seam can turn it into the agent's error envelope, never
      // inside the React updater below.
      const patch = validateMediaOrderWrite(value);
      // Then merge functionally, so two applies in one agent message compose
      // against the freshest draft instead of the second erasing the first.
      onOrderChange((current) => ({ ...current, ...patch }));
    },
  });

  return null;
}
