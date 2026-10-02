/**
 * features/surfaces/runtime/fetchRelatedSurfaces.ts
 *
 * Ancestry + children lookup for the Agents chrome Related section.
 * Synchronous and registry-backed: the manifest registry (`inheritsFrom`) is
 * the ONE hierarchy source for chrome — the DB `parent_surface_name` column
 * is a sync mirror, never read here. Labels come exclusively from the
 * canonical display seam (`surface-display.ts`).
 */

import {
  getManifest,
  getSurfaceAncestry,
  getSurfaceChildren,
} from "@/features/surfaces/manifests/registry";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";

export interface RelatedSurfaceRef {
  name: string;
  label: string;
  kind: "ancestor" | "child" | "self";
}

export interface RelatedSurfaces {
  self: RelatedSurfaceRef | null;
  /** Full inheritance chain, ROOT FIRST (grandparent before parent). */
  ancestry: RelatedSurfaceRef[];
  children: RelatedSurfaceRef[];
}

export function getRelatedSurfaces(surfaceName: string | null): RelatedSurfaces {
  if (!surfaceName) return { self: null, ancestry: [], children: [] };

  const self: RelatedSurfaceRef = {
    name: surfaceName,
    label: getSurfaceDisplayLabel(surfaceName),
    kind: "self",
  };

  // Manifest-less DB surfaces have no registry lineage — related is empty.
  if (!getManifest(surfaceName)) {
    return { self, ancestry: [], children: [] };
  }

  const ancestry: RelatedSurfaceRef[] = getSurfaceAncestry(surfaceName).map(
    (name) => ({
      name,
      label: getSurfaceDisplayLabel(name),
      kind: "ancestor" as const,
    }),
  );

  const children: RelatedSurfaceRef[] = getSurfaceChildren(surfaceName).map(
    (name) => ({
      name,
      label: getSurfaceDisplayLabel(name),
      kind: "child" as const,
    }),
  );

  return { self, ancestry, children };
}
