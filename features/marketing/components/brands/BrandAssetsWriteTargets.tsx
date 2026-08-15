"use client";

/**
 * BrandAssetsWriteTargets — the live handler for `media_order`, the write half
 * of `matrx-user/marketing-brand-assets`.
 *
 * Mounted by `BrandAssetsWorkspace` (inside its `SurfaceRuntimeProvider`, on
 * EVERY view) rather than by `GenerateMediaView`, because the workspace owns
 * the order draft: registering from the Generate view would make the target
 * disappear the moment the user looked at the library, and applying it would
 * have to switch views mid-run — unmounting whatever else was registered.
 *
 * The handler ONLY stages the order. Generation is what costs money and mints
 * a `web.brand_asset` row, so it stays behind the user's "Order this image"
 * click — the same call `matrx-user/image-generate` makes.
 *
 * Renders nothing. Throws on bad input; the writeback runtime turns that into
 * the loud toast + the error envelope the agent reads. Moved here from
 * `SiteMediaWriteTargets` on 2026-08-15 with the Generate view; the validation
 * core is shared, not copied.
 */

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { MARKETING_BRAND_ASSETS_SURFACE_NAME } from "@/features/marketing/lib/scopes/brand-assets-scope";
import {
  validateMediaOrderWrite,
  type MediaOrderDraft,
} from "@/features/marketing/lib/site-media-write-targets";

export function BrandAssetsWriteTargets({
  onOrderChange,
}: {
  /** The SAME setter the Generate view's inputs drive — never a parallel path. */
  onOrderChange: (
    updater: (current: MediaOrderDraft) => MediaOrderDraft,
  ) => void;
}) {
  useSurfaceWriteHandlers(MARKETING_BRAND_ASSETS_SURFACE_NAME, {
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
