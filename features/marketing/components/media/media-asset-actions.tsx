"use client";

/**
 * THE MEDIA ASSET'S ACTIONS — ONE definition of what a right-clicked
 * discovered image offers, shared by every surface that shows one.
 *
 * Census (context-menu rollout): a `SnapshotMediaAsset` (built by
 * `buildSnapshotMediaAssets`, keyed by `src` — there is no `seo`/`platform`
 * table row behind it, it is derived from crawl data) renders on
 * `MarketingMediaAssetWindow` (the detail window), `SnapshotMediaGallery`,
 * `CrawledMediaView`, `SiteMediaWorkspace` and `PageMediaCard` — five real
 * surfaces, one copy of "copy / open / order replacement / import / add to
 * library" until now.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Every item delegates to a callback the
 * host already owns — `fileHandler.upload` + `useCreateBrandAsset` stay where
 * they are (the window that first built this menu). A host missing a
 * callback marks that item `unavailable` (visible, disabled, reason as
 * tooltip) rather than silently dropping it.
 *
 * No `mediaAssetEntityRef`: the asset has no id of its own (its identity IS
 * `src`), so Attach To / Share correctly stay absent rather than offered
 * against a fabricated token — same reasoning as `adminUserMenuSection`.
 */

import {
  Copy,
  Crop,
  ExternalLink,
  FolderPlus,
  ImagePlus,
} from "lucide-react";

import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";
import {
  BRAND_ASSET_KIND_LABELS,
  BRAND_ASSET_KINDS,
  type BrandAssetKind,
} from "@/features/marketing/types";

/** The one thing every media-asset surface can say about a right-clicked image. */
export interface MediaAssetMenuRow {
  src: string;
  alt: string | null;
}

const LIBRARY_KINDS = BRAND_ASSET_KINDS.filter(
  (kind) => kind !== "color" && kind !== "font" && kind !== "video",
);

export interface MediaAssetMenuActions {
  onCopyUrl: (row: MediaAssetMenuRow) => void;
  onOrderReplacement?: (row: MediaAssetMenuRow) => void;
  onImportAndEdit?: (row: MediaAssetMenuRow) => void;
  onAddToLibrary?: (row: MediaAssetMenuRow, kind: BrandAssetKind) => void;
}

export function mediaAssetMenuSection(
  row: MediaAssetMenuRow | null,
  actions: MediaAssetMenuActions,
  opts?: {
    label?: string;
    /** THE CONSISTENCY STEP — see `features/context-menu-v3/utils/availability.ts`. */
    unavailable?: AvailabilityMap;
  },
): ContextMenuExtraSection {
  const withRow =
    (fn: (row: MediaAssetMenuRow) => void) => () => {
      if (row) fn(row);
    };

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "media-copy-url",
      label: "Copy URL",
      icon: Copy,
      onSelect: withRow(actions.onCopyUrl),
      disabled: !row,
    },
    {
      kind: "link",
      id: "media-open-original",
      label: "Open original",
      icon: ExternalLink,
      href: row?.src ?? "#",
      disabled: !row,
    },
    {
      kind: "item",
      id: "media-order-replacement",
      label: "Order replacement",
      icon: ImagePlus,
      onSelect: actions.onOrderReplacement
        ? withRow(actions.onOrderReplacement)
        : () => undefined,
      disabled: !row || !actions.onOrderReplacement,
    },
    {
      kind: "item",
      id: "media-import-edit",
      label: "Import & edit",
      icon: Crop,
      onSelect: actions.onImportAndEdit
        ? withRow(actions.onImportAndEdit)
        : () => undefined,
      disabled: !row || !actions.onImportAndEdit,
    },
    {
      kind: "submenu",
      id: "media-add-library",
      label: "Add to library",
      icon: FolderPlus,
      children: LIBRARY_KINDS.map((kind) => ({
        kind: "item" as const,
        id: `media-add-library-${kind}`,
        label: BRAND_ASSET_KIND_LABELS[kind],
        onSelect:
          actions.onAddToLibrary && row
            ? () => actions.onAddToLibrary!(row, kind)
            : () => undefined,
        disabled: !row || !actions.onAddToLibrary,
      })),
    },
  ];

  return withAvailability(
    {
      id: "media-asset-actions",
      label: opts?.label ?? "Image",
      icon: ImagePlus,
      items,
    },
    opts?.unavailable,
  );
}
