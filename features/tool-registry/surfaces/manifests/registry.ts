/**
 * Central registry of all `SurfaceManifest` declarations.
 *
 * This file is the **single source of truth** for what runtime values each
 * surface promises to supply. Mirrored into `public.ui_surface_value` via
 * the manifest sync endpoint at `POST /api/admin/surfaces/sync-manifests`.
 *
 * Adding a new surface:
 *   1. Create `<surface-slug>.manifest.ts` in this directory (see README).
 *   2. Export a `SurfaceManifest` from it.
 *   3. Add it to `ALL_MANIFESTS` below.
 *   4. Run the manifest sync from the Surfaces admin (or hit the API).
 *
 * Removing a manifest does NOT delete its DB rows automatically — the sync
 * endpoint reports the drift and the admin chooses to apply the deletion.
 * This is intentional: code-first ownership doesn't mean code-first
 * destruction.
 */

import type { SurfaceManifest } from "@/features/tool-registry/surfaces/types";
import { notesEditorManifest } from "./notes-editor.manifest";
import { codeEditorManifest } from "./code-editor.manifest";
import { pdfWidgetsManifest } from "./pdf-widgets.manifest";
import { contentExtractorManifest } from "./content-extractor.manifest";
import { transcriptsManifest } from "./transcripts.manifest";

/** All registered surface manifests. Import order does not matter. */
export const ALL_MANIFESTS: readonly SurfaceManifest[] = [
  notesEditorManifest,
  codeEditorManifest,
  pdfWidgetsManifest,
  contentExtractorManifest,
  transcriptsManifest,
];

/** Map of `surfaceName → manifest` for O(1) lookup. */
const MANIFEST_INDEX: ReadonlyMap<string, SurfaceManifest> = new Map(
  ALL_MANIFESTS.map((m) => [m.surfaceName, m] as const),
);

/** Get a manifest by surface name. Returns `undefined` when no manifest is registered. */
export function getManifest(surfaceName: string): SurfaceManifest | undefined {
  return MANIFEST_INDEX.get(surfaceName);
}

/** All known manifests, in declaration order. */
export function getAllManifests(): readonly SurfaceManifest[] {
  return ALL_MANIFESTS;
}

/** All surface names that have a manifest declared. */
export function getRegisteredSurfaceNames(): string[] {
  return ALL_MANIFESTS.map((m) => m.surfaceName);
}

/**
 * Look up a single `SurfaceValue` by `(surfaceName, valueName)`. Useful in
 * the resolver and in mapping editors for hover-cards / autocomplete.
 */
export function getSurfaceValue(surfaceName: string, valueName: string) {
  const manifest = MANIFEST_INDEX.get(surfaceName);
  if (!manifest) return undefined;
  return manifest.values.find((v) => v.name === valueName);
}
