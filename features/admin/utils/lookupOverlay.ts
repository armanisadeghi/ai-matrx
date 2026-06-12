// features/admin/utils/lookupOverlay.ts
//
// Lookup helpers used by `<FeatureAdminPage>` to resolve human-readable
// metadata from the registries when rendering window-panel and overlay
// sections. The feature-admin config supplies an `overlayId`; this
// helper attaches the registry label, kind, instance mode, etc.
//
// Pure read-only — these helpers do not register anything.

import {
  ALL_WINDOW_STATIC_METADATA,
  getStaticEntryByOverlayId,
  type WindowStaticMetadata,
} from "@/features/window-panels/registry/windowRegistryMetadata";
import { OVERLAY_CATALOGUE } from "@/features/overlays/catalogue";

export interface ResolvedWindowPanel {
  overlayId: string;
  slug: string | null;
  label: string;
  kind: WindowStaticMetadata["kind"];
  instanceMode: WindowStaticMetadata["instanceMode"];
  mobilePresentation: WindowStaticMetadata["mobilePresentation"];
  deprecated?: WindowStaticMetadata["deprecated"];
}

export function resolveWindowPanel(
  overlayId: string,
): ResolvedWindowPanel | null {
  const entry = getStaticEntryByOverlayId(overlayId);
  if (!entry) return null;
  return {
    overlayId,
    slug: entry.slug,
    label: entry.label,
    kind: entry.kind,
    instanceMode: entry.instanceMode,
    mobilePresentation: entry.mobilePresentation,
    deprecated: entry.deprecated,
  };
}

export interface ResolvedOverlay {
  overlayId: string;
  label: string;
  instanceMode: "singleton" | "multi";
  isWindow: boolean;
}

export function resolveOverlay(overlayId: string): ResolvedOverlay | null {
  const entry =
    OVERLAY_CATALOGUE[overlayId as keyof typeof OVERLAY_CATALOGUE];
  if (!entry) return null;
  return {
    overlayId,
    label: entry.label,
    instanceMode: entry.instanceMode,
    isWindow: entry.isWindow,
  };
}

/**
 * For drift reporting on the admin page: return the slugs of every
 * window-panel registry entry whose slug starts with `prefix`. Lets
 * the admin page surface windows that probably belong to a feature
 * but weren't enumerated in its admin map.
 */
export function findWindowPanelsBySlugPrefix(
  prefix: string,
): WindowStaticMetadata[] {
  return ALL_WINDOW_STATIC_METADATA.filter((entry) =>
    entry.slug.startsWith(prefix),
  );
}
